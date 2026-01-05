/**
 * Migration script to fix TaxableProfile index
 * Drops the old { user: 1, year: 1 } index and ensures the new { user: 1, year: 1, profileType: 1 } index exists
 */

const mongoose = require('mongoose');
const TaxableProfile = require('../models/TaxableProfile');
require('dotenv').config();

async function fixIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');

    const collection = mongoose.connection.db.collection('taxableprofiles');

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));

    // Drop the old index if it exists
    try {
      await collection.dropIndex('user_1_year_1');
      console.log('✓ Dropped old index: user_1_year_1');
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ Old index user_1_year_1 does not exist (already removed)');
      } else {
        throw error;
      }
    }

    // Ensure the new index exists (Mongoose will create it automatically, but we can also create it explicitly)
    try {
      await collection.createIndex(
        { user: 1, year: 1, profileType: 1 },
        { unique: true, name: 'user_1_year_1_profileType_1' }
      );
      console.log('✓ Created new index: user_1_year_1_profileType_1');
    } catch (error) {
      if (error.code === 85 || error.message.includes('already exists')) {
        console.log('ℹ New index user_1_year_1_profileType_1 already exists');
      } else {
        throw error;
      }
    }

    // Verify the final indexes
    const finalIndexes = await collection.indexes();
    console.log('\nFinal indexes:');
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n✓ Index migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('✗ Error fixing index:', error);
    process.exit(1);
  }
}

fixIndex();

