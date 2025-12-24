/**
 * Seed Tax Tips
 * Populates the database with reference tax tips
 * Run this once to initialize reference data
 */

const TaxTip = require('../models/TaxTip');

const referenceTips = [
  // Exemption Tips
  {
    tipCategory: 'exemption',
    title: 'Tax Exemption Threshold',
    description: 'If your annual income is ₦800,000 or less, you are completely exempt from personal income tax under the 2026 Tax Reform.',
    priority: 10,
    tags: ['exemption', 'threshold', '2026-reform'],
    keywords: ['exemption', 'threshold', '800000', 'tax-free']
  },
  {
    tipCategory: 'exemption',
    title: 'Stay Below Exemption Threshold',
    description: 'If you\'re close to the ₦800,000 exemption threshold, consider maximizing your tax-deductible expenses to potentially stay below the threshold.',
    priority: 8,
    tags: ['exemption', 'optimization', 'deductions'],
    keywords: ['exemption', 'threshold', 'deductions', 'optimization']
  },

  // Deduction Tips
  {
    tipCategory: 'deductions',
    title: 'Medical Expenses Are Deductible',
    description: 'Medical expenses, including hospital bills, pharmacy purchases, and health insurance premiums, may be tax-deductible. Keep receipts for all medical expenses.',
    priority: 9,
    tags: ['deductions', 'medical', 'healthcare'],
    keywords: ['medical', 'healthcare', 'hospital', 'pharmacy', 'deductible']
  },
  {
    tipCategory: 'deductions',
    title: 'Professional Development Deductions',
    description: 'Training courses, professional certifications, and educational expenses related to your work may be tax-deductible. Document all professional development expenses.',
    priority: 8,
    tags: ['deductions', 'education', 'training', 'professional'],
    keywords: ['training', 'education', 'course', 'certification', 'professional']
  },
  {
    tipCategory: 'deductions',
    title: 'Charitable Donations',
    description: 'Donations to registered charities and NGOs may be tax-deductible. Ensure you have proper documentation and receipts for all charitable contributions.',
    priority: 7,
    tags: ['deductions', 'charity', 'donations'],
    keywords: ['charity', 'donation', 'ngo', 'charitable']
  },
  {
    tipCategory: 'deductions',
    title: 'Business Expenses for Self-Employed',
    description: 'If you\'re self-employed, business-related expenses such as office supplies, equipment, internet, and phone bills may be tax-deductible.',
    priority: 9,
    tags: ['deductions', 'business', 'self-employed'],
    keywords: ['business', 'self-employed', 'office', 'equipment', 'supplies']
  },

  // Compliance Tips
  {
    tipCategory: 'compliance',
    title: 'Tax Identification Number (TIN)',
    description: 'A TIN is now required for various financial transactions under the 2026 Tax Reform. Make sure you have a valid TIN and keep it updated in your profile.',
    priority: 10,
    tags: ['compliance', 'tin', '2026-reform'],
    keywords: ['tin', 'tax identification number', 'compliance', 'required']
  },
  {
    tipCategory: 'compliance',
    title: 'Keep Detailed Records',
    description: 'Maintain detailed descriptions for all transactions. Clear transaction descriptions help during tax filing and can support deduction claims if audited.',
    priority: 9,
    tags: ['compliance', 'records', 'documentation'],
    keywords: ['records', 'documentation', 'descriptions', 'audit']
  },
  {
    tipCategory: 'compliance',
    title: 'File Tax Returns on Time',
    description: 'Ensure you file your tax returns before the deadline. Late filing may result in penalties. Keep track of important tax deadlines.',
    priority: 8,
    tags: ['compliance', 'filing', 'deadlines'],
    keywords: ['filing', 'deadline', 'returns', 'penalties']
  },

  // Tax Bracket Tips
  {
    tipCategory: 'tax_bracket',
    title: '15% Tax Bracket Optimization',
    description: 'If you\'re in the 15% tax bracket (₦800,001 - ₦1,500,000), focus on maximizing deductions to reduce your taxable income and potentially lower your effective tax rate.',
    priority: 7,
    tags: ['tax_bracket', 'optimization', '15-percent'],
    keywords: ['15%', 'bracket', 'optimization', 'deductions']
  },
  {
    tipCategory: 'tax_bracket',
    title: '25% Tax Bracket Strategies',
    description: 'If you\'re in the 25% tax bracket (above ₦1,500,000), every deduction becomes more valuable. Maximize all available deductions including business expenses, medical expenses, and charitable donations.',
    priority: 8,
    tags: ['tax_bracket', 'optimization', '25-percent', 'high-income'],
    keywords: ['25%', 'bracket', 'high income', 'strategies', 'deductions']
  },

  // Optimization Tips
  {
    tipCategory: 'optimization',
    title: 'VAT-Exempt Categories',
    description: 'Food, healthcare, education, residential rent, and public transport are VAT-exempt. When possible, choose VAT-exempt alternatives to reduce your overall tax burden.',
    priority: 7,
    tags: ['optimization', 'vat', 'exempt'],
    keywords: ['vat', 'exempt', 'food', 'healthcare', 'education', 'rent']
  },
  {
    tipCategory: 'optimization',
    title: 'Track Business Expenses',
    description: 'If you\'re self-employed or have business income, track all business-related expenses meticulously. These can significantly reduce your taxable income.',
    priority: 8,
    tags: ['optimization', 'business', 'expenses', 'tracking'],
    keywords: ['business', 'expenses', 'tracking', 'self-employed']
  },

  // Data Quality Tips
  {
    tipCategory: 'data_quality',
    title: 'Add Clear Transaction Descriptions',
    description: 'Transactions with clear, detailed descriptions are easier to categorize and can help identify tax-deductible expenses. Avoid generic descriptions like "payment" or "transfer".',
    priority: 9,
    tags: ['data_quality', 'descriptions', 'categorization'],
    keywords: ['descriptions', 'categorization', 'clarity', 'details']
  },
  {
    tipCategory: 'data_quality',
    title: 'Review and Correct Categorizations',
    description: 'Regularly review your transaction categorizations. Incorrect categories can lead to missed deductions or incorrect tax calculations.',
    priority: 7,
    tags: ['data_quality', 'review', 'categorization'],
    keywords: ['review', 'categorization', 'accuracy', 'corrections']
  },

  // General Tips
  {
    tipCategory: 'general',
    title: 'Plan Ahead for Tax Season',
    description: 'Don\'t wait until tax season to organize your finances. Track your income and expenses throughout the year to make tax filing easier and more accurate.',
    priority: 8,
    tags: ['general', 'planning', 'organization'],
    keywords: ['planning', 'organization', 'preparation', 'tax season']
  },
  {
    tipCategory: 'general',
    title: 'Use Taxable for Year-Round Monitoring',
    description: 'Use Taxable to monitor your tax liability throughout the year. Weekly and monthly reports help you stay on top of your tax obligations and make informed financial decisions.',
    priority: 6,
    tags: ['general', 'monitoring', 'reports'],
    keywords: ['monitoring', 'reports', 'year-round', 'tracking']
  }
];

/**
 * Seed tax tips into database
 * @returns {Promise<Object>} Seeding result
 */
const seedTaxTips = async () => {
  try {
    // Check if tips already exist
    const existingCount = await TaxTip.countDocuments();
    
    if (existingCount > 0) {
      console.log(`Tax tips already exist (${existingCount} tips). Skipping seed.`);
      return {
        success: true,
        message: 'Tax tips already seeded',
        count: existingCount
      };
    }

    // Insert tips
    const result = await TaxTip.insertMany(referenceTips);
    
    console.log(`Successfully seeded ${result.length} tax tips.`);
    
    return {
      success: true,
      message: `Successfully seeded ${result.length} tax tips`,
      count: result.length
    };
  } catch (error) {
    console.error('Error seeding tax tips:', error);
    throw error;
  }
};

/**
 * Clear all tax tips (use with caution)
 * @returns {Promise<Object>} Deletion result
 */
const clearTaxTips = async () => {
  try {
    const result = await TaxTip.deleteMany({});
    console.log(`Deleted ${result.deletedCount} tax tips.`);
    return {
      success: true,
      message: `Deleted ${result.deletedCount} tax tips`,
      count: result.deletedCount
    };
  } catch (error) {
    console.error('Error clearing tax tips:', error);
    throw error;
  }
};

// If run directly, seed the tips
if (require.main === module) {
  const mongoose = require('mongoose');
  require('dotenv').config();
  
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB');
      return seedTaxTips();
    })
    .then((result) => {
      console.log(result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = {
  seedTaxTips,
  clearTaxTips,
  referenceTips
};

