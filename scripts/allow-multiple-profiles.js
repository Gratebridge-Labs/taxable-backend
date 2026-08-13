/**
 * Migration script to allow multiple tax folders per user/year/profileType.
 * Drops the unique { user: 1, year: 1, profileType: 1 } index and recreates it
 * as a plain (non-unique) index, so users can create as many folders as they need
 * regardless of the year or profile type.
 */

const mongoose = require('mongoose');
const TaxableProfile = require('../models/TaxableProfile');
require('dotenv').config();

const INDEX_NAME = 'user_1_year_1_profileType_1';

async function allowMultipleProfiles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');

    const collection = mongoose.connection.db.collection('taxableprofiles');

    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map((idx) => idx.name));

    try {
      await collection.dropIndex(INDEX_NAME);
      console.log(`✓ Dropped unique index: ${INDEX_NAME}`);
    } catch (error) {
      if (error.code === 27 || String(error.message).includes('index not found')) {
        console.log(`ℹ Index ${INDEX_NAME} does not exist (already removed)`);
      } else {
        throw error;
      }
    }

    try {
      await collection.createIndex(
        { user: 1, year: 1, profileType: 1 },
        { name: INDEX_NAME }
      );
      console.log(`✓ Recreated non-unique index: ${INDEX_NAME}`);
    } catch (error) {
      if (error.code === 85 || String(error.message).includes('already exists')) {
        console.log(`ℹ Index ${INDEX_NAME} already exists`);
      } else {
        throw error;
      }
    }

    const finalIndexes = await collection.indexes();
    console.log('\nFinal indexes:');
    finalIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (unique: ${idx.unique || false})`);
    });

    console.log('\n✓ Migration completed — multiple folders per year/type now allowed.');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error in migration:', error);
    process.exit(1);
  }
}

allowMultipleProfiles();
