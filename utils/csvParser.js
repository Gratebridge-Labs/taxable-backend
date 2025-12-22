/**
 * CSV Parser Utility
 * Parses CSV bank statements and extracts transactions
 */

const csv = require('csv-parser');
const fs = require('fs');
const { Readable } = require('stream');

/**
 * Parse CSV file and extract transactions
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Array>} Array of transaction objects
 */
const parseCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error('CSV file not found'));
    }

    const transactions = [];
    const stream = fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const transaction = parseCSVRow(row);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.error('Error parsing CSV row:', error, row);
        }
      })
      .on('end', () => {
        resolve(transactions);
      })
      .on('error', (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      });
  });
};

/**
 * Parse a single CSV row into a transaction object
 * Handles various CSV formats from different banks
 * @param {Object} row - CSV row object
 * @returns {Object|null} Transaction object or null if invalid
 */
const parseCSVRow = (row) => {
  // Try to identify common column names
  // Different banks use different column names
  
  // Date columns (common variations)
  const dateColumn = findColumn(row, ['date', 'transaction_date', 'value_date', 'posting_date', 'date_posted']);
  const dateStr = row[dateColumn];
  
  // Description/Narration columns
  const descriptionColumn = findColumn(row, ['description', 'narration', 'details', 'particulars', 'remarks', 'transaction_details']);
  const description = row[descriptionColumn] || '';
  
  // Amount columns (debit/credit or single amount)
  let amount = 0;
  let transactionType = null;
  
  // Try to find amount in credit/debit columns
  const creditColumn = findColumn(row, ['credit', 'deposit', 'credit_amount', 'inflow']);
  const debitColumn = findColumn(row, ['debit', 'withdrawal', 'debit_amount', 'outflow']);
  
  if (creditColumn && row[creditColumn]) {
    amount = parseAmount(row[creditColumn]);
    transactionType = 'income';
  } else if (debitColumn && row[debitColumn]) {
    amount = parseAmount(row[debitColumn]);
    transactionType = 'expense';
  } else {
    // Try single amount column
    const amountColumn = findColumn(row, ['amount', 'transaction_amount', 'value']);
    if (amountColumn) {
      amount = parseAmount(row[amountColumn]);
      // Try to infer type from description or use balance
      transactionType = inferTransactionType(description, amount);
    }
  }
  
  // Reference/Transaction ID
  const referenceColumn = findColumn(row, ['reference', 'transaction_id', 'ref', 'transaction_ref', 'tran_id']);
  const reference = row[referenceColumn] || '';

  // Parse date
  const date = parseDate(dateStr);
  
  if (!date || amount === 0) {
    return null; // Invalid transaction
  }

  return {
    date,
    amount: Math.abs(amount), // Always positive
    description: description.trim(),
    narration: description.trim(),
    transactionType,
    reference,
    rawRow: row
  };
};

/**
 * Find column name from possible variations
 * @param {Object} row - CSV row
 * @param {Array<string>} possibleNames - Array of possible column names
 * @returns {string|null} Found column name or null
 */
const findColumn = (row, possibleNames) => {
  // First try exact match (case insensitive)
  for (const name of possibleNames) {
    const found = Object.keys(row).find(
      key => key.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (found) return found;
  }
  
  // Try partial match
  for (const name of possibleNames) {
    const found = Object.keys(row).find(
      key => key.toLowerCase().includes(name.toLowerCase()) || 
             name.toLowerCase().includes(key.toLowerCase())
    );
    if (found) return found;
  }
  
  return null;
};

/**
 * Parse date string to Date object
 * @param {string} dateStr - Date string
 * @returns {Date|null} Parsed date or null
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;

  // Try different date formats
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{2})/, // DD/MM/YY
    /(\d{1,2})-(\d{1,2})-(\d{4})/,   // DD-MM-YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/,   // YYYY-MM-DD
    /(\d{1,2})\s+(\w+)\s+(\d{4})/     // DD MMM YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[3]) {
        // YYYY-MM-DD format
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else if (format === formats[4]) {
        // DD MMM YYYY format
        const months = {
          'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
          'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };
        const month = months[match[2].toLowerCase().substring(0, 3)];
        if (month !== undefined) {
          return new Date(parseInt(match[3]), month, parseInt(match[1]));
        }
      } else {
        // DD/MM/YYYY or DD-MM-YYYY format
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        let year = parseInt(match[3]);
        
        // Handle 2-digit years
        if (year < 100) {
          year = year < 50 ? 2000 + year : 1900 + year;
        }
        
        return new Date(year, month, day);
      }
    }
  }

  // Try native Date parsing as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
};

/**
 * Parse amount string to number
 * @param {string} amountStr - Amount string
 * @returns {number} Parsed amount
 */
const parseAmount = (amountStr) => {
  if (!amountStr) return 0;
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = String(amountStr).replace(/[₦$,\s]/g, '');
  const amount = parseFloat(cleaned);
  
  return isNaN(amount) ? 0 : amount;
};

/**
 * Infer transaction type from description and amount
 * @param {string} description - Transaction description
 * @param {number} amount - Transaction amount
 * @returns {string} 'income' or 'expense'
 */
const inferTransactionType = (description, amount) => {
  const desc = description.toLowerCase();
  
  // Income keywords
  const incomeKeywords = ['salary', 'wage', 'deposit', 'credit', 'transfer in', 'payment received', 'income'];
  const hasIncomeKeyword = incomeKeywords.some(keyword => desc.includes(keyword));
  
  // Expense keywords
  const expenseKeywords = ['withdrawal', 'debit', 'transfer out', 'payment', 'purchase', 'fee', 'charge'];
  const hasExpenseKeyword = expenseKeywords.some(keyword => desc.includes(keyword));
  
  if (hasIncomeKeyword) return 'income';
  if (hasExpenseKeyword) return 'expense';
  
  // Default: assume expense for withdrawals, income for deposits
  // This is a heuristic - may need adjustment based on bank format
  return 'expense';
};

module.exports = {
  parseCSV,
  parseCSVRow,
  parseDate,
  parseAmount
};

