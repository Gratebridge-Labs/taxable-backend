const errorLoggerService = require('../services/errorLoggerService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Get list of WhatsApp errors with filtering and pagination
 * GET /api/admin/whatsapp-errors
 */
const getWhatsAppErrors = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      errorType,
      severity,
      resolved,
      userId,
      waId,
      startDate,
      endDate,
      searchText,
      environment
    } = req.query;

    // Build filters
    const filters = {};
    
    if (errorType) filters.errorType = errorType;
    if (severity) filters.severity = severity;
    if (resolved !== undefined) filters.resolved = resolved === 'true';
    if (userId && mongoose.Types.ObjectId.isValid(userId)) filters.userId = userId;
    if (waId) filters.waId = waId;
    if (environment) filters.environment = environment;
    if (startDate || endDate) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    }

    // Build search criteria for text search
    const searchCriteria = {};
    if (searchText) {
      searchCriteria.searchText = searchText;
    }
    if (Object.keys(filters).length > 0) {
      Object.assign(searchCriteria, filters);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Get errors
    const errors = await errorLoggerService.searchErrors(searchCriteria, {
      limit: parseInt(limit),
      skip,
      sort
    });

    // Get total count for pagination
    const totalCount = await errorLoggerService.getRecentErrors(filters, { limit: 0 });
    const totalPages = Math.ceil(totalCount.length / parseInt(limit));

    res.json({
      success: true,
      data: {
        errors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount: totalCount.length,
          totalPages,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          applied: Object.keys(filters).length > 0 ? filters : null,
          searchText: searchText || null
        }
      }
    });

  } catch (error) {
    console.error('[getWhatsAppErrors] Error:', error);
    
    // Log this error too
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'getWhatsAppErrors',
      adminId: req.admin?._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve error logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get detailed error by ID
 * GET /api/admin/whatsapp-errors/:errorId
 */
const getErrorById = async (req, res) => {
  try {
    const { errorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(errorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid error ID format'
      });
    }

    const error = await errorLoggerService.getErrorById(errorId);

    if (!error) {
      return res.status(404).json({
        success: false,
        message: 'Error log not found'
      });
    }

    res.json({
      success: true,
      data: { error }
    });

  } catch (error) {
    console.error('[getErrorById] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'getErrorById',
      errorId: req.params.errorId,
      adminId: req.admin?._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve error details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark error as resolved
 * PATCH /api/admin/whatsapp-errors/:errorId/resolve
 */
const markErrorResolved = async (req, res) => {
  try {
    const { errorId } = req.params;
    const { notes = '' } = req.body;
    const adminId = req.admin?._id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(errorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid error ID format'
      });
    }

    const updatedError = await errorLoggerService.markErrorResolved(errorId, adminId, notes);

    if (!updatedError) {
      return res.status(404).json({
        success: false,
        message: 'Error log not found'
      });
    }

    res.json({
      success: true,
      message: 'Error marked as resolved',
      data: { error: updatedError }
    });

  } catch (error) {
    console.error('[markErrorResolved] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'markErrorResolved',
      errorId: req.params.errorId,
      adminId: req.admin?._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to mark error as resolved',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get error statistics dashboard
 * GET /api/admin/whatsapp-error-stats
 */
const getErrorStats = async (req, res) => {
  try {
    const { timeRange = '24' } = req.query; // hours
    const timeRangeHours = parseInt(timeRange) || 24;

    // Get error statistics
    const errorStats = await errorLoggerService.getErrorStats(timeRangeHours);

    // Get unresolved count
    const unresolvedCount = await errorLoggerService.getUnresolvedCount();

    // Calculate totals
    let totalErrors = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    errorStats.forEach(typeStat => {
      typeStat.severityBreakdown.forEach(severityStat => {
        totalErrors += severityStat.count;
        
        switch (severityStat.severity) {
          case 'critical':
            criticalCount += severityStat.count;
            break;
          case 'high':
            highCount += severityStat.count;
            break;
          case 'medium':
            mediumCount += severityStat.count;
            break;
          case 'low':
            lowCount += severityStat.count;
            break;
        }
      });
    });

    // Calculate error rate (errors per hour)
    const errorRate = totalErrors / timeRangeHours;

    // Get most common error types
    const topErrorTypes = errorStats
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 5)
      .map(typeStat => ({
        type: typeStat._id,
        count: typeStat.totalCount,
        severityBreakdown: typeStat.severityBreakdown
      }));

    // Get recent critical errors
    const recentCriticalErrors = await errorLoggerService.getRecentErrors(
      { severity: 'critical', resolved: false },
      { limit: 5 }
    );

    res.json({
      success: true,
      data: {
        summary: {
          totalErrors,
          unresolvedCount,
          errorRate: parseFloat(errorRate.toFixed(2)),
          timeRangeHours
        },
        severityBreakdown: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount
        },
        topErrorTypes,
        recentCriticalErrors,
        timestamp: new Date().toISOString(),
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[getErrorStats] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'getErrorStats',
      adminId: req.admin?._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve error statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get error trends over time
 * GET /api/admin/whatsapp-error-trends
 */
const getErrorTrends = async (req, res) => {
  try {
    const { period = 'day', points = 7 } = req.query; // day, week, month
    const WhatsAppErrorLog = require('../models/WhatsAppErrorLog');

    let groupByFormat;
    let timeRangeHours;

    switch (period) {
      case 'hour':
        groupByFormat = '%Y-%m-%d %H:00:00';
        timeRangeHours = parseInt(points) || 24;
        break;
      case 'day':
        groupByFormat = '%Y-%m-%d';
        timeRangeHours = (parseInt(points) || 7) * 24;
        break;
      case 'week':
        groupByFormat = '%Y-%U';
        timeRangeHours = (parseInt(points) || 4) * 7 * 24;
        break;
      default:
        groupByFormat = '%Y-%m-%d';
        timeRangeHours = 7 * 24;
    }

    const cutoffDate = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));

    // Aggregate errors by time period
    const trends = await WhatsAppErrorLog.aggregate([
      {
        $match: {
          createdAt: { $gte: cutoffDate }
        }
      },
      {
        $group: {
          _id: {
            period: { $dateToString: { format: groupByFormat, date: '$createdAt' } },
            errorType: '$errorType',
            severity: '$severity'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.period',
          errorTypes: {
            $push: {
              type: '$_id.errorType',
              severity: '$_id.severity',
              count: '$count'
            }
          },
          totalCount: { $sum: '$count' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Format response
    const formattedTrends = trends.map(trend => ({
      period: trend._id,
      totalErrors: trend.totalCount,
      errorTypes: trend.errorTypes.reduce((acc, errorType) => {
        if (!acc[errorType.type]) {
          acc[errorType.type] = { total: 0, severityBreakdown: {} };
        }
        acc[errorType.type].total += errorType.count;
        acc[errorType.type].severityBreakdown[errorType.severity] = 
          (acc[errorType.type].severityBreakdown[errorType.severity] || 0) + errorType.count;
        return acc;
      }, {})
    }));

    res.json({
      success: true,
      data: {
        trends: formattedTrends,
        period,
        points: formattedTrends.length,
        timeRange: `${timeRangeHours} hours`,
        startDate: cutoffDate.toISOString(),
        endDate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[getErrorTrends] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'getErrorTrends',
      adminId: req.admin?._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve error trends',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Search errors with advanced criteria
 * POST /api/admin/whatsapp-errors/search
 */
const searchErrors = async (req, res) => {
  try {
    const {
      searchText,
      errorType,
      severity,
      resolved,
      userId,
      waId,
      startDate,
      endDate,
      sessionStep,
      environment,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.body;

    // Build search criteria
    const searchCriteria = {};
    
    if (searchText) searchCriteria.searchText = searchText;
    if (errorType) searchCriteria.errorType = errorType;
    if (severity) searchCriteria.severity = severity;
    if (resolved !== undefined) searchCriteria.resolved = resolved;
    if (userId) searchCriteria.userId = userId;
    if (waId) searchCriteria.waId = waId;
    if (startDate) searchCriteria.startDate = startDate;
    if (endDate) searchCriteria.endDate = endDate;
    if (environment) searchCriteria.environment = environment;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Get errors
    const errors = await errorLoggerService.searchErrors(searchCriteria, {
      limit: parseInt(limit),
      skip,
      sort
    });

    // Get total count (simplified - in production you might want a count query)
    const totalErrors = await errorLoggerService.searchErrors(searchCriteria, { limit: 0 });
    const totalPages = Math.ceil(totalErrors.length / parseInt(limit));

    res.json({
      success: true,
      data: {
        errors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount: totalErrors.length,
          totalPages,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        searchCriteria
      }
    });

  } catch (error) {
    console.error('[searchErrors] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'searchErrors',
      adminId: req.admin?._id,
      searchCriteria: req.body
    });

    res.status(500).json({
      success: false,
      message: 'Failed to search errors',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get unresolved error count for dashboard widget
 * GET /api/admin/whatsapp-errors/unresolved-count
 */
const getUnresolvedCount = async (req, res) => {
  try {
    const count = await errorLoggerService.getUnresolvedCount();

    res.json({
      success: true,
      data: {
        unresolvedCount: count,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[getUnresolvedCount] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'getUnresolvedCount',
      adminId: req.admin?._id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to get unresolved count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Clean up old errors (admin endpoint for manual cleanup)
 * POST /api/admin/whatsapp-errors/cleanup
 */
const cleanupOldErrors = async (req, res) => {
  try {
    const { retentionDays = 90, dryRun = false } = req.body;
    const adminId = req.admin?._id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    if (dryRun) {
      // Dry run - just count what would be deleted
      const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
      const count = await require('../models/WhatsAppErrorLog').countDocuments({
        createdAt: { $lt: cutoffDate },
        resolved: true,
        severity: { $in: ['low', 'info'] }
      });

      return res.json({
        success: true,
        data: {
          dryRun: true,
          wouldDeleteCount: count,
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          criteria: {
            createdAt: { $lt: cutoffDate },
            resolved: true,
            severity: { $in: ['low', 'info'] }
          }
        }
      });
    }

    // Actual cleanup
    const result = await errorLoggerService.cleanupOldErrors(retentionDays);

    // Log the cleanup action
    await errorLoggerService.logWhatsAppError('info', `Cleaned up ${result.deletedCount} old errors`, {
      controller: 'adminErrorLogController',
      action: 'cleanupOldErrors',
      adminId,
      retentionDays,
      deletedCount: result.deletedCount,
      cutoffDate: result.cutoffDate
    }, { severity: 'info' });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} old error logs`,
      data: result
    });

  } catch (error) {
    console.error('[cleanupOldErrors] Error:', error);
    
    await errorLoggerService.logWhatsAppError('database', error, {
      controller: 'adminErrorLogController',
      action: 'cleanupOldErrors',
      adminId: req.admin?._id,
      requestBody: req.body
    });

    res.status(500).json({
      success: false,
      message: 'Failed to cleanup old errors',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getWhatsAppErrors,
  getErrorById,
  markErrorResolved,
  getErrorStats,
  getErrorTrends,
  searchErrors,
  getUnresolvedCount,
  cleanupOldErrors
};