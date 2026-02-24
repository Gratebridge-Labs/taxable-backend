/**
 * Seed latest Nigerian tax updates for WhatsApp menu (2026 tax reform).
 * Run: node scripts/seedTaxUpdates.js
 * Sources: FIRS/NRS, 2026 Tax Reform, filing deadlines (Jan 2026).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const TaxUpdate = require('../models/TaxUpdate');

const UPDATES = [
  {
    title: '2026 tax reform in effect',
    summary: 'New rates, ₦800k tax-free threshold, FIRS → Nigeria Revenue Service (NRS). NIN = Tax ID from Jan 2026.',
    link: 'https://remotesolutionsafrica.com/nigeria-2026-tax-reform/',
    category: 'policy',
    active: true
  },
  {
    title: 'PAYE & filing deadlines 2026',
    summary: 'Employers: annual return by Jan 31. Individuals: file by Mar 31. Late remittance = 10% penalty + interest.',
    link: 'https://support.seamlesshr.com/2026-nigerian-tax-reform-faqs-',
    category: 'deadline',
    active: true
  },
  {
    title: 'Tax-free threshold ₦800,000',
    summary: 'Earn ₦800k or less? No PAYE. Rent relief 20% of gross, cap ₦500k. SMEs under ₦50m turnover: 100% CIT exemption.',
    link: 'https://www.forvismazars.com/ng/en/insights/publications/local-insights/nigeria-tax-reforms-2026',
    category: 'policy',
    active: true
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const existing = await TaxUpdate.countDocuments();
    if (existing > 0) {
      console.log(`Found ${existing} existing tax update(s). Adding new ones only (by title).`);
    }

    for (const u of UPDATES) {
      await TaxUpdate.findOneAndUpdate(
        { title: u.title },
        { $set: { ...u, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      console.log('✓', u.title);
    }

    console.log('Done. WhatsApp menu will show latest Nigerian tax updates.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
