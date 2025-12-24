/**
 * Email Service
 * Handles sending emails using SMTP
 * 
 * Note: This service is ready for use but email functionality
 * is not yet integrated into the application endpoints.
 */

const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter = null;

/**
 * Initialize email transporter
 * @returns {Object} Nodemailer transporter
 */
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'mail.gettaxable.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER || 'do_not_reply@gettaxable.com',
        pass: process.env.EMAIL_PASS
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body
 * @param {string} options.html - HTML body (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const emailTransporter = getTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Taxable'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html: html || text
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Send welcome email to new user
 * @param {string} email - User email
 * @param {string} firstName - User first name
 * @returns {Promise<Object>} Email send result
 */
const sendWelcomeEmail = async (email, firstName = 'User') => {
  const subject = 'Welcome to Taxable - Your Tax Management Platform';
  const text = `
Hello ${firstName},

Welcome to Taxable! We're excited to help you prepare for the 2026 Tax Reform in Nigeria.

With Taxable, you can:
- Upload and process bank statements
- Track your income and expenses
- Get automatic tax estimates
- Receive personalized tax tips
- Generate tax-filing ready reports

Get started by uploading your first bank statement or adding a transaction manually.

If you have any questions, feel free to reach out to our support team.

Best regards,
The Taxable Team
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Taxable!</h1>
    </div>
    <div class="content">
      <p>Hello ${firstName},</p>
      <p>Welcome to Taxable! We're excited to help you prepare for the 2026 Tax Reform in Nigeria.</p>
      <p>With Taxable, you can:</p>
      <ul>
        <li>Upload and process bank statements</li>
        <li>Track your income and expenses</li>
        <li>Get automatic tax estimates</li>
        <li>Receive personalized tax tips</li>
        <li>Generate tax-filing ready reports</li>
      </ul>
      <p>Get started by uploading your first bank statement or adding a transaction manually.</p>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>Best regards,<br>The Taxable Team</p>
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} resetToken - Password reset token
 * @param {string} resetUrl - Password reset URL
 * @returns {Promise<Object>} Email send result
 */
const sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
  const subject = 'Reset Your Taxable Password';
  const text = `
Hello,

You requested to reset your password for your Taxable account.

Click the following link to reset your password:
${resetUrl}?token=${resetToken}

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email.

Best regards,
The Taxable Team
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>You requested to reset your password for your Taxable account.</p>
      <p><a href="${resetUrl}?token=${resetToken}" class="button">Reset Password</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p>${resetUrl}?token=${resetToken}</p>
      <p><small>This link will expire in 1 hour.</small></p>
      <p>If you did not request this password reset, please ignore this email.</p>
      <p>Best regards,<br>The Taxable Team</p>
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Verify email configuration
 * @returns {Promise<boolean>} True if configuration is valid
 */
const verifyEmailConfig = async () => {
  try {
    const emailTransporter = getTransporter();
    await emailTransporter.verify();
    console.log('Email server is ready');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  verifyEmailConfig,
  getTransporter
};

