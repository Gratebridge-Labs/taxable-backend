const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendOTPEmail, sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { generateToken, generateResetToken } = require('../utils/jwt');
const { validationResult } = require('express-validator');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

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

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Your account is now active.',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        token: token
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

/**
 * Setup 2FA - Generate secret and QR code
 * Requires authentication (user must be logged in)
 */
const setup2FA = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before setting up 2FA'
      });
    }

    // Check if 2FA is already enabled
    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is already enabled'
      });
    }

    // Generate a secret
    const secret = speakeasy.generateSecret({
      name: `Taxable (${user.email})`,
      issuer: 'Taxable'
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Store the secret temporarily (user needs to verify before enabling)
    // We'll store it in the user model but mark 2FA as not enabled yet
    user.twoFactorSecret = secret.base32;
    await user.save();

    res.status(200).json({
      success: true,
      message: '2FA setup initiated. Scan the QR code with your authenticator app.',
      data: {
        secret: secret.base32, // For manual entry if QR code doesn't work
        qrCode: qrCodeUrl, // Base64 encoded QR code image
        manualEntryKey: secret.base32 // For manual entry
      }
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during 2FA setup',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Enable 2FA - Verify the code and enable 2FA
 * Requires authentication
 */
const enable2FA = async (req, res) => {
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
    const { code } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(userId).select('+twoFactorSecret');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        message: '2FA setup not initiated. Please setup 2FA first.'
      });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is already enabled'
      });
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2 // Allow 2 time steps (60 seconds) of drift
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please try again.'
      });
    }

    // Enable 2FA
    user.twoFactorEnabled = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication has been enabled successfully!',
      data: {
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    console.error('Enable 2FA error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while enabling 2FA',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Login with email, password, and 2FA code
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, twoFactorCode } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +twoFactorSecret');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // If 2FA is enabled, verify the code
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(400).json({
          success: false,
          message: 'Two-factor authentication code is required'
        });
      }

      if (!user.twoFactorSecret) {
        return res.status(500).json({
          success: false,
          message: '2FA is enabled but secret is missing. Please contact support.'
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2 // Allow 2 time steps (60 seconds) of drift
      });

      if (!verified) {
        return res.status(401).json({
          success: false,
          message: 'Invalid two-factor authentication code'
        });
      }
    }

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        token: token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Forgot Password - Send OTP to email for password reset
 */
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Tell user if account doesn't exist
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address first'
      });
    }

    // Check if there's an existing unverified password reset OTP
    const existingOTP = await OTP.findOne({
      email: email.toLowerCase(),
      purpose: 'password_reset',
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
        purpose: 'password_reset',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });
    }

    // Send password reset email
    try {
      await sendPasswordResetEmail(email.toLowerCase(), user.firstName, otpCode);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Password reset code has been sent to your email address.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify Reset OTP - Verify OTP code and return reset token
 */
const verifyResetOTP = async (req, res) => {
  try {
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
      purpose: 'password_reset'
    }).select('+resetToken');

    // Check if OTP exists
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    // Check if OTP has already been verified
    if (otpRecord.verified) {
      return res.status(400).json({
        success: false,
        message: 'This reset code has already been used'
      });
    }

    // Check if OTP has expired
    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired. Please request a new one'
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

    // Generate reset token
    const resetToken = generateResetToken();

    // Mark OTP as verified and store reset token
    otpRecord.verified = true;
    otpRecord.resetToken = resetToken;
    otpRecord.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await otpRecord.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. You can now reset your password.',
      data: {
        resetToken: resetToken
      }
    });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while verifying the reset code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Reset Password - Use reset token to set new password
 */
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, resetToken, newPassword } = req.body;

    // Find the OTP record with reset token
    const otpRecord = await OTP.findOne({
      email: email.toLowerCase(),
      purpose: 'password_reset',
      resetToken: resetToken
    }).select('+resetToken');

    // Check if OTP record with reset token exists
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if OTP was verified
    if (!otpRecord.verified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify the OTP code first'
      });
    }

    // Check if reset token has expired
    if (!otpRecord.resetTokenExpiresAt || otpRecord.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new password reset'
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

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    // Clear the reset token (optional, for security)
    otpRecord.resetToken = undefined;
    otpRecord.resetTokenExpiresAt = undefined;
    await otpRecord.save();

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting your password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Change Password - Change password from old to new (requires authentication)
 */
const changePassword = async (req, res) => {
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
    const { oldPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find user with password field
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify old password
    const isOldPasswordValid = await user.comparePassword(oldPassword);
    if (!isOldPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is different from old password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password'
      });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password has been changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while changing your password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  verifyOTP,
  setup2FA,
  enable2FA,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  changePassword
};

