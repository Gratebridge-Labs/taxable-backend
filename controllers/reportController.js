const Report = require('../models/Report');
const reportGenerator = require('../services/reportGenerator');
const TAX_CONSTANTS = require('../config/constants');

// @desc    Get all reports for current user
// @route   GET /api/reports
// @access  Private
const getReports = async (req, res) => {
  try {
    const { reportType, page = 1, limit = 10 } = req.query;

    const query = { user: req.user._id };
    if (reportType) {
      query.reportType = reportType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const reports = await Report.find(query)
      .sort({ generatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('taxProfile', 'taxYear estimatedTaxLiability')
      .select('-reportData'); // Exclude large reportData for list view

    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching reports'
    });
  }
};

// @desc    Get single report by ID
// @route   GET /api/reports/:id
// @access  Private
const getReport = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findOne({
      _id: id,
      user: req.user._id
    }).populate('taxProfile', 'taxYear estimatedTaxLiability effectiveTaxRate');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: { report }
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching report'
    });
  }
};

// @desc    Generate weekly report
// @route   GET /api/reports/weekly
// @access  Private
const generateWeeklyReport = async (req, res) => {
  try {
    const { weekStart } = req.query;

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

    const report = await reportGenerator.generateWeeklyReport(
      req.user._id,
      startDate
    );

    res.json({
      success: true,
      message: 'Weekly report generated successfully',
      data: { report }
    });
  } catch (error) {
    console.error('Generate weekly report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating weekly report'
    });
  }
};

// @desc    Generate monthly report
// @route   GET /api/reports/monthly
// @access  Private
const generateMonthlyReport = async (req, res) => {
  try {
    const { year, month } = req.query;

    let reportYear = null;
    let reportMonth = null;

    if (year) {
      reportYear = parseInt(year);
      if (isNaN(reportYear) || reportYear < 2000 || reportYear > 2100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid year'
        });
      }
    }

    if (month) {
      reportMonth = parseInt(month);
      if (isNaN(reportMonth) || reportMonth < 1 || reportMonth > 12) {
        return res.status(400).json({
          success: false,
          message: 'Invalid month (must be 1-12)'
        });
      }
    }

    const report = await reportGenerator.generateMonthlyReport(
      req.user._id,
      reportYear,
      reportMonth
    );

    res.json({
      success: true,
      message: 'Monthly report generated successfully',
      data: { report }
    });
  } catch (error) {
    console.error('Generate monthly report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating monthly report'
    });
  }
};

// @desc    Generate annual report
// @route   GET /api/reports/annual
// @access  Private
const generateAnnualReport = async (req, res) => {
  try {
    const { year } = req.query;

    let reportYear = null;
    if (year) {
      reportYear = parseInt(year);
      if (isNaN(reportYear) || reportYear < 2000 || reportYear > 2100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid year'
        });
      }
    }

    const report = await reportGenerator.generateAnnualReport(
      req.user._id,
      reportYear
    );

    res.json({
      success: true,
      message: 'Annual report generated successfully',
      data: { report }
    });
  } catch (error) {
    console.error('Generate annual report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating annual report'
    });
  }
};

// @desc    Generate custom date range report
// @route   POST /api/reports/generate
// @access  Private
const generateCustomReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before endDate'
      });
    }

    const report = await reportGenerator.generateCustomReport(
      req.user._id,
      start,
      end
    );

    res.json({
      success: true,
      message: 'Custom report generated successfully',
      data: { report }
    });
  } catch (error) {
    console.error('Generate custom report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating custom report'
    });
  }
};

// @desc    Download report as JSON
// @route   GET /api/reports/:id/download
// @access  Private
const downloadReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const report = await Report.findOne({
      _id: id,
      user: req.user._id
    }).populate('taxProfile', 'taxYear estimatedTaxLiability effectiveTaxRate');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    if (format === 'json') {
      // Set headers for JSON download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="report-${report.reportType}-${report.periodStart.toISOString().split('T')[0]}.json"`
      );

      // Send report as JSON
      res.json({
        success: true,
        report: {
          id: report._id,
          reportType: report.reportType,
          period: {
            start: report.periodStart,
            end: report.periodEnd,
            label: report.periodLabel
          },
          financial: {
            totalIncome: report.totalIncome,
            totalExpenses: report.totalExpenses,
            netAmount: report.netAmount,
            totalDeductions: report.totalDeductions
          },
          tax: {
            taxableIncome: report.taxableIncome,
            estimatedTax: report.estimatedTax,
            effectiveTaxRate: report.effectiveTaxRate
          },
          summary: report.summary,
          categoryBreakdown: report.categoryBreakdown,
          tips: report.tips,
          suggestions: report.suggestions,
          reportData: report.reportData,
          generatedAt: report.generatedAt
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported format. Only JSON is currently supported.'
      });
    }
  } catch (error) {
    console.error('Download report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error downloading report'
    });
  }
};

// @desc    Delete a report
// @route   DELETE /api/reports/:id
// @access  Private
const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findOne({
      _id: id,
      user: req.user._id
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await Report.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting report'
    });
  }
};

module.exports = {
  getReports,
  getReport,
  generateWeeklyReport,
  generateMonthlyReport,
  generateAnnualReport,
  generateCustomReport,
  downloadReport,
  deleteReport
};

