/**
 * Parse VAT / WHT / PAYE / CIT CSV or Excel uploads into tax-form fields.
 * Column names are matched loosely (case, punctuation, and common aliases).
 */
const path = require('path');
const XLSX = require('xlsx');

const IMPORT_TYPES = ['vat', 'wht', 'paye', 'cit_wht_credits'];

const SAMPLE_FILES = {
  vat: { file: 'vat_ledger_sample.csv', downloadName: 'taxable-vat-ledger-sample.csv' },
  wht: { file: 'wht_deductions_sample.csv', downloadName: 'taxable-wht-deductions-sample.csv' },
  paye: { file: 'paye_employees_sample.csv', downloadName: 'taxable-paye-employees-sample.csv' },
  cit_wht_credits: { file: 'cit_wht_credits_sample.csv', downloadName: 'taxable-cit-wht-credits-sample.csv' }
};

const TEMPLATES_DIR = path.join(__dirname, '..', 'docs', 'templates');

const WHT_TYPES = ['consultancy', 'contracts', 'transport', 'rent', 'director_fees'];
const WHT_RATES = [5, 10];

const WHT_TYPE_ALIASES = {
  consultancy: ['consultancy', 'professional', 'professional_fees', 'services', 'consulting', 'wht_on_services'],
  contracts: ['contracts', 'supplies', 'goods', 'contract', 'contracts_supplies', 'wht_on_contracts'],
  transport: ['transport', 'logistics', 'haulage', 'wht_on_haulage'],
  rent: ['rent', 'wht_on_rent'],
  director_fees: ['director', 'director_fees', 'directors_fees', 'director_s_fees']
};

function templatesDir() {
  return TEMPLATES_DIR;
}

function samplePath(importType) {
  const meta = SAMPLE_FILES[importType];
  if (!meta) return null;
  return path.join(TEMPLATES_DIR, meta.file);
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/₦/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/[₦,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseBool(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return ['true', 'yes', '1', 'y', 'on'].includes(s);
}

function parseRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/%/g, '').trim());
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n < 1) return Math.round(n * 100);
  return n;
}

function rowMap(row) {
  const map = {};
  for (const [key, value] of Object.entries(row || {})) {
    map[normalizeHeader(key)] = value;
  }
  return map;
}

function pick(map, aliases) {
  for (const alias of aliases) {
    if (map[alias] !== undefined && map[alias] !== '') return map[alias];
  }
  return '';
}

function parseSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function mapWhtType(value) {
  const key = normalizeHeader(value);
  if (!key) return null;
  if (WHT_TYPES.includes(key)) return key;
  for (const [type, aliases] of Object.entries(WHT_TYPE_ALIASES)) {
    if (aliases.includes(key)) return type;
  }
  return null;
}

function mapVatLedger(value) {
  const key = normalizeHeader(value);
  if (['sale', 'sales', 'output', 'output_vat'].includes(key)) return 'sale';
  if (['purchase', 'purchases', 'input', 'input_vat'].includes(key)) return 'purchase';
  return null;
}

function mapVatCategory(value, ledger) {
  const key = normalizeHeader(value);
  if (['standard', 'standard_rated', 'taxable'].includes(key)) return 'standard';
  if (['exempt', 'zero_rated', 'zero', 'export'].includes(key)) return 'exempt';
  if (['allowable', 'inventory', 'raw_materials', 'resale'].includes(key)) return 'allowable';
  if (['overhead', 'overheads', 'operational', 'opex'].includes(key)) return 'overhead';
  if (['capex', 'capital', 'asset', 'assets'].includes(key)) return 'capex';
  if (ledger === 'sale') return 'standard';
  if (ledger === 'purchase') return 'allowable';
  return null;
}

function parseVat(rows) {
  const errors = [];
  const accepted = [];
  const summary = {
    standardSales: 0,
    exemptSales: 0,
    wvatCredit: 0,
    allowableInputVAT: 0,
    nonAllowableOverheads: 0,
    nonAllowableCapEx: 0,
    salesRowCount: 0,
    purchaseRowCount: 0
  };

  rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const map = rowMap(raw);
    const amount = parseAmount(pick(map, ['amount', 'gross', 'gross_amount', 'invoice_amount']));
    const vatAmount = parseAmount(pick(map, ['vat_amount', 'vat', 'tax', 'tax_amount']));
    const wvat = parseAmount(pick(map, ['wvat_credit', 'wvat', 'withholding_vat']));
    let ledger = mapVatLedger(pick(map, ['ledger', 'type', 'side']));
    let category = mapVatCategory(pick(map, ['category', 'vat_category', 'rating']), ledger);

    if (!ledger) {
      if (category === 'standard' || category === 'exempt') ledger = 'sale';
      else if (category === 'allowable' || category === 'overhead' || category === 'capex') ledger = 'purchase';
    }
    if (!category) category = mapVatCategory('', ledger);

    if (!ledger) {
      errors.push({ row: rowNumber, message: 'Could not tell if this row is a sale or a purchase. Add a Ledger column (sale/purchase).' });
      return;
    }
    if (!(amount > 0) && !(vatAmount > 0) && !(wvat > 0)) {
      errors.push({ row: rowNumber, message: 'Amount is required' });
      return;
    }

    if (ledger === 'sale') {
      if (category === 'exempt') summary.exemptSales += amount;
      else summary.standardSales += amount;
      summary.wvatCredit += wvat;
      summary.salesRowCount += 1;
    } else {
      const inputVat = vatAmount > 0 ? vatAmount : Math.round(amount * 0.075);
      if (category === 'overhead') summary.nonAllowableOverheads += inputVat;
      else if (category === 'capex') summary.nonAllowableCapEx += inputVat;
      else summary.allowableInputVAT += inputVat;
      summary.purchaseRowCount += 1;
    }

    accepted.push({
      ledger,
      category,
      amount,
      vatAmount,
      wvatCredit: wvat,
      date: String(pick(map, ['date']) || ''),
      invoiceNumber: String(pick(map, ['invoice_number', 'invoice', 'invoice_no']) || ''),
      counterparty: String(pick(map, ['counterparty', 'customer', 'vendor', 'supplier']) || ''),
      description: String(pick(map, ['description']) || '')
    });
  });

  return { accepted, errors, summary };
}

function parseWht(rows) {
  const errors = [];
  const deductions = [];

  rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const map = rowMap(raw);
    const payee = String(pick(map, ['vendor_name', 'payee', 'vendor', 'payee_name']) || '').trim();
    const tin = String(pick(map, ['tax_id', 'tin', 'payee_tin', 'jtb_tin']) || '').replace(/\s/g, '');
    const whtType = mapWhtType(pick(map, ['payment_category', 'wht_type', 'category', 'type']));
    const gross = parseAmount(pick(map, ['gross_invoice_amount', 'gross', 'amount', 'invoice_amount']));
    const whtRate = parseRate(pick(map, ['wht_rate', 'rate']));
    const date = String(pick(map, ['date', 'transaction_date']) || '').trim();

    if (!payee) {
      errors.push({ row: rowNumber, message: 'Vendor Name is required' });
      return;
    }
    if (!whtType) {
      errors.push({ row: rowNumber, message: `Payment Category must be one of: ${WHT_TYPES.join(', ')}` });
      return;
    }
    if (!(gross > 0)) {
      errors.push({ row: rowNumber, message: 'Gross Invoice Amount must be greater than 0' });
      return;
    }
    if (!WHT_RATES.includes(Number(whtRate))) {
      errors.push({ row: rowNumber, message: 'WHT Rate must be 5 or 10' });
      return;
    }
    if (tin && !/^[0-9]{10,14}$/.test(tin)) {
      errors.push({ row: rowNumber, message: 'Tax ID must be 10-14 digits' });
      return;
    }

    deductions.push({
      payee,
      tin,
      whtType,
      gross,
      whtRate: Number(whtRate),
      date: date || undefined
    });
  });

  return { deductions, errors };
}

function parsePaye(rows) {
  const errors = [];
  const employees = [];

  rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const map = rowMap(raw);
    const firstName = String(pick(map, ['first_name', 'firstname']) || '').trim();
    const lastName = String(pick(map, ['last_name', 'lastname']) || '').trim();
    const email = String(pick(map, ['email', 'email_address']) || '').trim().toLowerCase();
    const phone = String(pick(map, ['phone', 'phone_number', 'mobile']) || '').replace(/\s/g, '');
    const jobPosition = String(pick(map, ['job_position', 'position', 'job_title', 'title']) || '').trim();
    const jtbTaxId = String(pick(map, ['tin', 'jtb_tax_id', 'tax_id', 'jtb']) || '').trim();
    const monthlySalary = parseAmount(pick(map, ['monthly_salary', 'salary', 'gross', 'gross_monthly_salary']));
    const annualRentAmount = parseAmount(pick(map, ['annual_rent', 'annual_rent_amount', 'rent']));
    const pension = parseBool(pick(map, ['pension']));
    const nhf = parseBool(pick(map, ['nhf']));
    const hmo = parseBool(pick(map, ['hmo', 'nhis']));

    const missing = [];
    if (!firstName) missing.push('First Name');
    if (!lastName) missing.push('Last Name');
    if (!email) missing.push('Email');
    if (!phone) missing.push('Phone');
    if (!jobPosition) missing.push('Job Position');
    if (!(monthlySalary > 0)) missing.push('Monthly Salary');
    if (missing.length) {
      errors.push({ row: rowNumber, message: `Missing required field(s): ${missing.join(', ')}` });
      return;
    }

    employees.push({
      firstName,
      lastName,
      email,
      phone,
      jobPosition,
      jtbTaxId,
      monthlySalary,
      deductions: {
        pension,
        nhf,
        hmo,
        annualRent: annualRentAmount > 0
      },
      annualRentAmount: annualRentAmount > 0 ? annualRentAmount : undefined
    });
  });

  return { employees, errors };
}

function parseCitCredits(rows) {
  const errors = [];
  const credits = [];

  rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const map = rowMap(raw);
    const clientName = String(pick(map, ['client_name', 'customer', 'payee', 'vendor_name']) || '').trim();
    const clientTIN = String(pick(map, ['client_tin', 'tin', 'tax_id']) || '').replace(/\s/g, '');
    const creditRef = String(pick(map, ['credit_reference', 'credit_ref', 'reference', 'ref']) || '').trim();
    const grossValue = parseAmount(pick(map, ['gross_value', 'gross', 'amount']));
    const withheldAmount = parseAmount(pick(map, ['withheld_amount', 'wht_amount', 'wht', 'credit_amount']));

    if (!clientName) {
      errors.push({ row: rowNumber, message: 'Client Name is required' });
      return;
    }
    if (!creditRef) {
      errors.push({ row: rowNumber, message: 'Credit Reference is required' });
      return;
    }
    if (!(grossValue > 0)) {
      errors.push({ row: rowNumber, message: 'Gross Value must be greater than 0' });
      return;
    }
    if (!(withheldAmount > 0)) {
      errors.push({ row: rowNumber, message: 'Withheld Amount must be greater than 0' });
      return;
    }

    credits.push({
      clientName,
      clientTIN,
      creditRef,
      grossValue,
      withheldAmount
    });
  });

  return { credits, errors };
}

function parseImportBuffer(buffer, importType, fileName) {
  if (!IMPORT_TYPES.includes(importType)) {
    const err = new Error(`importType must be one of: ${IMPORT_TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const rows = parseSpreadsheet(buffer).filter((row) =>
    Object.values(row).some((value) => String(value ?? '').trim() !== '')
  );

  if (!rows.length) {
    const err = new Error('The file has no data rows. Download the sample CSV and add at least one row.');
    err.status = 400;
    throw err;
  }

  let parsed;
  if (importType === 'vat') parsed = parseVat(rows);
  else if (importType === 'wht') parsed = parseWht(rows);
  else if (importType === 'paye') parsed = parsePaye(rows);
  else parsed = parseCitCredits(rows);

  const acceptedCount = parsed.accepted?.length
    ?? parsed.deductions?.length
    ?? parsed.employees?.length
    ?? parsed.credits?.length
    ?? 0;

  if (!acceptedCount) {
    const first = parsed.errors[0]?.message || 'No valid rows found';
    const err = new Error(first);
    err.status = 400;
    err.details = parsed.errors;
    throw err;
  }

  return {
    importType,
    fileName: fileName || 'upload.csv',
    rowCount: rows.length,
    acceptedCount,
    errors: parsed.errors,
    summary: parsed.summary,
    vat: importType === 'vat' ? { rows: parsed.accepted, summary: parsed.summary } : undefined,
    wht: importType === 'wht' ? { deductions: parsed.deductions } : undefined,
    paye: importType === 'paye' ? { employees: parsed.employees } : undefined,
    cit_wht_credits: importType === 'cit_wht_credits' ? { credits: parsed.credits } : undefined
  };
}

module.exports = {
  IMPORT_TYPES,
  SAMPLE_FILES,
  parseImportBuffer,
  samplePath,
  templatesDir
};
