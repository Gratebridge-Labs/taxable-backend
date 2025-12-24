const historyService = require('../services/historyService');

// @desc    Get history snapshots
// @route   GET /api/history
// @access  Private
const getHistory = async (req, res) => {
  try {
    const { snapshotType, limit = 50 } = req.query;

    if (!req.account) {
      return res.status(400).json({
        success: false,
        message: 'Account context is required'
      });
    }

    const snapshots = await historyService.getHistory(
      req.user._id,
      req.account._id,
      snapshotType,
      limit
    );

    res.json({
      success: true,
      data: {
        snapshots,
        count: snapshots.length
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching history'
    });
  }
};

// @desc    Generate weekly snapshot
// @route   POST /api/history/weekly
// @access  Private
const generateWeeklySnapshot = async (req, res) => {
  try {
    const { weekStart } = req.body;

    if (!req.account) {
      return res.status(400).json({
        success: false,
        message: 'Account context is required'
      });
    }

    let startDate = null;
    if (weekStart) {
      startDate = new Date(weekStart);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid weekStart date format'
        });
      }
    }

    const snapshot = await historyService.generateWeeklySnapshot(
      req.user._id,
      req.account._id,
      startDate
    );

    res.json({
      success: true,
      message: 'Weekly snapshot generated successfully',
      data: { snapshot }
    });
  } catch (error) {
    console.error('Generate weekly snapshot error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating weekly snapshot'
    });
  }
};

// @desc    Generate monthly snapshot
// @route   POST /api/history/monthly
// @access  Private
const generateMonthlySnapshot = async (req, res) => {
  try {
    const { year, month } = req.body;

    if (!req.account) {
      return res.status(400).json({
        success: false,
        message: 'Account context is required'
      });
    }

    const snapshot = await historyService.generateMonthlySnapshot(
      req.user._id,
      req.account._id,
      year,
      month
    );

    res.json({
      success: true,
      message: 'Monthly snapshot generated successfully',
      data: { snapshot }
    });
  } catch (error) {
    console.error('Generate monthly snapshot error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating monthly snapshot'
    });
  }
};

// @desc    Compare two periods
// @route   GET /api/history/compare
// @access  Private
const comparePeriods = async (req, res) => {
  try {
    const { period1Id, period2Id } = req.query;

    if (!period1Id || !period2Id) {
      return res.status(400).json({
        success: false,
        message: 'period1Id and period2Id are required'
      });
    }

    if (!req.account) {
      return res.status(400).json({
        success: false,
        message: 'Account context is required'
      });
    }

    const comparison = await historyService.comparePeriods(
      req.user._id,
      req.account._id,
      period1Id,
      period2Id
    );

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Compare periods error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error comparing periods'
    });
  }
};

// @desc    Get trend analysis
// @route   GET /api/history/trends
// @access  Private
const getTrendAnalysis = async (req, res) => {
  try {
    const { snapshotType = 'monthly', periods = 12 } = req.query;

    if (!req.account) {
      return res.status(400).json({
        success: false,
        message: 'Account context is required'
      });
    }

    const analysis = await historyService.getTrendAnalysis(
      req.user._id,
      req.account._id,
      snapshotType,
      periods
    );

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Get trend analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching trend analysis'
    });
  }
};

// @desc    Year-over-year comparison
// @route   GET /api/history/year-over-year
// @access  Private
const getYearOverYearComparison = async (req, res) => {
  try {
    const { year1, year2 } = req.query;

    if (!year1 || !year2) {
      return res.status(400).json({
        success: false,
        message: 'year1 and year2 are required'
      });
    }

    const year1Num = parseInt(year1);
    const year2Num = parseInt(year2);

    if (isNaN(year1Num) || isNaN(year2Num)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year format'
      });
    }

    if (!req.account) {
      return res.status(400).json({
        success: false,
        message: 'Account context is required'
      });
    }

    const comparison = await historyService.getYearOverYearComparison(
      req.user._id,
      req.account._id,
      year1Num,
      year2Num
    );

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Year-over-year comparison error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error comparing years'
    });
  }
};

module.exports = {
  getHistory,
  generateWeeklySnapshot,
  generateMonthlySnapshot,
  comparePeriods,
  getTrendAnalysis,
  getYearOverYearComparison
};

