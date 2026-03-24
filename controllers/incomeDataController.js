/**
 * Income Data Controller
 * Handles monthly/annual income data based on profile filing preference
 */

const TaxableProfile = require('../models/TaxableProfile');
const IncomeData = require('../models/IncomeData');

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

  const getMonthValues = (month) => {
    if (monthlyMap instanceof Map) return monthlyMap.get(String(month)) || [];
    return monthlyMap[String(month)] || [];
  };

  for (let month = 1; month <= 12; month++) {
    const values = getMonthValues(month);
    monthArrays[month - 1] = Array.isArray(values) ? values : [];
  }
  return monthArrays;
}

/**
 * Update monthly income data for a profile
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
 * Upsert one month income entries for a profile
 * PUT /api/taxableprofile/web/:profileId/income-data/monthly/:month
 */
const upsertMonthlyIncomeMonth = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId, month } = req.params;
    const monthNum = Number(month);
    const { incomes } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: 'month must be an integer from 1 to 12' });
    }
    if (!Array.isArray(incomes)) {
      return res.status(400).json({ success: false, message: 'incomes must be an array of income objects for the month' });
    }

    const profile = await getOwnedProfile(userId, profileId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const normalizedMonthIncomes = incomes.map(normalizeIncomeObject);
    profile.filingPreference = 'monthly';
    await profile.save();

    const incomeData = await getOrCreateIncomeData({ profile, userId, filingPreference: 'monthly' });
    incomeData.annualIncomes = [];
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
 * Update annual income data for a profile
 * PUT /api/taxableprofile/web/:profileId/income-data/annual
 */
const updateIncomeDataAnnual = async (req, res) => {
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

    if (!Array.isArray(incomes)) {
      return res.status(400).json({
        success: false,
        message: 'For annual filing, incomes must be an array of objects'
      });
    }

    const normalizedIncomes = normalizeAnnualIncomes(incomes);

    profile.filingPreference = 'annual';
    await profile.save();
    const incomeData = await getOrCreateIncomeData({ profile, userId, filingPreference: 'annual' });
    incomeData.monthlyIncomes = new Map();
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
      message: 'An error occurred while saving annual income data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get income data for a profile
 * GET /api/taxableprofile/web/:profileId/income-data
 */
const getIncomeData = async (req, res) => {
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

    const incomeData = await IncomeData.findOne({
      profileId: profile._id,
      year: profile.year
    });

    if (!incomeData) {
      return res.status(200).json({
        success: true,
        data: {
          profileId: profile.profileId,
          year: profile.year,
          filingPreference: profile.filingPreference || null,
          incomes: profile.filingPreference === 'monthly' ? [[], [], [], [], [], [], [], [], [], [], [], []] : []
        }
      });
    }

    const monthlyIncomes = monthlyMapToArray(incomeData.monthlyIncomes);
    const annualIncomes = Array.isArray(incomeData.annualIncomes) ? incomeData.annualIncomes : [];
    const incomes = incomeData.filingPreference === 'monthly' ? monthlyIncomes : annualIncomes;

    res.status(200).json({
      success: true,
      data: {
        profileId: profile.profileId,
        year: profile.year,
        filingPreference: incomeData.filingPreference,
        incomes
      }
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