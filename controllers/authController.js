const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/emailService');
const { validationResult } = require('express-validator');

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Register a new user
 * Creates user account and sends OTP for email verification
 */
const register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if there's a pending OTP for this email
    const existingOTP = await OTP.findOne({ 
      email: email.toLowerCase(),
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    // Generate new OTP
    const otpCode = generateOTP();

    // If there's an existing unverified OTP, update it; otherwise create new one
    if (existingOTP) {
      existingOTP.code = otpCode;
      existingOTP.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      existingOTP.verified = false;
      await existingOTP.save();
    } else {
      await OTP.create({
        email: email.toLowerCase(),
        code: otpCode,
        purpose: 'email_verification',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });
    }

    // Create user account (not verified yet)
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      password,
      emailVerified: false
    });

    // Send OTP email
    try {
      await sendOTPEmail(email.toLowerCase(), firstName, otpCode);
    } catch (emailError) {
      // If email fails, delete the user and OTP
      await User.findByIdAndDelete(user._id);
      await OTP.findOneAndDelete({ email: email.toLowerCase(), code: otpCode });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.'
      });
    }

    // Return success response (don't send password or sensitive data)
    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account.',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify OTP and activate user account
 * Verifies the OTP code and marks the user's email as verified
 */
const verifyOTP = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, code } = req.body;

    // Find the OTP record
    const otpRecord = await OTP.findOne({
      email: email.toLowerCase(),
      code: code,
      purpose: 'email_verification'
    });

    // Check if OTP exists
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code'
      });
    }

    // Check if OTP has already been verified
    if (otpRecord.verified) {
      return res.status(400).json({
        success: false,
        message: 'This OTP has already been used'
      });
    }

    // Check if OTP has expired
    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one'
      });
    }

    // Find the user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is already verified
    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Update user's email verification status
    user.emailVerified = true;
    await user.save();

    // Send welcome email (don't fail the request if email fails)
    try {
      await sendWelcomeEmail(user.email, user.firstName);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue with success response even if welcome email fails
    }

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Your account is now active.',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during OTP verification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  verifyOTP
};

