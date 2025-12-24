const Transaction = require('../models/Transaction');
const TAX_CONSTANTS = require('../config/constants');
const taxRecalculationService = require('../services/taxRecalculationService');

// @desc    Get all transactions for current user
// @route   GET /api/transactions
// @access  Private
const getTransactions = async (req, res) => {
  try {
    const {
      transactionType,
      category,
      startDate,
      endDate,
      isTaxDeductible,
      search,
      page = 1,
      limit = 20,
      sortBy = 'transactionDate',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { user: req.user._id };

    // Filter by transaction type
    if (transactionType) {
      query.transactionType = transactionType;
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set to end of day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.transactionDate.$lte = end;
      }
    }

    // Filter by tax deductible
    if (isTaxDeductible !== undefined) {
      query.isTaxDeductible = isTaxDeductible === 'true';
    }

    // Search in description and narration
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { narration: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get transactions
    const transactions = await Transaction.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('document', 'fileName documentType')
      .lean();

    // Get total count
    const total = await Transaction.countDocuments(query);

    // Calculate totals
    const totals = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'income'] }, '$amount', 0]
            }
          },
          totalExpenses: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'expense'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    const summary = totals[0] || { totalIncome: 0, totalExpenses: 0 };

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        },
        summary: {
          totalIncome: summary.totalIncome || 0,
          totalExpenses: summary.totalExpenses || 0,
          netAmount: (summary.totalIncome || 0) - (summary.totalExpenses || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching transactions'
    });
  }
};

// @desc    Get single transaction by ID
// @route   GET /api/transactions/:id
// @access  Private
const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findOne({
      _id: id,
      user: req.user._id
    }).populate('document', 'fileName documentType');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: { transaction }
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching transaction'
    });
  }
};

// @desc    Create a new transaction
// @route   POST /api/transactions
// @access  Private
const createTransaction = async (req, res) => {
  try {
    const {
      transactionType,
      category,
      amount,
      description,
      narration,
      transactionDate,
      isTaxDeductible,
      vatApplicable,
      metadata
    } = req.body;

    // Validation
    if (!transactionType || !category || !amount || !transactionDate) {
      return res.status(400).json({
        success: false,
        message: 'Transaction type, category, amount, and date are required'
      });
    }

    // Validate transaction type
    if (!Object.values(TAX_CONSTANTS.TRANSACTION_TYPES).includes(transactionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type'
      });
    }

    // Validate category based on transaction type
    const validCategories = transactionType === 'income'
      ? TAX_CONSTANTS.INCOME_CATEGORIES
      : TAX_CONSTANTS.EXPENSE_CATEGORIES;

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category for ${transactionType} transaction`
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Create transaction
    const transaction = await Transaction.create({
      user: req.user._id,
      transactionType,
      category,
      amount,
      description,
      narration: narration || description,
      transactionDate: new Date(transactionDate),
      source: 'manual_entry',
      isTaxDeductible: isTaxDeductible || false,
      vatApplicable: vatApplicable || false,
      metadata: metadata || {}
    });

    // Recalculate tax profile for the transaction year (non-blocking)
    taxRecalculationService.recalculateTaxProfileForTransaction(
      req.user._id,
      transaction.transactionDate
    ).catch(err => console.error('Background tax recalculation error:', err));

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: { transaction }
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating transaction'
    });
  }
};

// @desc    Update a transaction
// @route   PUT /api/transactions/:id
// @access  Private
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      transactionType,
      category,
      amount,
      description,
      narration,
      transactionDate,
      isTaxDeductible,
      vatApplicable,
      metadata
    } = req.body;

    // Find transaction
    const transaction = await Transaction.findOne({
      _id: id,
      user: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Build update object
    const updateData = {};
    if (transactionType !== undefined) {
      if (!Object.values(TAX_CONSTANTS.TRANSACTION_TYPES).includes(transactionType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction type'
        });
      }
      updateData.transactionType = transactionType;
    }

    if (category !== undefined) {
      const validCategories = (updateData.transactionType || transaction.transactionType) === 'income'
        ? TAX_CONSTANTS.INCOME_CATEGORIES
        : TAX_CONSTANTS.EXPENSE_CATEGORIES;

      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: `Invalid category for ${updateData.transactionType || transaction.transactionType} transaction`
        });
      }
      updateData.category = category;
    }

    if (amount !== undefined) {
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }
      updateData.amount = amount;
    }

    if (description !== undefined) updateData.description = description;
    if (narration !== undefined) updateData.narration = narration;
    if (transactionDate !== undefined) updateData.transactionDate = new Date(transactionDate);
    if (isTaxDeductible !== undefined) updateData.isTaxDeductible = isTaxDeductible;
    if (vatApplicable !== undefined) updateData.vatApplicable = vatApplicable;
    if (metadata !== undefined) updateData.metadata = metadata;

    // Update transaction
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('document', 'fileName documentType');

    // Recalculate tax profile for the transaction year (non-blocking)
    const txDate = updateData.transactionDate || transaction.transactionDate;
    taxRecalculationService.recalculateTaxProfileForTransaction(
      req.user._id,
      txDate
    ).catch(err => console.error('Background tax recalculation error:', err));

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: { transaction: updatedTransaction }
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating transaction'
    });
  }
};

// @desc    Delete a transaction
// @route   DELETE /api/transactions/:id
// @access  Private
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await Transaction.findOne({
      _id: id,
      user: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transactionDate = transaction.transactionDate;
    await Transaction.findByIdAndDelete(id);

    // Recalculate tax profile for the transaction year (non-blocking)
    taxRecalculationService.recalculateTaxProfileForTransaction(
      req.user._id,
      transactionDate
    ).catch(err => console.error('Background tax recalculation error:', err));

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting transaction'
    });
  }
};

// @desc    Get transaction summary
// @route   GET /api/transactions/summary
// @access  Private
const getTransactionSummary = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'category' } = req.query;

    // Build date filter
    const dateFilter = { user: req.user._id };
    if (startDate || endDate) {
      dateFilter.transactionDate = {};
      if (startDate) {
        dateFilter.transactionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.transactionDate.$lte = end;
      }
    }

    // Aggregate by category
    const categorySummary = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            type: '$transactionType',
            category: '$category'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          categories: {
            $push: {
              category: '$_id.category',
              count: '$count',
              totalAmount: '$totalAmount',
              avgAmount: '$avgAmount'
            }
          },
          totalCount: { $sum: '$count' },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Overall totals
    const totals = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'income'] }, '$amount', 0]
            }
          },
          totalExpenses: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'expense'] }, '$amount', 0]
            }
          },
          totalTaxDeductible: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$transactionType', 'expense'] }, { $eq: ['$isTaxDeductible', true] }] },
                '$amount',
                0
              ]
            }
          },
          transactionCount: { $sum: 1 },
          incomeCount: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'income'] }, 1, 0]
            }
          },
          expenseCount: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'expense'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Monthly breakdown (if date range provided)
    let monthlyBreakdown = [];
    if (startDate && endDate) {
      monthlyBreakdown = await Transaction.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              year: { $year: '$transactionDate' },
              month: { $month: '$transactionDate' }
            },
            income: {
              $sum: {
                $cond: [{ $eq: ['$transactionType', 'income'] }, '$amount', 0]
              }
            },
            expenses: {
              $sum: {
                $cond: [{ $eq: ['$transactionType', 'expense'] }, '$amount', 0]
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);
    }

    const summary = totals[0] || {
      totalIncome: 0,
      totalExpenses: 0,
      totalTaxDeductible: 0,
      transactionCount: 0,
      incomeCount: 0,
      expenseCount: 0
    };

    res.json({
      success: true,
      data: {
        summary: {
          totalIncome: summary.totalIncome || 0,
          totalExpenses: summary.totalExpenses || 0,
          netAmount: (summary.totalIncome || 0) - (summary.totalExpenses || 0),
          totalTaxDeductible: summary.totalTaxDeductible || 0,
          transactionCount: summary.transactionCount || 0,
          incomeCount: summary.incomeCount || 0,
          expenseCount: summary.expenseCount || 0
        },
        byCategory: categorySummary,
        monthlyBreakdown: monthlyBreakdown.map(item => ({
          year: item._id.year,
          month: item._id.month,
          income: item.income || 0,
          expenses: item.expenses || 0,
          netAmount: (item.income || 0) - (item.expenses || 0),
          transactionCount: item.count || 0
        }))
      }
    });
  } catch (error) {
    console.error('Get transaction summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching transaction summary'
    });
  }
};

// @desc    Bulk import transactions
// @route   POST /api/transactions/bulk-import
// @access  Private
const bulkImportTransactions = async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transactions array is required'
      });
    }

    if (transactions.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 1000 transactions allowed per import'
      });
    }

    const results = {
      created: 0,
      skipped: 0,
      errors: []
    };

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      
      try {
        // Validate required fields
        if (!tx.transactionType || !tx.category || !tx.amount || !tx.transactionDate) {
          results.errors.push({
            index: i,
            error: 'Missing required fields: transactionType, category, amount, transactionDate'
          });
          results.skipped++;
          continue;
        }

        // Validate transaction type
        if (!Object.values(TAX_CONSTANTS.TRANSACTION_TYPES).includes(tx.transactionType)) {
          results.errors.push({
            index: i,
            error: 'Invalid transaction type'
          });
          results.skipped++;
          continue;
        }

        // Validate category
        const validCategories = tx.transactionType === 'income'
          ? TAX_CONSTANTS.INCOME_CATEGORIES
          : TAX_CONSTANTS.EXPENSE_CATEGORIES;

        if (!validCategories.includes(tx.category)) {
          results.errors.push({
            index: i,
            error: `Invalid category for ${tx.transactionType} transaction`
          });
          results.skipped++;
          continue;
        }

        // Check for duplicates
        const existing = await Transaction.findOne({
          user: req.user._id,
          transactionDate: new Date(tx.transactionDate),
          amount: tx.amount,
          description: tx.description || ''
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        // Create transaction
        await Transaction.create({
          user: req.user._id,
          transactionType: tx.transactionType,
          category: tx.category,
          amount: tx.amount,
          description: tx.description || '',
          narration: tx.narration || tx.description || '',
          transactionDate: new Date(tx.transactionDate),
          source: tx.source || 'manual_entry',
          isTaxDeductible: tx.isTaxDeductible || false,
          vatApplicable: tx.vatApplicable || false,
          metadata: tx.metadata || {}
        });

        results.created++;
      } catch (error) {
        results.errors.push({
          index: i,
          error: error.message
        });
        results.skipped++;
      }
    }

    // Recalculate tax profiles for all affected years (non-blocking)
    const affectedYears = transactions
      .map(tx => new Date(tx.transactionDate).getFullYear())
      .filter((year, index, self) => self.indexOf(year) === index);
    
    taxRecalculationService.recalculateTaxProfilesForYears(
      req.user._id,
      affectedYears
    ).catch(err => console.error('Background tax recalculation error:', err));

    res.status(201).json({
      success: true,
      message: `Bulk import completed: ${results.created} created, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error importing transactions'
    });
  }
};

module.exports = {
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionSummary,
  bulkImportTransactions
};

