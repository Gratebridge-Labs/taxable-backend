const fs = require('fs');
const path = require('path');
const { parseImportBuffer } = require('../utils/csvImportParser');

const TEMPLATES = path.join(__dirname, '..', 'docs', 'templates');

function load(name) {
  return fs.readFileSync(path.join(TEMPLATES, name));
}

describe('csvImportParser', () => {
  test('parses VAT sample into sales and purchase totals', () => {
    const result = parseImportBuffer(load('vat_ledger_sample.csv'), 'vat', 'vat.csv');
    expect(result.acceptedCount).toBe(6);
    expect(result.errors).toEqual([]);
    expect(result.summary.standardSales).toBe(1500000);
    expect(result.summary.exemptSales).toBe(250000);
    expect(result.summary.wvatCredit).toBe(37500);
    expect(result.summary.allowableInputVAT).toBe(60000);
    expect(result.summary.nonAllowableOverheads).toBe(3750);
    expect(result.summary.nonAllowableCapEx).toBe(30000);
    expect(result.summary.salesRowCount).toBe(3);
    expect(result.summary.purchaseRowCount).toBe(3);
  });

  test('parses WHT sample into deductions', () => {
    const result = parseImportBuffer(load('wht_deductions_sample.csv'), 'wht', 'wht.csv');
    expect(result.acceptedCount).toBe(4);
    expect(result.wht.deductions[0]).toMatchObject({
      payee: 'Acme Supplies Ltd',
      tin: '12345678901',
      whtType: 'contracts',
      gross: 500000,
      whtRate: 5
    });
    expect(result.wht.deductions[1].whtType).toBe('consultancy');
  });

  test('parses PAYE sample into employees', () => {
    const result = parseImportBuffer(load('paye_employees_sample.csv'), 'paye', 'paye.csv');
    expect(result.acceptedCount).toBe(3);
    expect(result.paye.employees[0]).toMatchObject({
      firstName: 'Adaeze',
      lastName: 'Okonkwo',
      email: 'adaeze.okonkwo@example.com',
      monthlySalary: 450000,
      deductions: { pension: true, nhf: true, hmo: false, annualRent: false }
    });
    expect(result.paye.employees[2].deductions.annualRent).toBe(true);
    expect(result.paye.employees[2].annualRentAmount).toBe(2400000);
  });

  test('parses CIT WHT credit sample', () => {
    const result = parseImportBuffer(load('cit_wht_credits_sample.csv'), 'cit_wht_credits', 'cit.csv');
    expect(result.acceptedCount).toBe(3);
    expect(result.cit_wht_credits.credits[0]).toMatchObject({
      clientName: 'Nigerian Breweries Plc',
      creditRef: 'WHT-2026-001',
      grossValue: 2000000,
      withheldAmount: 100000
    });
  });

  test('rejects empty files', () => {
    expect(() => parseImportBuffer(Buffer.from('Ledger,Amount\n'), 'vat', 'empty.csv')).toThrow(/no data rows/i);
  });

  test('rejects unknown import types', () => {
    expect(() => parseImportBuffer(Buffer.from('a,b\n1,2'), 'unknown', 'x.csv')).toThrow(/importType/);
  });
});
