const Transaction = require('../models/Transaction');
const TaxProfile = require('../models/TaxProfile');
const TaxTip = require('../models/TaxTip');
const tipsEngine = require('../services/tipsEngine');
const aiTipsService = require('../services/aiTipsService');

// @desc    Get personalized tips for current user
// @route   GET /api/tips/personalized
// @access  Private
const getPersonalizedTips = async (req, res) => {
  try {
    const { 
      limit = 20, 
      category,
      useAI = false // Flag for AI enhancement (future feature)
    } = req.query;

    // Get user's transactions
    const transactions = await Transaction.find({
      user: req.user._id
    }).sort({ transactionDate: -1 }).limit(1000); // Get recent transactions

    // Get user's tax profile for current year
    const currentYear = new Date().getFullYear();
    const taxProfile = await TaxProfile.findOne({
      user: req.user._id,
      taxYear: currentYear
    }) || {};

    // Get user data
    const userData = {
      userId: req.user._id,
      email: req.user.email,
      employmentStatus: req.user.employmentStatus,
      tin: req.user.tin
    };

    // Generate tips using tips engine
    let tips = tipsEngine.generatePersonalizedTips(
      userData,
      transactions,
      taxProfile
    );

    // Filter by category if specified
    if (category) {
      tips = tips.filter(tip => tip.category === category);
    }

    // Limit results
    const limitNum = parseInt(limit);
    tips = tips.slice(0, limitNum);

    // AI Enhancement (if enabled and available)
    if (useAI === 'true' || useAI === true) {
      try {
        tips = await aiTipsService.enhanceTipsWithAI(
          tips,
          userData,
          transactions,
          taxProfile
        );
      } catch (error) {
        console.error('AI enhancement error (non-blocking):', error);
        // Continue with non-AI tips if AI fails
      }
    }

    res.json({
      success: true,
      data: {
        tips,
        count: tips.length,
        aiEnhanced: useAI === 'true' || useAI === true,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Get personalized tips error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching personalized tips'
    });
  }
};

// @desc    Get suggestions for current user
// @route   GET /api/suggestions
// @access  Private
const getSuggestions = async (req, res) => {
  try {
    const { limit = 10, useAI = false } = req.query;

    // Get user's transactions
    const transactions = await Transaction.find({
      user: req.user._id
    }).sort({ transactionDate: -1 }).limit(1000);

    // Get user's tax profile for current year
    const currentYear = new Date().getFullYear();
    const taxProfile = await TaxProfile.findOne({
      user: req.user._id,
      taxYear: currentYear
    }) || {};

    // Get user data
    const userData = {
      userId: req.user._id,
      email: req.user.email,
      employmentStatus: req.user.employmentStatus,
      tin: req.user.tin
    };

    // Generate suggestions using tips engine
    let suggestions = tipsEngine.generateSuggestions(
      userData,
      transactions,
      taxProfile
    );

    // Limit results
    const limitNum = parseInt(limit);
    suggestions = suggestions.slice(0, limitNum);

    // AI Enhancement (if enabled and available)
    if (useAI === 'true' || useAI === true) {
      try {
        // Future: Enhance suggestions with AI
        // suggestions = await aiTipsService.enhanceSuggestions(...);
      } catch (error) {
        console.error('AI enhancement error (non-blocking):', error);
      }
    }

    res.json({
      success: true,
      data: {
        suggestions,
        count: suggestions.length,
        aiEnhanced: useAI === 'true' || useAI === true,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching suggestions'
    });
  }
};

// @desc    Get reference tax tips (from database)
// @route   GET /api/tips
// @access  Private
const getReferenceTips = async (req, res) => {
  try {
    const { 
      category,
      limit = 50,
      priority,
      activeOnly = true
    } = req.query;

    const query = {};
    
    if (category) {
      query.tipCategory = category;
    }
    
    if (activeOnly === 'true' || activeOnly === true) {
      query.isActive = true;
    }

    const sort = {};
    if (priority === 'true' || priority === true) {
      sort.priority = -1;
    }
    sort.createdAt = -1;

    const limitNum = parseInt(limit);

    const tips = await TaxTip.find(query)
      .sort(sort)
      .limit(limitNum);

    res.json({
      success: true,
      data: {
        tips,
        count: tips.length
      }
    });
  } catch (error) {
    console.error('Get reference tips error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching reference tips'
    });
  }
};

// @desc    Get AI analysis of user data (for future AI integration)
// @route   GET /api/tips/ai-analysis
// @access  Private
const getAIAnalysis = async (req, res) => {
  try {
    // Get user's transactions
    const transactions = await Transaction.find({
      user: req.user._id
    }).sort({ transactionDate: -1 }).limit(1000);

    // Get user's tax profile for current year
    const currentYear = new Date().getFullYear();
    const taxProfile = await TaxProfile.findOne({
      user: req.user._id,
      taxYear: currentYear
    }) || {};

    // Get user data
    const userData = {
      userId: req.user._id,
      email: req.user.email,
      employmentStatus: req.user.employmentStatus,
      tin: req.user.tin
    };

    // Analyze user data (prepares data structure for AI)
    const analysis = await aiTipsService.analyzeUserDataForAI(
      userData,
      transactions,
      taxProfile
    );

    res.json({
      success: true,
      data: {
        analysis,
        aiReady: true,
        note: 'This endpoint prepares data for AI analysis. AI integration can be added later.'
      }
    });
  } catch (error) {
    console.error('Get AI analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error analyzing user data'
    });
  }
};

module.exports = {
  getPersonalizedTips,
  getSuggestions,
  getReferenceTips,
  getAIAnalysis
};

