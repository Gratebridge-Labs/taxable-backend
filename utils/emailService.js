const nodemailer = require('nodemailer');

// Create transporter (supports port 587 STARTTLS and port 465 SSL)
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email credentials are not configured. Please set EMAIL_USER and EMAIL_PASS in your .env file.');
  }

  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 465;
  const secure = process.env.EMAIL_SECURE === 'true';

  const config = {
    host,
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    tls: {
      rejectUnauthorized: false, // allow self-signed / hostname mismatch (e.g. mail.gettaxable.com)
      servername: host
    }
  };

  // Port 587: require STARTTLS by default (set EMAIL_REQUIRE_TLS=false to disable if your server doesn't support it)
  if (port === 587 && !secure && process.env.EMAIL_REQUIRE_TLS !== 'false') {
    config.requireTLS = true;
  }

  // SMTP debug: set DEBUG_EMAIL=true in .env to log raw SMTP traffic (connection, commands, responses)
  if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_EMAIL === '1') {
    config.debug = true;
  }

  return nodemailer.createTransport(config);
};

// Generate OTP email template with the color palette
const generateOTPEmailTemplate = (firstName, otpCode) => {
  // Color palette from the image:
  // Dark Blue (Navy): #1a3a5c or similar
  // Light Pink: #f5d7d7 or similar
  // Light Blue: #a8d5e2 or similar
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - Taxable</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with Dark Blue -->
          <tr>
            <td style="background-color: #1a3a5c; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">
                Taxable
              </h1>
            </td>
          </tr>
          
          <!-- Content Area -->
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <h2 style="margin: 0 0 20px 0; color: #1a3a5c; font-size: 24px; font-weight: 600;">
                Verify Your Email Address
              </h2>
              
              <p style="margin: 0 0 25px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              
              <p style="margin: 0 0 30px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Thank you for signing up with Taxable! To complete your registration, please verify your email address by entering the code below:
              </p>
              
              <!-- OTP Code Box with Light Pink background -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                <tr>
                  <td align="center" style="background-color: #f5d7d7; padding: 25px; border-radius: 8px; border: 2px solid #e8c4c4;">
                    <div style="font-size: 36px; font-weight: 700; color: #1a3a5c; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                      ${otpCode}
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                This code will expire in <strong style="color: #1a3a5c;">10 minutes</strong>. If you didn't request this code, please ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer with Light Blue accent -->
          <tr>
            <td style="background-color: #a8d5e2; padding: 25px 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #1a3a5c; font-size: 14px; font-weight: 500;">
                Need help? Contact us at support@gettaxable.com
              </p>
              <p style="margin: 0; color: #1a3a5c; font-size: 12px; opacity: 0.8;">
                © ${new Date().getFullYear()} Taxable. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
        
        <!-- Additional Info -->
        <table role="presentation" style="max-width: 600px; width: 100%; margin-top: 20px;">
          <tr>
            <td align="center" style="padding: 0 20px;">
              <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// Generate welcome email template with the color palette
const generateWelcomeEmailTemplate = (firstName) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Taxable</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with Dark Blue -->
          <tr>
            <td style="background-color: #1a3a5c; padding: 40px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 600; letter-spacing: -0.5px;">
                Welcome to Taxable! 🎉
              </h1>
            </td>
          </tr>
          
          <!-- Content Area -->
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <h2 style="margin: 0 0 20px 0; color: #1a3a5c; font-size: 24px; font-weight: 600;">
                Your Account is Ready
              </h2>
              
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Congratulations! Your email has been successfully verified and your Taxable account is now active. We're thrilled to have you on board as we prepare for Nigeria's 2026 Tax Reform.
              </p>
              
              <!-- Highlight Box with Light Pink background -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                <tr>
                  <td style="background-color: #f5d7d7; padding: 25px; border-radius: 8px; border-left: 4px solid #1a3a5c;">
                    <p style="margin: 0; color: #1a3a5c; font-size: 16px; font-weight: 500; line-height: 1.6;">
                      You're now ready to explore our platform and stay ahead of the upcoming tax changes. We're here to help you navigate the 2026 Tax Reform with confidence.
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0 0; color: #555555; font-size: 16px; line-height: 1.6;">
                If you have any questions or need assistance, our support team is always ready to help. Simply reach out to us at <a href="mailto:support@gettaxable.com" style="color: #1a3a5c; text-decoration: none; font-weight: 500;">support@gettaxable.com</a>.
              </p>
              
              <p style="margin: 30px 0 0 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Thank you for choosing Taxable. We look forward to supporting you on your tax preparation journey.
              </p>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #1a3a5c;">The Taxable Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer with Light Blue accent -->
          <tr>
            <td style="background-color: #a8d5e2; padding: 25px 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #1a3a5c; font-size: 14px; font-weight: 500;">
                Need help? Contact us at support@gettaxable.com
              </p>
              <p style="margin: 0; color: #1a3a5c; font-size: 12px; opacity: 0.8;">
                © ${new Date().getFullYear()} Taxable. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
        
        <!-- Additional Info -->
        <table role="presentation" style="max-width: 600px; width: 100%; margin-top: 20px;">
          <tr>
            <td align="center" style="padding: 0 20px;">
              <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// Send OTP email
const sendOTPEmail = async (email, firstName, otpCode) => {
  const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  console.log('[Email] Sending OTP to', email, 'from', fromEmail || '(EMAIL_FROM not set)');
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Verify Your Email Address - Taxable',
      html: generateOTPEmailTemplate(firstName, otpCode),
      text: `Hi ${firstName},\n\nThank you for signing up with Taxable! To complete your registration, please verify your email address by entering this code: ${otpCode}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.\n\nBest regards,\nThe Taxable Team`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] OTP sent successfully to', email, 'messageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const smtpMsg = error.response ? ` SMTP: ${String(error.response).slice(0, 200)}` : '';
    console.error('[Email] OTP send failed to', email, '|', error.message, '| code:', error.code, '| command:', error.command, smtpMsg);
    throw new Error(error.message || 'Failed to send verification email');
  }
};

// Generate password reset email template with the color palette
const generatePasswordResetEmailTemplate = (firstName, otpCode) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - Taxable</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with Dark Blue -->
          <tr>
            <td style="background-color: #1a3a5c; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">
                Taxable
              </h1>
            </td>
          </tr>
          
          <!-- Content Area -->
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <h2 style="margin: 0 0 20px 0; color: #1a3a5c; font-size: 24px; font-weight: 600;">
                Reset Your Password
              </h2>
              
              <p style="margin: 0 0 25px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              
              <p style="margin: 0 0 30px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. If you didn't make this request, please ignore this email. Otherwise, use the code below to reset your password:
              </p>
              
              <!-- OTP Code Box with Light Pink background -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                <tr>
                  <td align="center" style="background-color: #f5d7d7; padding: 25px; border-radius: 8px; border: 2px solid #e8c4c4;">
                    <div style="font-size: 36px; font-weight: 700; color: #1a3a5c; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                      ${otpCode}
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                This code will expire in <strong style="color: #1a3a5c;">10 minutes</strong>. For security reasons, if you didn't request this code, please ignore this email and your password will remain unchanged.
              </p>
            </td>
          </tr>
          
          <!-- Footer with Light Blue accent -->
          <tr>
            <td style="background-color: #a8d5e2; padding: 25px 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #1a3a5c; font-size: 14px; font-weight: 500;">
                Need help? Contact us at support@gettaxable.com
              </p>
              <p style="margin: 0; color: #1a3a5c; font-size: 12px; opacity: 0.8;">
                © ${new Date().getFullYear()} Taxable. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
        
        <!-- Additional Info -->
        <table role="presentation" style="max-width: 600px; width: 100%; margin-top: 20px;">
          <tr>
            <td align="center" style="padding: 0 20px;">
              <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// Send welcome email
const sendWelcomeEmail = async (email, firstName) => {
  try {
    const transporter = createTransporter();
    
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Welcome to Taxable - Your Account is Ready!',
      html: generateWelcomeEmailTemplate(firstName),
      text: `Hi ${firstName},\n\nCongratulations! Your email has been successfully verified and your Taxable account is now active. We're thrilled to have you on board as we prepare for Nigeria's 2026 Tax Reform.\n\nYou're now ready to explore our platform and stay ahead of the upcoming tax changes. We're here to help you navigate the 2026 Tax Reform with confidence.\n\nIf you have any questions or need assistance, our support team is always ready to help. Simply reach out to us at support@gettaxable.com.\n\nThank you for choosing Taxable. We look forward to supporting you on your tax preparation journey.\n\nBest regards,\nThe Taxable Team`
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Welcome send failed to', email, '|', error.message, '| code:', error.code, '|', error.response ? `SMTP: ${String(error.response).slice(0, 150)}` : '');
    throw new Error(error.message || 'Failed to send welcome email');
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, firstName, otpCode) => {
  try {
    const transporter = createTransporter();
    
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Reset Your Password - Taxable',
      html: generatePasswordResetEmailTemplate(firstName, otpCode),
      text: `Hi ${firstName},\n\nWe received a request to reset your password. If you didn't make this request, please ignore this email. Otherwise, use the code below to reset your password:\n\n${otpCode}\n\nThis code will expire in 10 minutes. For security reasons, if you didn't request this code, please ignore this email and your password will remain unchanged.\n\nBest regards,\nThe Taxable Team`
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Password reset send failed to', email, '|', error.message, '| code:', error.code, '|', error.response ? `SMTP: ${String(error.response).slice(0, 150)}` : '');
    throw new Error(error.message || 'Failed to send password reset email');
  }
};

// Subscription active email (after Paystack webhook confirms payment)
const generateSubscriptionActiveEmailTemplate = (firstName, planName = 'Subscription') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your subscription is active - Taxable</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #1a3a5c; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Taxable</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1a3a5c; font-size: 24px;">Your subscription is active</h2>
              <p style="margin: 0 0 20px 0; color: #333; font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
              <p style="margin: 0 0 20px 0; color: #555; font-size: 16px; line-height: 1.6;">Thank you for your payment. Your <strong>${planName}</strong> subscription is now active.</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
                <tr>
                  <td style="background-color: #f5d7d7; padding: 20px; border-radius: 8px; border-left: 4px solid #1a3a5c;">
                    <p style="margin: 0; color: #1a3a5c; font-size: 16px; font-weight: 500;">You can now use all features included in your plan. If you have any questions, contact us at <a href="mailto:support@gettaxable.com" style="color: #1a3a5c;">support@gettaxable.com</a>.</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">Best regards,<br>The Taxable Team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #a8d5e2; padding: 25px 40px; text-align: center;">
              <p style="margin: 0; color: #1a3a5c; font-size: 14px;">Need help? Contact us at support@gettaxable.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const sendSubscriptionActiveEmail = async (email, firstName, planName = 'Subscription') => {
  try {
    const transporter = createTransporter();
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Your Taxable subscription is active',
      html: generateSubscriptionActiveEmailTemplate(firstName, planName),
      text: `Hi ${firstName},\n\nThank you for your payment. Your ${planName} subscription is now active. You can now use all features included in your plan.\n\nBest regards,\nThe Taxable Team`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Subscription active email sent to', email, 'messageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Subscription active send failed to', email, '|', error.message);
    throw new Error(error.message || 'Failed to send subscription active email');
  }
};

// Subscription expiring soon (PDF: "Your subscription expires in 3 days. Renew now to avoid disruption.")
const generateSubscriptionExpiringEmailTemplate = (firstName, daysLeft, planName = 'Subscription') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your subscription expires soon - Taxable</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #1a3a5c; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Taxable</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1a3a5c; font-size: 24px;">Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h2>
              <p style="margin: 0 0 20px 0; color: #333; font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
              <p style="margin: 0 0 20px 0; color: #555; font-size: 16px; line-height: 1.6;">Your <strong>${planName}</strong> subscription will expire soon. Renew now to avoid disruption to your tax profile, bank sync, and filing.</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
                <tr>
                  <td style="background-color: #f5d7d7; padding: 20px; border-radius: 8px; border-left: 4px solid #1a3a5c;">
                    <p style="margin: 0; color: #1a3a5c; font-size: 16px; font-weight: 500;">Renew from the app or reply "Subscription plans" in WhatsApp to get a new payment link.</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">Best regards,<br>The Taxable Team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #a8d5e2; padding: 25px 40px; text-align: center;">
              <p style="margin: 0; color: #1a3a5c; font-size: 14px;">Need help? Contact us at support@gettaxable.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const sendSubscriptionExpiringEmail = async (email, firstName, daysLeft, planName = 'Subscription') => {
  try {
    const transporter = createTransporter();
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: `Your Taxable subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} – renew now`,
      html: generateSubscriptionExpiringEmailTemplate(firstName, daysLeft, planName),
      text: `Hi ${firstName},\n\nYour ${planName} subscription expires in ${daysLeft} day(s). Renew now to avoid disruption.\n\nBest regards,\nThe Taxable Team`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Subscription expiring email sent to', email, 'messageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Subscription expiring send failed to', email, '|', error.message);
    throw new Error(error.message || 'Failed to send subscription expiring email');
  }
};

// Tax profile created (PDF: keep user updated after completed action)
const generateTaxProfileCreatedEmailTemplate = (firstName, year = 2025) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tax profile created - Taxable</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
    <tr><td style="background:#1a3a5c;padding:24px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:24px;">Taxable</h1></td></tr>
    <tr><td style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#1a3a5c;font-size:20px;">Your ${year} tax profile is created</h2>
      <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.5;">Hi ${firstName},</p>
      <p style="margin:0 0 24px;color:#555;font-size:16px;line-height:1.5;">Your tax profile for ${year} has been set up successfully. Next steps: connect your bank, add reliefs & documents, then view your tax summary and file when ready.</p>
      <p style="margin:0;color:#666;font-size:14px;">Best regards,<br>The Taxable Team</p>
    </td></tr>
    <tr><td style="background:#a8d5e2;padding:20px;text-align:center;"><p style="margin:0;color:#1a3a5c;font-size:14px;">support@gettaxable.com</p></td></tr>
  </table>
</body>
</html>`;
};

const sendTaxProfileCreatedEmail = async (email, firstName, year = 2025) => {
  try {
    const transporter = createTransporter();
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: `Your ${year} tax profile is created – Taxable`,
      html: generateTaxProfileCreatedEmailTemplate(firstName, year),
      text: `Hi ${firstName},\n\nYour ${year} tax profile has been set up successfully. Next: connect your bank, add reliefs, then view your tax summary and file when ready.\n\nBest regards,\nThe Taxable Team`
    });
    console.log('[Email] Tax profile created sent to', email);
    return { success: true };
  } catch (error) {
    console.error('[Email] Tax profile created failed to', email, '|', error.message);
    throw new Error(error.message || 'Failed to send tax profile created email');
  }
};

// Bank connected (PDF: keep user updated)
const generateBankConnectedEmailTemplate = (firstName, bankLabel = 'your bank') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bank connected - Taxable</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
    <tr><td style="background:#1a3a5c;padding:24px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:24px;">Taxable</h1></td></tr>
    <tr><td style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#1a3a5c;font-size:20px;">Bank connected</h2>
      <p style="margin:0 0 16px;color:#333;font-size:16px;">Hi ${firstName},</p>
      <p style="margin:0 0 24px;color:#555;font-size:16px;">We've successfully connected ${bankLabel}. Your income can now be synced for your tax summary. You can connect more banks or add reliefs next.</p>
      <p style="margin:0;color:#666;font-size:14px;">Best regards,<br>The Taxable Team</p>
    </td></tr>
    <tr><td style="background:#a8d5e2;padding:20px;text-align:center;"><p style="margin:0;color:#1a3a5c;font-size:14px;">support@gettaxable.com</p></td></tr>
  </table>
</body>
</html>`;
};

const sendBankConnectedEmail = async (email, firstName, bankLabel = 'your bank') => {
  try {
    const transporter = createTransporter();
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Bank connected – Taxable',
      html: generateBankConnectedEmailTemplate(firstName, bankLabel),
      text: `Hi ${firstName},\n\nWe've connected ${bankLabel}. Your income can now be synced for your tax summary.\n\nBest regards,\nThe Taxable Team`
    });
    console.log('[Email] Bank connected sent to', email);
    return { success: true };
  } catch (error) {
    console.error('[Email] Bank connected failed to', email, '|', error.message);
    throw new Error(error.message || 'Failed to send bank connected email');
  }
};

// Filing submitted (PDF: "Submitted ✅" + "I'll update you once it's accepted" + receipt when available)
const generateFilingSubmittedEmailTemplate = (firstName, year = 2025, receiptUrl = null) => {
  const receiptSection = receiptUrl
    ? `<p style="margin:16px 0 0;color:#1a3a5c;"><a href="${receiptUrl}" style="color:#1a3a5c;">Download your filing receipt</a></p>`
    : '<p style="margin:16px 0 0;color:#666;font-size:14px;">We\'ll notify you when your receipt is ready to download.</p>';
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tax return submitted - Taxable</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
    <tr><td style="background:#1a3a5c;padding:24px;text-align:center;"><h1 style="margin:0;color:#fff;font-size:24px;">Taxable</h1></td></tr>
    <tr><td style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#1a3a5c;font-size:20px;">Your ${year} return has been submitted</h2>
      <p style="margin:0 0 16px;color:#333;font-size:16px;">Hi ${firstName},</p>
      <p style="margin:0 0 16px;color:#555;font-size:16px;">We've submitted your ${year} tax return. We'll update you once it's accepted, and you'll be able to download your filing receipt here.</p>
      ${receiptSection}
      <p style="margin:24px 0 0;color:#666;font-size:14px;">Best regards,<br>The Taxable Team</p>
    </td></tr>
    <tr><td style="background:#a8d5e2;padding:20px;text-align:center;"><p style="margin:0;color:#1a3a5c;font-size:14px;">support@gettaxable.com</p></td></tr>
  </table>
</body>
</html>`;
};

const sendFilingSubmittedEmail = async (email, firstName, year = 2025, receiptUrl = null) => {
  try {
    const transporter = createTransporter();
    const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: `Your ${year} tax return has been submitted – Taxable`,
      html: generateFilingSubmittedEmailTemplate(firstName, year, receiptUrl),
      text: `Hi ${firstName},\n\nYour ${year} tax return has been submitted. We'll update you once it's accepted.${receiptUrl ? ` Download your receipt: ${receiptUrl}` : ''}\n\nBest regards,\nThe Taxable Team`
    });
    console.log('[Email] Filing submitted sent to', email);
    return { success: true };
  } catch (error) {
    console.error('[Email] Filing submitted failed to', email, '|', error.message);
    throw new Error(error.message || 'Failed to send filing submitted email');
  }
};

// Send a test email (for health check / debugging). Requires `to` so you receive it at an inbox you check.
const sendTestEmail = async (to) => {
  const recipient = (to && to.trim()) || process.env.EMAIL_USER;
  if (!recipient) {
    throw new Error('Missing "to" address. Send a request body like: { "to": "your@email.com" } so the test email goes to an inbox you check.');
  }
  const fromName = process.env.EMAIL_FROM_NAME || 'Taxable';
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  console.log('[Email] Test email sending to:', recipient);
  const transporter = createTransporter();
  await transporter.verify();
  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: recipient,
    subject: 'Taxable – Email test',
    text: `This is a test email from the Taxable backend at ${new Date().toISOString()}. If you received this, the mail system is working.`,
    html: `<p>This is a test email from the Taxable backend at ${new Date().toISOString()}.</p><p>If you received this, the mail system is working.</p>`
  };
  const info = await transporter.sendMail(mailOptions);
  console.log('[Email] Test email sent to', recipient, 'messageId:', info.messageId);
  return { success: true, messageId: info.messageId, to: recipient };
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendSubscriptionActiveEmail,
  sendSubscriptionExpiringEmail,
  sendTaxProfileCreatedEmail,
  sendBankConnectedEmail,
  sendFilingSubmittedEmail,
  sendTestEmail,
  generateOTPEmailTemplate,
  generateWelcomeEmailTemplate,
  generatePasswordResetEmailTemplate,
  generateSubscriptionActiveEmailTemplate,
  generateSubscriptionExpiringEmailTemplate,
  generateTaxProfileCreatedEmailTemplate,
  generateBankConnectedEmailTemplate,
  generateFilingSubmittedEmailTemplate
};

