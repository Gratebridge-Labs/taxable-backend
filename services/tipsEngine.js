/**
 * Tips Engine Service
 * Generates personalized tax tips and suggestions based on user data
 * 
 * IMPORTANT: Transaction descriptions/narrations are crucial for generating
 * accurate and relevant tips. Always analyze transaction descriptions to
 * provide context-aware suggestions.
 */

const TAX_CONSTANTS = require('../config/constants');

class TipsEngine {
  /**
   * Generate personalized tips based on user's financial data
   * @param {Object} userData - User's financial data
   * @param {Array} transactions - Array of transactions with descriptions
   * @param {Object} taxProfile - User's tax profile
   * @returns {Array} Array of tip objects
   */
  generatePersonalizedTips(userData, transactions = [], taxProfile = {}) {
    const tips = [];

    // Analyze transactions for description-based insights
    const descriptionInsights = this.analyzeTransactionDescriptions(transactions);
    
    // Income-based tips
    tips.push(...this.getIncomeBasedTips(taxProfile, descriptionInsights));

    // Deduction-based tips
    tips.push(...this.getDeductionTips(transactions, descriptionInsights));

    // Compliance tips
    tips.push(...this.getComplianceTips(userData));

    // Expense optimization tips
    tips.push(...this.getExpenseOptimizationTips(transactions, descriptionInsights));

    // Sort by priority
    return tips.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Analyze transaction descriptions/narrations for insights
   * This is crucial for generating relevant tips
   */
  analyzeTransactionDescriptions(transactions) {
    const insights = {
      unclearDescriptions: [],
      potentialDeductions: [],
      vatExemptItems: [],
      businessExpenses: [],
      missingCategories: []
    };

    transactions.forEach(transaction => {
      const description = (transaction.description || transaction.narration || '').toLowerCase();
      
      // Check for unclear or generic descriptions
      if (!description || description.length < 5 || 
          ['transfer', 'payment', 'debit', 'credit', 'transaction'].includes(description)) {
        insights.unclearDescriptions.push({
          transactionId: transaction._id,
          description: transaction.description || transaction.narration,
          suggestion: 'Add more specific description for better categorization'
        });
      }

      // Identify potential tax-deductible items from descriptions
      const deductibleKeywords = [
        'medical', 'hospital', 'pharmacy', 'doctor',
        'training', 'course', 'education', 'seminar',
        'charity', 'donation', 'ngo',
        'professional', 'certification', 'license'
      ];

      deductibleKeywords.forEach(keyword => {
        if (description.includes(keyword) && !transaction.isTaxDeductible) {
          insights.potentialDeductions.push({
            transactionId: transaction._id,
            description: transaction.description || transaction.narration,
            category: this.inferCategoryFromDescription(description),
            suggestion: `This ${keyword} expense may be tax-deductible`
          });
        }
      });

      // Identify VAT-exempt items
      TAX_CONSTANTS.VAT.EXEMPT_CATEGORIES.forEach(category => {
        if (description.includes(category.replace('_', ' ')) && transaction.vatApplicable) {
          insights.vatExemptItems.push({
            transactionId: transaction._id,
            description: transaction.description || transaction.narration,
            category,
            suggestion: `This ${category} expense should be VAT-exempt`
          });
        }
      });

      // Identify business expenses from descriptions
      const businessKeywords = ['office', 'equipment', 'supplies', 'software', 'subscription', 'internet', 'phone'];
      businessKeywords.forEach(keyword => {
        if (description.includes(keyword) && transaction.category !== 'business_expenses') {
          insights.businessExpenses.push({
            transactionId: transaction._id,
            description: transaction.description || transaction.narration,
            suggestion: 'This may qualify as a business expense'
          });
        }
      });
    });

    return insights;
  }

  /**
   * Infer category from transaction description
   */
  inferCategoryFromDescription(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('medical') || desc.includes('hospital') || desc.includes('pharmacy')) {
      return 'healthcare';
    }
    if (desc.includes('school') || desc.includes('education') || desc.includes('training')) {
      return 'education';
    }
    if (desc.includes('rent') || desc.includes('accommodation')) {
      return 'rent';
    }
    if (desc.includes('transport') || desc.includes('uber') || desc.includes('taxi') || desc.includes('bus')) {
      return 'transportation';
    }
    if (desc.includes('food') || desc.includes('restaurant') || desc.includes('grocery')) {
      return 'food';
    }
    
    return 'other_expenses';
  }

  /**
   * Get income-based tips
   */
  getIncomeBasedTips(taxProfile, descriptionInsights) {
    const tips = [];
    const annualIncome = taxProfile.annualIncomeEstimate || 0;

    // Exemption threshold tip
    if (annualIncome <= TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD) {
      tips.push({
        category: 'exemption',
        title: 'You are exempt from personal income tax!',
        description: `Your estimated annual income of ₦${annualIncome.toLocaleString()} is below the ₦${TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD.toLocaleString()} exemption threshold. You don't need to pay personal income tax.`,
        priority: 10,
        type: 'info'
      });
    } else if (annualIncome <= TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD * 1.1) {
      tips.push({
        category: 'exemption',
        title: 'You\'re close to the tax threshold',
        description: `Your income is close to the exemption threshold. Consider maximizing deductions to potentially stay below ₦${TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD.toLocaleString()}.`,
        priority: 8,
        type: 'warning'
      });
    }

    // Tax bracket tips
    if (annualIncome > TAX_CONSTANTS.TAX.BRACKET_1_MAX) {
      tips.push({
        category: 'tax_bracket',
        title: 'You\'re in the higher tax bracket',
        description: `You're in the 25% tax bracket. Consider maximizing all available deductions to reduce your taxable income.`,
        priority: 7,
        type: 'suggestion'
      });
    }

    // Description clarity tip
    if (descriptionInsights.unclearDescriptions.length > 0) {
      tips.push({
        category: 'data_quality',
        title: 'Improve transaction descriptions',
        description: `You have ${descriptionInsights.unclearDescriptions.length} transactions with unclear descriptions. Adding detailed descriptions helps identify tax-deductible expenses and ensures accurate categorization.`,
        priority: 9,
        type: 'action',
        actionItems: descriptionInsights.unclearDescriptions.slice(0, 5)
      });
    }

    return tips;
  }

  /**
   * Get deduction-related tips
   */
  getDeductionTips(transactions, descriptionInsights) {
    const tips = [];
    const totalDeductions = transactions
      .filter(t => t.isTaxDeductible)
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // Potential deductions found
    if (descriptionInsights.potentialDeductions.length > 0) {
      tips.push({
        category: 'deductions',
        title: 'Potential tax deductions identified',
        description: `We found ${descriptionInsights.potentialDeductions.length} transactions that may be tax-deductible based on their descriptions. Review and mark them as deductible to reduce your tax liability.`,
        priority: 9,
        type: 'action',
        actionItems: descriptionInsights.potentialDeductions.slice(0, 5)
      });
    }

    // Low deductions warning
    if (totalDeductions === 0 && transactions.length > 10) {
      tips.push({
        category: 'deductions',
        title: 'No deductions claimed yet',
        description: 'You haven\'t marked any expenses as tax-deductible. Common deductible expenses include medical expenses, professional development, charitable donations, and business expenses. Review your transactions and add descriptions to identify deductions.',
        priority: 8,
        type: 'suggestion'
      });
    }

    // Business expense deductions
    if (descriptionInsights.businessExpenses.length > 0) {
      tips.push({
        category: 'deductions',
        title: 'Potential business expense deductions',
        description: `Found ${descriptionInsights.businessExpenses.length} transactions that may qualify as business expenses. If you're self-employed, these can significantly reduce your tax liability.`,
        priority: 8,
        type: 'suggestion',
        actionItems: descriptionInsights.businessExpenses.slice(0, 5)
      });
    }

    return tips;
  }

  /**
   * Get compliance tips
   */
  getComplianceTips(userData) {
    const tips = [];

    // TIN reminder
    if (!userData.tin) {
      tips.push({
        category: 'compliance',
        title: 'Add your Tax Identification Number (TIN)',
        description: 'A TIN is now required for various financial transactions. Make sure to add your TIN to your profile to ensure compliance with the 2026 Tax Reform.',
        priority: 10,
        type: 'action'
      });
    }

    // Record keeping tip
    tips.push({
      category: 'compliance',
      title: 'Keep detailed records',
      description: 'Maintain detailed descriptions for all transactions. Clear transaction descriptions help during tax filing and can support deduction claims if audited.',
      priority: 7,
      type: 'info'
    });

    return tips;
  }

  /**
   * Get expense optimization tips
   */
  getExpenseOptimizationTips(transactions, descriptionInsights) {
    const tips = [];

    // VAT exemption tips
    if (descriptionInsights.vatExemptItems.length > 0) {
      tips.push({
        category: 'optimization',
        title: 'VAT-exempt items identified',
        description: `Found ${descriptionInsights.vatExemptItems.length} transactions that should be VAT-exempt (food, healthcare, education, rent, public transport). Ensure these are properly categorized.`,
        priority: 7,
        type: 'info',
        actionItems: descriptionInsights.vatExemptItems.slice(0, 5)
      });
    }

    return tips;
  }

  /**
   * Generate suggestions based on analysis
   */
  generateSuggestions(userData, transactions, taxProfile) {
    const suggestions = [];
    const descriptionInsights = this.analyzeTransactionDescriptions(transactions);

    // Suggestion: Add descriptions to transactions
    const transactionsWithoutDescriptions = transactions.filter(
      t => !t.description && !t.narration
    );
    
    if (transactionsWithoutDescriptions.length > 0) {
      suggestions.push({
        type: 'data_quality',
        title: 'Add descriptions to transactions',
        description: `${transactionsWithoutDescriptions.length} transactions are missing descriptions. Adding clear descriptions helps with accurate tax categorization and deduction identification.`,
        impact: 'high',
        effort: 'low'
      });
    }

    // Suggestion: Review potential deductions
    if (descriptionInsights.potentialDeductions.length > 0) {
      suggestions.push({
        type: 'tax_savings',
        title: 'Review potential deductions',
        description: `Review ${descriptionInsights.potentialDeductions.length} transactions that may be tax-deductible based on their descriptions.`,
        impact: 'high',
        effort: 'medium',
        estimatedSavings: descriptionInsights.potentialDeductions.length * 0.15 // Rough estimate
      });
    }

    return suggestions;
  }
}

module.exports = new TipsEngine();

