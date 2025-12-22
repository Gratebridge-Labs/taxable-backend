/**
 * PDF Parser Utility
 * Extracts text from PDF bank statements
 */

const pdfParse = require('pdf-parse');
const fs = require('fs');

/**
 * Parse PDF file and extract text
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<Object>} Parsed PDF data with text
 */
const parsePDF = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('PDF file not found');
    }

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
      metadata: data.metadata
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
};

/**
 * Extract transactions from PDF text
 * This is a basic implementation - can be enhanced with regex patterns
 * for specific bank statement formats
 * @param {string} text - Extracted PDF text
 * @returns {Array} Array of potential transaction objects
 */
const extractTransactionsFromPDF = (text) => {
  const transactions = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Common patterns for bank statements
  // This is a simplified parser - real implementations would need
  // bank-specific format recognition
  
  // Look for date patterns (DD/MM/YYYY, DD-MM-YYYY, etc.)
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
  
  // Look for amount patterns (₦123,456.78 or 123456.78)
  const amountPattern = /[₦]?[\d,]+\.?\d*/g;

  let currentDate = null;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    
    // Check if line contains a date
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      currentDate = parseDate(dateMatch[1]);
    }

    // Check if line contains amounts (potential transaction)
    const amounts = line.match(amountPattern);
    if (amounts && amounts.length >= 1 && currentDate) {
      // Try to extract transaction details
      const amount = parseAmount(amounts[0]);
      
      // Get description (rest of the line or next few lines)
      let description = line.replace(datePattern, '').replace(amountPattern, '').trim();
      
      // If description is too short, try to get more context
      if (description.length < 5 && lineIndex + 1 < lines.length) {
        description = lines[lineIndex + 1].trim();
      }

      if (amount > 0 && description.length > 0) {
        transactions.push({
          date: currentDate,
          amount: amount,
          description: description,
          rawLine: line
        });
      }
    }

    lineIndex++;
  }

  return transactions;
};

/**
 * Parse date string to Date object
 * @param {string} dateStr - Date string in various formats
 * @returns {Date|null} Parsed date or null
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;

  // Try different date formats
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{2})/, // DD/MM/YY
    /(\d{1,2})-(\d{1,2})-(\d{4})/,   // DD-MM-YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/    // YYYY-MM-DD
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[3]) {
        // YYYY-MM-DD format
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
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

  return null;
};

/**
 * Parse amount string to number
 * @param {string} amountStr - Amount string (e.g., "₦1,234.56" or "1234.56")
 * @returns {number} Parsed amount
 */
const parseAmount = (amountStr) => {
  if (!amountStr) return 0;
  
  // Remove currency symbols and commas
  const cleaned = amountStr.replace(/[₦$,\s]/g, '');
  const amount = parseFloat(cleaned);
  
  return isNaN(amount) ? 0 : amount;
};

module.exports = {
  parsePDF,
  extractTransactionsFromPDF,
  parseDate,
  parseAmount
};

