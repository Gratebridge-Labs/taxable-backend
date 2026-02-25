const express = require('express');
const router = express.Router();
const { estimateTaxFromAnnualIncome } = require('../utils/taxCalculator');

/**
 * GET /api/tax/estimate-sample
 * Returns sample tax estimates for a few income levels (for testing/demo).
 */
router.get('/estimate-sample', (req, res) => {
  const samples = [500000, 800000, 1000000, 2000000, 5000000, 10000000];
  const results = samples.map((income) => {
    const e = estimateTaxFromAnnualIncome(income);
    return {
      annualIncome: income,
      annualIncomeFormatted: `₦${income.toLocaleString()}`,
      totalTax: e.totalTax,
      totalTaxFormatted: `₦${e.totalTax.toLocaleString()}`,
      effectiveRatePercent: Math.round(e.effectiveRatePercent * 100) / 100
    };
  });
  res.json({
    success: true,
    message: 'Sample tax estimates (Nigeria PAYE-style brackets: 0% up to ₦800k, then 15%, 18%, etc.)',
    data: { samples: results }
  });
});

/**
 * GET /api/tax/estimate?income=2000000
 * Returns tax estimate for a given annual income (in Naira).
 */
router.get('/estimate', (req, res) => {
  const income = Number(req.query.income);
  if (!Number.isFinite(income) || income < 0) {
    return res.status(400).json({
      success: false,
      message: 'Query param "income" must be a non-negative number (e.g. ?income=2000000)'
    });
  }
  const e = estimateTaxFromAnnualIncome(income);
  res.json({
    success: true,
    data: {
      annualIncome: income,
      annualIncomeFormatted: `₦${income.toLocaleString()}`,
      totalTax: e.totalTax,
      totalTaxFormatted: `₦${e.totalTax.toLocaleString()}`,
      effectiveRatePercent: Math.round(e.effectiveRatePercent * 100) / 100,
      breakdown: e.breakdown
    }
  });
});

module.exports = router;
