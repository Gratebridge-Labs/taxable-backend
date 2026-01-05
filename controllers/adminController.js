const Admin = require('../models/Admin');
const User = require('../models/User');
const TaxableProfile = require('../models/TaxableProfile');
const ProfileReview = require('../models/ProfileReview');
const { generateToken } = require('../utils/jwt');
const { validationResult } = require('express-validator');
const { generateUniqueAdminCode } = require('../utils/adminCodeGenerator');

/**
 * Create a new admin account
 * Requires: fullName, email, password, adminCode (6 digits)
 */
const createAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { fullName, email, password, adminCode, role } = req.body;
    const adminRole = role || 'General';

    // Check if admin already exists by email
    const existingAdmin = await Admin.findOne({ 
      email: email.toLowerCase()
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }

    // Generate or validate admin code
    let finalAdminCode;
    if (adminCode) {
      // Validate provided code
      if (!/^[0-9]{6}$/.test(adminCode)) {
        return res.status(400).json({
          success: false,
          message: 'Admin code must be exactly 6 digits'
        });
      }
      
      // Check if code is already taken
      const codeExists = await Admin.findOne({ adminCode });
      if (codeExists) {
        return res.status(400).json({
          success: false,
          message: 'Admin code already in use'
        });
      }
      
      finalAdminCode = adminCode;
    } else {
      // Auto-generate unique admin code
      finalAdminCode = await generateUniqueAdminCode(adminRole);
    }

    // Create admin
    const admin = await Admin.create({
      fullName,
      email: email.toLowerCase(),
      password,
      adminCode: finalAdminCode,
      role: adminRole
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      data: {
        admin: {
          id: admin._id,
          fullName: admin.fullName,
          email: admin.email,
          adminCode: admin.adminCode,
          role: admin.role,
          createdAt: admin.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create admin error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Admin with this email or code already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while creating admin account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Admin login
 */
const adminLogin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find admin by email only (adminCode not required for login)
    const admin = await Admin.findOne({ 
      email: email.toLowerCase()
    }).select('+password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    admin.lastLogin = Date.now();
    await admin.save();

    // Generate token
    const token = generateToken({
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role,
      type: 'admin'
    });

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        token,
        admin: {
          id: admin._id,
          fullName: admin.fullName,
          email: admin.email,
          role: admin.role,
          lastLogin: admin.lastLogin
        }
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Change admin password
 */
const changeAdminPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { oldPassword, newPassword } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const admin = await Admin.findById(adminId).select('+password');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Verify old password
    const isPasswordValid = await admin.comparePassword(oldPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while changing password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all users (admin only)
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -twoFactorSecret')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all taxable profiles (admin only)
 */
const getAllTaxableProfiles = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, profileType, year } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;
    if (profileType) query.profileType = profileType;
    if (year) query.year = parseInt(year);

    const [profiles, total] = await Promise.all([
      TaxableProfile.find(query)
        .populate('user', 'firstName lastName email')
        .populate('author', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TaxableProfile.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      message: 'Taxable profiles retrieved successfully',
      data: {
        profiles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get all taxable profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving taxable profiles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all profile reviews (admin only)
 */
const getAllProfileReviews = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;

    const [reviews, total] = await Promise.all([
      ProfileReview.find(query)
        .populate('profileId', 'profileId profileType year status')
        .populate('requestedBy', 'firstName lastName email')
        .populate('reviewedBy', 'fullName email role')
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ProfileReview.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      message: 'Profile reviews retrieved successfully',
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get all profile reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving profile reviews',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all submitted/filled profiles (admin only)
 */
const getFilledProfiles = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, profileType, year, submitted, filed } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;
    if (profileType) query.profileType = profileType;
    if (year) query.year = parseInt(year);
    if (submitted !== undefined) query.submitted = submitted === 'true';
    if (filed !== undefined) query.filed = filed === 'true';

    const [profiles, total] = await Promise.all([
      TaxableProfile.find(query)
        .populate('user', 'firstName lastName email')
        .populate('author', 'firstName lastName email')
        .populate('lastReviewedBy', 'fullName email role')
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TaxableProfile.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      message: 'Filled profiles retrieved successfully',
      data: {
        profiles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get filled profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving filled profiles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Add admin notes/metadata to a profile (admin only)
 */
const addProfileNotes = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { profileId } = req.params;
    const { adminNotes, adminMetadata } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    // Find profile
    const profile = await TaxableProfile.findOne({
      $or: [
        { profileId: profileId },
        { _id: profileId }
      ]
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Update notes and metadata
    if (adminNotes !== undefined) {
      profile.adminNotes = adminNotes;
    }
    if (adminMetadata !== undefined) {
      profile.adminMetadata = { ...profile.adminMetadata, ...adminMetadata };
    }
    profile.lastReviewedBy = adminId;
    profile.lastReviewedAt = Date.now();
    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Profile notes updated successfully',
      data: {
        profileId: profile.profileId,
        adminNotes: profile.adminNotes,
        adminMetadata: profile.adminMetadata,
        lastReviewedBy: profile.lastReviewedBy,
        lastReviewedAt: profile.lastReviewedAt
      }
    });

  } catch (error) {
    console.error('Add profile notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile notes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createAdmin,
  adminLogin,
  changeAdminPassword,
  getAllUsers,
  getAllTaxableProfiles,
  getAllProfileReviews,
  getFilledProfiles,
  addProfileNotes
};

