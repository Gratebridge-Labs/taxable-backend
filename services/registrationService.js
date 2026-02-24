/**
 * Shared registration logic (used by auth API and WhatsApp flow).
 * Creates user, creates OTP, sends OTP email. Does not verify OTP.
 */
const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendOTPEmail } = require('../utils/emailService');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

/**
 * @param {Object} data - { firstName, lastName, email, phone, password }
 * @returns {Promise<{ user, otpCode }>}
 * @throws if email exists or email send fails
 */
async function registerUser(data) {
  const { firstName, lastName, email, phone, password } = data;
  const emailLower = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: emailLower });
  if (existingUser) {
    const err = new Error('User with this email already exists');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  let existingOTP = await OTP.findOne({
    email: emailLower,
    verified: false,
    expiresAt: { $gt: new Date() }
  });
  const otpCode = generateOTP();

  if (existingOTP) {
    existingOTP.code = otpCode;
    existingOTP.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await existingOTP.save();
  } else {
    await OTP.create({
      email: emailLower,
      code: otpCode,
      purpose: 'email_verification',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
  }

  const user = await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: emailLower,
    phone: phone.trim(),
    password,
    emailVerified: false
  });

  try {
    await sendOTPEmail(emailLower, firstName.trim(), otpCode);
  } catch (emailError) {
    await User.findByIdAndDelete(user._id);
    await OTP.findOneAndDelete({ email: emailLower, code: otpCode });
    const err = new Error('Failed to send verification email. Please try again.');
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }

  return { user, otpCode };
}

module.exports = { registerUser };
