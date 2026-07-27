/**
 * Income Data Controller
 * Individual PIT web UI uses a blob shape: { income, deductions, documents }.
 * Legacy array shape is still readable for older WhatsApp/web data.
 */

const TaxableProfile = require('../models/TaxableProfile');
const IncomeData = require('../models/IncomeData');
const Deduction = require('../models/Deduction');
const {
  normalizePitBlob,
  extractPitBlob,
  wrapBlobForStorage,
  getMonthEntries,
  aggregateAnnualFromMonthly,
  formatMonthResponse,
  computeFromBlob,
  DEDUCTION_TYPE_MAP,
  toNum,
  isPitBlob
} = require('../utils/pitIncomeHelpers');
const { calculateRentRelief, calculateIndividualTax } = require('../utils/taxCalculator');

async function getOwnedProfile(userId, profileId) {
  if (!userId) return null;
  return TaxableProfile.findByProfileIdOrId(profileId, userId);
}

async function getOrCreateIncomeData({ profile, userId, filingPreference }) {
  let incomeData = await IncomeData.findOne({
    profileId: profile._id,
    year: profile.year
  });

  if (!incomeData) {
    incomeData = new IncomeData({
      profileId: profile._id,
      userId,
      year: profile.year,
      filingPreference
    });
  }

  if (filingPreference) {
    incomeData.filingPreference = filingPreference;
  }

  return incomeData;
}

function normalizeIncomeObject(income) {
  if (!income || typeof income !== 'object' || Array.isArray(income)) return income;
  return {
    ...income,
    documentUrl: income.documentUrl ?? null
  };
}

function normalizeMonthlyIncomes(incomes) {
  return incomes.map((monthEntries) => monthEntries.map(normalizeIncomeObject));
}

function normalizeAnnualIncomes(incomes) {
  return incomes.map(normalizeIncomeObject);
}

function monthlyMapToArray(monthlyMap) {
  const monthArrays = [[], [], [], [], [], [], [], [], [], [], [], []];
  if (!monthlyMap) return monthArrays;

  for (let month = 1; month <= 12; month++) {
    const values = getMonthEntries(monthlyMap, month);
    monthArrays[month - 1] = Array.isArray(values) ? values : (values ? [values] : []);
  }
  return monthArrays;
}

function isPitBlobRequest(body) {
  return body && typeof body.income === 'object' && body.income !== null && !Array.isArray(body.income);
}

/**
 * Upsert Deduction rows from a PIT blob so /api/deductions + calculate stay in sync.
 */
async function syncDeductionsFromBlob({ profile, year, frequency, month, deductions, documents }) {
  if (!deductions || typeof deductions !== 'object') return;

  const docs = documents || {};
  const documentByType = {
    rent_relief: docs.rentUrl || null,
    insurance: docs.healthUrl || null,
    pension: docs.pensionUrl || null,
    mortgage: docs.mortgageUrl || null
  };

  for (const [field, deductionType] of Object.entries(DEDUCTION_TYPE_MAP)) {
    if (deductions[field] === undefined) continue;
    const amount = toNum(deductions[field]);

    const filter = {
      profileId: profile._id,
      deductionType,
      'period.year': year,
      frequency
    };
    if (frequency === 'monthly') {
      filter.month = month;
    } else {
      filter.$or = [{ month: null }, { month: { $exists: false } }];
    }

    const existing = await Deduction.findOne(filter);
    const payload = {
      profileId: profile._id,
      deductionType,
      amount,
      frequency,
      month: frequency === 'monthly' ? month : undefined,
      period: { year },
      documentUrl: documentByType[deductionType] || undefined,
      status: 'pending'
    };

    if (deductionType === 'rent_relief') {
      const annualRent = frequency === 'monthly' ? amount * 12 : amount;
      payload.rentRelief = {
        annualRent,
        reliefAmount: calculateRentRelief(annualRent),
        autoCalculated: true
      };
    }

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
    } else if (amount > 0 || deductions[field] !== undefined) {
      await Deduction.create(payload);
    }
  }
}

/**
 * Update monthly income data for a profile (legacy: 12 month arrays)
 * PUT /api/taxableprofile/web/:profileId/income-data/monthly
 */
const updateIncomeDataMonthly = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const { incomes } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!incomes) {
      return res.status(400).json({
        success: false,
        message: 'incomes field is required'
      });
    }

    const profile = await getOwnedProfile(userId, profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    if (!Array.isArray(incomes) || incomes.length !== 12) {
      return res.status(400).json({
        success: false,
        message: 'For monthly filing, incomes must be an array with 12 month arrays'
      });
    }

    for (let i = 0; i < incomes.length; i++) {
      if (!Array.isArray(incomes[i])) {
        return res.status(400).json({
          success: false,
          message: `Month ${i + 1} must be an array of income objects`
        });
      }
    }

    const normalizedIncomes = normalizeMonthlyIncomes(incomes);

    profile.filingPreference = 'monthly';
    await profile.save();
    const incomeData = await getOrCreateIncomeData({ profile, userId, filingPreference: 'monthly' });
    incomeData.annualIncomes = [];
    for (let month = 1; month <= 12; month++) {
      incomeData.monthlyIncomes.set(String(month), normalizedIncomes[month - 1]);
    }
    await incomeData.save();

    res.status(200).json({
      success: true,
      message: 'Monthly income data saved successfully',
      data: {
        profileId: profile.profileId,
        year: profile.year,
        filingPreference: 'monthly',
        incomes: normalizedIncomes
      }
    });
  } catch (error) {
    console.error('Update income data error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving income data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Upsert one month for Individual PIT UI
 * PUT /api/taxableprofile/web/:profileId/income-data/monthly/:month
 * Body (preferred): { year?, income, deductions?, documents?, markRecorded? }
 * Body (legacy): { incomes: [...] }
 */
const upsertMonthlyIncomeMonth = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId, month } = req.params;
    const monthNum = Number(month);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: 'month must be an integer from 1 to 12' });
    }

    const profile = await getOwnedProfile(userId, profileId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const year = req.body.year ? Number(req.body.year) : profile.year;
    if (year && year !== profile.year) {
      return res.status(400).json({
        success: false,
        message: `year must match profile year (${profile.year})`
      });
    }

    profile.filingPreference = 'monthly';
    await profile.save();

    const incomeData = await getOrCreateIncomeData({ profile, userId, filingPreference: 'monthly' });
    incomeData.annualIncomes = [];

    // Preferred PIT blob shape
    if (isPitBlobRequest(req.body)) {
      const blob = normalizePitBlob(req.body);
      incomeData.monthlyIncomes.set(String(monthNum), wrapBlobForStorage(blob));
      await incomeData.save();

      await syncDeductionsFromBlob({
        profile,
        year: profile.year,
        frequency: 'monthly',
        month: monthNum,
        deductions: blob.deductions,
        documents: blob.documents
      });

      return res.status(200).json({
        success: true,
        message: 'Monthly income data saved',
        data: {
          profileId: profile.profileId,
          year: profile.year,
          month: monthNum,
          recorded: blob.recorded,
          income: blob.income,
          deductions: blob.deductions,
          documents: blob.documents,
          computed: blob.computed
        }
      });
    }

    // Legacy: array of income objects for the month
    const { incomes } = req.body;
    if (!Array.isArray(incomes)) {
      return res.status(400).json({
        success: false,
        message: 'Provide income blob ({ income, deductions, documents }) or incomes array'
      });
    }

    const normalizedMonthIncomes = incomes.map(normalizeIncomeObject);
    incomeData.monthlyIncomes.set(String(monthNum), normalizedMonthIncomes);
    await incomeData.save();

    return res.status(200).json({
      success: true,
      message: `Month ${monthNum} income data saved successfully`,
      data: {
        profileId: profile.profileId,
        year: profile.year,
        filingPreference: 'monthly',
        month: monthNum,
        incomes: normalizedMonthIncomes
      }
    });
  } catch (error) {
    console.error('Upsert monthly month income data error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while saving month income data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update annual income data
 * PUT /api/taxableprofile/web/:profileId/income-data/annual
 * Body (preferred): { year?, income, deductions?, documents? }
 * Body (legacy): { incomes: [...] }
 */
const updateIncomeDataAnnual = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const profile = await getOwnedProfile(userId, profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const year = req.body.year ? Number(req.body.year) : profile.year;
    if (year && year !== profile.year) {
      return res.status(400).json({
        success: false,
        message: `year must match profile year (${profile.year})`
      });
    }

    profile.filingPreference = 'annual';
    await profile.save();
    const incomeData = await getOrCreateIncomeData({ profile, userId, filingPreference: 'annual' });
    incomeData.monthlyIncomes = new Map();

    if (isPitBlobRequest(req.body)) {
      const blob = normalizePitBlob({ ...req.body, markRecorded: true });
      incomeData.annualIncomes = wrapBlobForStorage(blob);
      await incomeData.save();

      await syncDeductionsFromBlob({
        profile,
        year: profile.year,
        frequency: 'annual',
        month: null,
        deductions: blob.deductions,
        documents: blob.documents
      });

      const rentRelief = calculateRentRelief(toNum(blob.deductions.rent));
      const deductibleAmounts =
        toNum(blob.deductions.healthInsurance) +
        toNum(blob.deductions.pension) +
        toNum(blob.deductions.mortgageInterest) +
        rentRelief;
      const taxableIncome = Math.max(0, blob.computed.grossIncome - deductibleAmounts);
      const taxResult = calculateIndividualTax(taxableIncome);

      return res.status(200).json({
        success: true,
        message: 'Annual income data saved',
        data: {
          profileId: profile.profileId,
          year: profile.year,
          income: blob.income,
          deductions: blob.deductions,
          documents: blob.documents,
          computed: {
            ...blob.computed,
            rentRelief,
            taxableIncome,
            estimatedAnnualTax: taxResult.totalTax,
            estimatedMonthlyTax: taxResult.totalTax / 12
          }
        }
      });
    }

    const { incomes } = req.body;
    if (!incomes) {
      return res.status(400).json({
        success: false,
        message: 'Provide income blob ({ income, deductions, documents }) or incomes array'
      });
    }

    if (!Array.isArray(incomes)) {
      return res.status(400).json({
        success: false,
        message: 'For annual filing, incomes must be an array of objects'
      });
    }

    const normalizedIncomes = normalizeAnnualIncomes(incomes);
    incomeData.annualIncomes = normalizedIncomes;
    await incomeData.save();

    res.status(200).json({
      success: true,
      message: 'Annual income data saved successfully',
      data: {
        profileId: profile.profileId,
        year: profile.year,
        filingPreference: 'annual',
        incomes: normalizedIncomes
      }
    });
  } catch (error) {
    console.error('Update annual income data error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving income data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get income data for a profile (PIT UI shape)
 * GET /api/taxableprofile/web/:profileId/income-data?year=2026
 */
const getIncomeData = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const yearQuery = req.query.year ? Number(req.query.year) : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const profile = await getOwnedProfile(userId, profileId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const year = yearQuery || profile.year;
    if (yearQuery && yearQuery !== profile.year) {
      return res.status(400).json({
        success: false,
        message: `year must match profile year (${profile.year})`
      });
    }

    const incomeData = await IncomeData.findOne({
      profileId: profile._id,
      year
    });

    const filingPreference = incomeData?.filingPreference || profile.filingPreference || null;

    if (!incomeData) {
      return res.status(200).json({
        success: true,
        data: {
          profileId: profile.profileId,
          year,
          filingPreference,
          months: Array.from({ length: 12 }, (_, i) => formatMonthResponse(i + 1, null)),
          annual: {
            income: {},
            deductions: {},
            computed: {
              grossIncome: 0,
              totalDeductions: 0,
              taxableIncome: 0,
              estimatedAnnualTax: 0,
              estimatedMonthlyTax: 0
            }
          }
        }
      });
    }

    // Build months (prefer pit blobs; fall back to empty recorded=false)
    const months = [];
    const monthBlobs = [];
    for (let m = 1; m <= 12; m++) {
      const entries = getMonthEntries(incomeData.monthlyIncomes, m);
      const blob = extractPitBlob(entries);
      monthBlobs.push(blob);
      months.push(formatMonthResponse(m, blob));
    }

    // Annual: stored blob or rollup from monthly
    let annualBlob = extractPitBlob(incomeData.annualIncomes);
    if (!annualBlob) {
      const recordedBlobs = monthBlobs.filter(Boolean);
      if (recordedBlobs.length) {
        annualBlob = {
          format: 'pit_v1',
          ...aggregateAnnualFromMonthly(recordedBlobs)
        };
      }
    }

    const annualIncome = annualBlob?.income || {};
    const annualDeductions = annualBlob?.deductions || {};
    const annualComputedBase = annualBlob?.computed || computeFromBlob(annualIncome, annualDeductions);
    const rentRelief = calculateRentRelief(toNum(annualDeductions.rent));
    const deductibleAmounts =
      toNum(annualDeductions.healthInsurance) +
      toNum(annualDeductions.pension) +
      toNum(annualDeductions.mortgageInterest) +
      rentRelief;
    const taxableIncome = Math.max(0, annualComputedBase.grossIncome - deductibleAmounts);
    const taxResult = calculateIndividualTax(taxableIncome);

    // If no pit blobs at all, also return legacy incomes for older clients
    const hasAnyPitBlob = monthBlobs.some(Boolean) || isPitBlob(extractPitBlob(incomeData.annualIncomes));
    const responseData = {
      profileId: profile.profileId,
      year,
      filingPreference,
      months,
      annual: {
        income: annualIncome,
        deductions: annualDeductions,
        documents: annualBlob?.documents || {},
        computed: {
          ...annualComputedBase,
          rentRelief,
          taxableIncome,
          estimatedAnnualTax: taxResult.totalTax,
          estimatedMonthlyTax: taxResult.totalTax / 12
        }
      }
    };

    if (!hasAnyPitBlob) {
      const monthlyIncomes = monthlyMapToArray(incomeData.monthlyIncomes);
      const annualIncomes = Array.isArray(incomeData.annualIncomes) ? incomeData.annualIncomes : [];
      responseData.incomes = filingPreference === 'monthly' ? monthlyIncomes : annualIncomes;
    }

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get income data error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving income data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  updateIncomeDataMonthly,
  upsertMonthlyIncomeMonth,
  updateIncomeDataAnnual,
  getIncomeData
};
