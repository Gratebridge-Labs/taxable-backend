const TaxableProfile = require('../models/TaxableProfile');
const { validateYear, validateProfileType } = require('../utils/profileValidation');
const { validationResult } = require('express-validator');

/**
 * Create a new Taxable Profile
 * Requires: email verification, valid year, profile type
 */
const createProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user?.userId;
    const { year, profileType } = req.body;

    // Convert year to number (express-validator should handle this, but ensure it's a number)
    const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;

    // Validate year
    const yearValidation = validateYear(yearNum);
    if (!yearValidation.valid) {
      return res.status(400).json({
        success: false,
        message: yearValidation.message
      });
    }

    // Validate profile type
    const profileTypeValidation = validateProfileType(profileType);
    if (!profileTypeValidation.valid) {
      return res.status(400).json({
        success: false,
        message: profileTypeValidation.message
      });
    }

    // Check if profile already exists for this user and year
    const existingProfile = await TaxableProfile.findOne({
      user: userId,
      year: yearNum
    });

    if (existingProfile) {
      return res.status(409).json({
        success: false,
        message: `You already have a tax profile for the year ${yearNum}`
      });
    }

    // Create new profile
    const profile = await TaxableProfile.create({
      user: userId,
      year: yearNum,
      profileType: profileType,
      status: 'draft'
    });

    res.status(201).json({
      success: true,
      message: 'Tax profile created successfully',
      data: {
        profileId: profile.profileId,
        id: profile._id,
        year: profile.year,
        profileType: profile.profileType,
        status: profile.status,
        createdAt: profile.createdAt
      }
    });
  } catch (error) {
    console.error('Create profile error:', error);
    
    // Handle duplicate key error (shouldn't happen due to check, but just in case)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A profile already exists for this year'
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while creating your tax profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user's profiles
 * Returns all profiles for the authenticated user
 */
const getUserProfiles = async (req, res) => {
  try {
    const userId = req.user?.userId;

    const profiles = await TaxableProfile.find({ user: userId })
      .sort({ year: -1, createdAt: -1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      message: 'Profiles retrieved successfully',
      data: {
        profiles: profiles,
        count: profiles.length
      }
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving your profiles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a specific profile by ID (supports both MongoDB _id and custom profileId)
 */
const getProfileById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    // Try to find by custom profileId first, then by MongoDB _id
    const profile = await TaxableProfile.findOne({
      $or: [
        { profileId: profileId, user: userId },
        { _id: profileId, user: userId }
      ]
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        profile: profile
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createProfile,
  getUserProfiles,
  getProfileById
};

