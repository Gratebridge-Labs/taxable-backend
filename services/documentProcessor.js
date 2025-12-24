/**
 * Document Processor Service
 * Processes uploaded documents and extracts transactions
 */

const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const { parsePDF, extractTransactionsFromPDF } = require('../utils/pdfParser');
const { parseCSV } = require('../utils/csvParser');
const taxRecalculationService = require('./taxRecalculationService');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const TAX_CONSTANTS = require('../config/constants');

class DocumentProcessor {
  /**
   * Process a document and extract transactions
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} Processing result
   */
  async processDocument(documentId) {
    const document = await Document.findById(documentId);
    
    if (!document) {
      throw new Error('Document not found');
    }

    // Update status to processing
    document.processingStatus = TAX_CONSTANTS.PROCESSING_STATUS.PROCESSING;
    document.errorMessage = null;
    await document.save();

    try {
      let transactions = [];
      const fileExtension = path.extname(document.fileName).toLowerCase();

      // Process based on file type
      switch (fileExtension) {
        case '.pdf':
          transactions = await this.processPDF(document);
          break;
        case '.csv':
          transactions = await this.processCSV(document);
          break;
        case '.xlsx':
        case '.xls':
          transactions = await this.processExcel(document);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Categorize transactions
      const categorizedTransactions = transactions.map(tx => 
        this.categorizeTransaction(tx)
      );

      // Save transactions to database
      const savedTransactions = await this.saveTransactions(
        categorizedTransactions,
        document.user,
        document._id
      );

      // Update document with extracted data
      document.processingStatus = TAX_CONSTANTS.PROCESSING_STATUS.COMPLETED;
      document.extractedData = {
        transactionCount: savedTransactions.length,
        transactionsExtracted: savedTransactions.length,
        processedAt: new Date()
      };
      await document.save();

      // Recalculate tax profiles for affected years (non-blocking)
      if (savedTransactions.length > 0) {
        const affectedYears = savedTransactions
          .map(tx => tx.transactionDate.getFullYear())
          .filter((year, index, self) => self.indexOf(year) === index);
        
        // Get account from first transaction (all transactions from same document have same account)
        const accountId = savedTransactions[0]?.account || document.account;
        
        if (accountId) {
          taxRecalculationService.recalculateTaxProfilesForYears(
            document.user,
            accountId,
            affectedYears
          ).catch(err => console.error('Background tax recalculation error:', err));
        }
      }

      return {
        success: true,
        transactionsExtracted: savedTransactions.length,
        transactions: savedTransactions
      };
    } catch (error) {
      console.error('Document processing error:', error);
      
      // Update document with error
      document.processingStatus = TAX_CONSTANTS.PROCESSING_STATUS.FAILED;
      document.errorMessage = error.message;
      await document.save();

      throw error;
    }
  }

  /**
   * Process PDF document
   */
  async processPDF(document) {
    const pdfData = await parsePDF(document.filePath);
    const transactions = extractTransactionsFromPDF(pdfData.text);
    
    return transactions.map(tx => ({
      transactionDate: tx.date,
      amount: tx.amount,
      description: tx.description,
      narration: tx.description,
      source: 'bank_statement',
      metadata: {
        extractedFrom: 'pdf',
        rawLine: tx.rawLine
      }
    }));
  }

  /**
   * Process CSV document
   */
  async processCSV(document) {
    const transactions = await parseCSV(document.filePath);
    
    return transactions.map(tx => ({
      transactionDate: tx.date,
      amount: tx.amount,
      description: tx.description,
      narration: tx.narration || tx.description,
      transactionType: tx.transactionType,
      source: 'bank_statement',
      metadata: {
        extractedFrom: 'csv',
        reference: tx.reference,
        rawRow: tx.rawRow
      }
    }));
  }

  /**
   * Process Excel document
   */
  async processExcel(document) {
    const workbook = xlsx.readFile(document.filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);

    const transactions = [];

    for (const row of rows) {
      try {
        // Similar parsing logic to CSV
        const dateColumn = this.findColumn(row, ['date', 'transaction_date', 'value_date']);
        const descriptionColumn = this.findColumn(row, ['description', 'narration', 'details']);
        const amountColumn = this.findColumn(row, ['amount', 'credit', 'debit']);
        
        if (!dateColumn || !amountColumn) continue;

        const date = this.parseDate(row[dateColumn]);
        const amount = this.parseAmount(row[amountColumn]);
        const description = row[descriptionColumn] || '';

        if (date && amount > 0) {
          transactions.push({
            transactionDate: date,
            amount: Math.abs(amount),
            description: description.trim(),
            narration: description.trim(),
            transactionType: amount > 0 ? 'income' : 'expense',
            source: 'bank_statement',
            metadata: {
              extractedFrom: 'excel',
              rawRow: row
            }
          });
        }
      } catch (error) {
        console.error('Error parsing Excel row:', error);
      }
    }

    return transactions;
  }

  /**
   * Categorize a transaction based on description
   */
  categorizeTransaction(transaction) {
    const description = (transaction.description || transaction.narration || '').toLowerCase();
    
    // Determine transaction type if not set
    if (!transaction.transactionType) {
      transaction.transactionType = this.inferTransactionType(description, transaction.amount);
    }

    // Categorize based on description
    if (transaction.transactionType === 'income') {
      transaction.category = this.categorizeIncome(description);
    } else {
      transaction.category = this.categorizeExpense(description);
    }

    // Determine if tax deductible
    transaction.isTaxDeductible = this.isTaxDeductible(transaction.category, description);

    // Determine if VAT applicable
    transaction.vatApplicable = this.isVATApplicable(transaction.category);

    return transaction;
  }

  /**
   * Categorize income transaction
   */
  categorizeIncome(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('salary') || desc.includes('wage') || desc.includes('payroll')) {
      return 'salary';
    }
    if (desc.includes('business') || desc.includes('sales') || desc.includes('revenue')) {
      return 'business_income';
    }
    if (desc.includes('rent') || desc.includes('rental')) {
      return 'rental_income';
    }
    if (desc.includes('investment') || desc.includes('dividend') || desc.includes('interest')) {
      return 'investment_income';
    }
    
    return 'other_income';
  }

  /**
   * Categorize expense transaction
   */
  categorizeExpense(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('rent') || desc.includes('accommodation')) {
      return 'rent';
    }
    if (desc.includes('electricity') || desc.includes('water') || desc.includes('utility') || desc.includes('power')) {
      return 'utilities';
    }
    if (desc.includes('transport') || desc.includes('uber') || desc.includes('taxi') || desc.includes('bus') || desc.includes('fuel')) {
      return 'transportation';
    }
    if (desc.includes('medical') || desc.includes('hospital') || desc.includes('pharmacy') || desc.includes('health')) {
      return 'healthcare';
    }
    if (desc.includes('school') || desc.includes('education') || desc.includes('training') || desc.includes('course')) {
      return 'education';
    }
    if (desc.includes('business') || desc.includes('office') || desc.includes('equipment') || desc.includes('supplies')) {
      return 'business_expenses';
    }
    if (desc.includes('food') || desc.includes('restaurant') || desc.includes('grocery') || desc.includes('supermarket')) {
      return 'food';
    }
    if (desc.includes('entertainment') || desc.includes('movie') || desc.includes('cinema')) {
      return 'entertainment';
    }
    
    return 'other_expenses';
  }

  /**
   * Infer transaction type from description
   */
  inferTransactionType(description, amount) {
    const desc = description.toLowerCase();
    
    const incomeKeywords = ['salary', 'wage', 'deposit', 'credit', 'transfer in', 'payment received'];
    const expenseKeywords = ['withdrawal', 'debit', 'transfer out', 'payment', 'purchase', 'fee'];
    
    if (incomeKeywords.some(kw => desc.includes(kw))) {
      return 'income';
    }
    if (expenseKeywords.some(kw => desc.includes(kw))) {
      return 'expense';
    }
    
    // Default heuristic
    return 'expense';
  }

  /**
   * Check if expense is tax deductible
   */
  isTaxDeductible(category, description) {
    const deductibleCategories = [
      'healthcare',
      'education',
      'business_expenses'
    ];
    
    if (deductibleCategories.includes(category)) {
      return true;
    }
    
    // Check description for deductible keywords
    const desc = description.toLowerCase();
    const deductibleKeywords = ['medical', 'training', 'professional', 'charity', 'donation'];
    return deductibleKeywords.some(kw => desc.includes(kw));
  }

  /**
   * Check if expense is VAT applicable
   */
  isVATApplicable(category) {
    // VAT exempt categories
    const vatExempt = TAX_CONSTANTS.VAT.EXEMPT_CATEGORIES.map(c => c.replace('_', ' '));
    const categoryName = category.replace('_', ' ');
    
    return !vatExempt.some(exempt => categoryName.includes(exempt));
  }

  /**
   * Save transactions to database
   */
  async saveTransactions(transactions, userId, documentId, accountId) {
    const savedTransactions = [];
    
    for (const tx of transactions) {
      try {
        // Check for duplicates (same date, amount, description)
        const existing = await Transaction.findOne({
          user: userId,
          account: accountId,
          transactionDate: tx.transactionDate,
          amount: tx.amount,
          description: tx.description
        });

        if (!existing) {
          const transaction = await Transaction.create({
            user: userId,
            account: accountId,
            document: documentId,
            ...tx
          });
          savedTransactions.push(transaction);
        }
      } catch (error) {
        console.error('Error saving transaction:', error);
      }
    }

    return savedTransactions;
  }

  /**
   * Helper: Find column in row
   */
  findColumn(row, possibleNames) {
    for (const name of possibleNames) {
      const found = Object.keys(row).find(
        key => key.toLowerCase().trim() === name.toLowerCase().trim()
      );
      if (found) return found;
    }
    return null;
  }

  /**
   * Helper: Parse date
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Helper: Parse amount
   */
  parseAmount(amountStr) {
    if (!amountStr) return 0;
    const cleaned = String(amountStr).replace(/[₦$,\s]/g, '');
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
  }
}

module.exports = new DocumentProcessor();

