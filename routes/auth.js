const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const PasswordReset = require('../models/PasswordReset');
const auth = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { sendSmsPhilSMS } = require('../utils/philsms');

const OTP_EXP_MIN = Number(process.env.OTP_EXPIRES_MIN || 15);
const RESET_EXP_MIN = Number(process.env.RESET_TOKEN_EXPIRES_MIN || 15);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RESET_RATE_LIMIT_PER_HOUR = Number(process.env.RESET_RATE_LIMIT_PER_HOUR || 5);

const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function buildOtpEmail({ name, otp, locale = 'en' }) {
  const intro = locale === 'fil'
    ? `Hello ${name || 'user'}, narito ang iyong OTP para sa pag-reset ng password.`
    : `Hello ${name || 'user'}, here is your OTP to reset your password.`;
  const expiry = locale === 'fil'
    ? `Balido sa loob ng ${OTP_EXP_MIN} minuto.`
    : `It is valid for ${OTP_EXP_MIN} minutes.`;
  return {
    subject: locale === 'fil' ? 'I-reset ang iyong password' : 'Reset your password',
    text: `${intro}\n\nOTP: ${otp}\n${expiry}\n\nIf you did not request this, you can ignore this message.`,
    html: `<p>${intro}</p><p style="font-size:22px;font-weight:bold;letter-spacing:3px">${otp}</p><p>${expiry}</p><p>If you did not request this, you can ignore this message.</p>`,
  };
}

function buildRegistrationConfirmationEmail({ name, verificationToken, locale = 'en', baseUrl = process.env.BASE_URL || 'http://localhost:3000' }) {
  const verificationLink = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;
  const intro = locale === 'fil'
    ? `Hello ${name || 'user'}, salamat sa pagrehistro sa EyyTrike!`
    : `Hello ${name || 'user'}, thank you for registering with EyyTrike!`;
  const instruction = locale === 'fil'
    ? `Mangyaring i-click ang link sa ibaba upang i-verify ang iyong email address:`
    : `Please click the link below to verify your email address:`;
  const alternative = locale === 'fil'
    ? `Kung hindi mo ma-click ang link, kopyahin at i-paste ito sa iyong browser:`
    : `If you cannot click the link, copy and paste it into your browser:`;
  const footer = locale === 'fil'
    ? `Kung hindi ka nagrehistro sa EyyTrike, maaari mong balewalain ang email na ito.`
    : `If you did not register for EyyTrike, you can safely ignore this email.`;
  
  return {
    subject: locale === 'fil' ? 'I-verify ang iyong email address - EyyTrike' : 'Verify your email address - EyyTrike',
    text: `${intro}\n\n${instruction}\n${verificationLink}\n\n${alternative}\n${verificationLink}\n\n${footer}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">${intro}</h2>
        <p style="color: #666; line-height: 1.6;">${instruction}</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" 
             style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            ${locale === 'fil' ? 'I-verify ang Email' : 'Verify Email'}
          </a>
        </div>
        <p style="color: #666; font-size: 12px; line-height: 1.6;">${alternative}</p>
        <p style="color: #999; font-size: 11px; word-break: break-all;">${verificationLink}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">${footer}</p>
      </div>
    `,
  };
}

function passwordMeetsPolicy(password) {
  return PASSWORD_POLICY_REGEX.test(password || '');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function incrementAndCheckAttempts(reset) {
  reset.attempts += 1;
  await reset.save();
  return reset.attempts >= (reset.maxAttempts || OTP_MAX_ATTEMPTS);
}

async function enforceRateLimit(userId) {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await PasswordReset.countDocuments({
    user: userId,
    createdAt: { $gte: cutoff },
  });
  if (recentCount >= RESET_RATE_LIMIT_PER_HOUR) {
    const err = new Error('Too many reset attempts. Please try again later.');
    err.statusCode = 429;
    throw err;
  }
}

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate required fields
    const { firstName, lastName, middleName, email, password, phoneNumber, role, licenseNumber, address } = req.body;
    
    if (!firstName || !lastName || !email || !password || !phoneNumber || !role) {
      return res.status(400).json({ error: 'firstName, lastName, email, password, phoneNumber, and role are required' });
    }

    // Validate role-specific requirements
    if (role === 'driver' && !licenseNumber) {
      return res.status(400).json({ error: 'License number is required for drivers' });
    }

    // Validate address requirements
    if (!address || !address.city || !address.province) {
      return res.status(400).json({ error: 'City and province are required in address' });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      middleName: middleName || '',
      email,
      password,
      phoneNumber,
      role,
      licenseNumber: role === 'driver' ? licenseNumber : undefined,
      address: {
        street: address.street || '',
        city: address.city,
        province: address.province,
        postalCode: address.postalCode || '',
        country: address.country || 'Philippines'
      }
    });

    await user.save();

    // If the user is a driver, ensure approvalStatus is pending by default
    if (role === 'driver' && user.approvalStatus !== 'pending') {
      user.approvalStatus = 'pending';
      await user.save();
    }

    // If the user is a commuter, create a wallet with a balance of 500
    if (role === 'commuter') {
      const wallet = new Wallet({
        user: user._id,
        type: 'commuter',
        amount: 500,
        currency: 'PHP'
      });
      await wallet.save();
    }

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationTokenExpires = emailVerificationTokenExpires;
    await user.save();

    // Send registration confirmation email
    try {
      const locale = req.body.locale || 'en';
      const { subject, text, html } = buildRegistrationConfirmationEmail({
        name: user.firstName,
        verificationToken: emailVerificationToken,
        locale
      });
      await sendMail({ to: user.email, subject, text, html });
    } catch (emailError) {
      console.error('Failed to send registration confirmation email:', emailError.message);
      // Don't fail registration if email fails, just log it
    }

    // Generate token
    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: user.toJSON(),
      token,
      message: 'Registration successful. Please check your email to verify your account.'
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(400).json({ error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: user.toJSON(),
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Request password reset (OTP via email/SMS)
router.post('/password/request', async (req, res) => {
  try {
    const { email, phoneNumber, locale = 'en' } = req.body;
    const identifier = email || phoneNumber;
    if (!identifier) {
      return res.status(400).json({ error: 'Email or phoneNumber is required' });
    }

    const user = await User.findOne(
      email ? { email: email.toLowerCase() } : { phoneNumber }
    );

    // Always respond 200 to avoid user enumeration
    if (!user) {
      return res.json({ message: 'If an account exists, an OTP has been sent.' });
    }

    await enforceRateLimit(user._id);

    const otp = ('' + Math.floor(100000 + Math.random() * 900000)).slice(0, 6);
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_EXP_MIN * 60 * 1000);

    // Replace previous pending resets
    await PasswordReset.deleteMany({ user: user._id, status: { $in: ['pending', 'verified'] } });

    const reset = await PasswordReset.create({
      user: user._id,
      otpHash,
      otpExpiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      locale,
    });

    const deliveredChannels = [];
    // Email
    try {
      const { subject, text, html } = buildOtpEmail({ name: user.firstName, otp, locale });
      await sendMail({ to: user.email, subject, text, html });
      deliveredChannels.push('email');
    } catch (err) {
      console.error('Failed to send reset email:', err.message);
    }

    // SMS (optional)
    if (process.env.PHILSMS_API_KEY) {
      try {
        await sendSmsPhilSMS({
          to: user.phoneNumber,
          message: `Your EyyTrike password reset OTP is ${otp}. It expires in ${OTP_EXP_MIN} minutes.`,
        });
        deliveredChannels.push('sms');
      } catch (err) {
        console.error('Failed to send reset SMS:', err.message);
      }
    }

    reset.deliveredChannels = deliveredChannels;
    await reset.save();

    res.json({ message: 'If an account exists, an OTP has been sent.' });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Server error' });
  }
});

// Verify OTP and issue reset token
router.post('/password/verify', async (req, res) => {
  try {
    const { email, phoneNumber, otp } = req.body;
    if (!otp || (!email && !phoneNumber)) {
      return res.status(400).json({ error: 'otp and email or phoneNumber are required' });
    }

    const user = await User.findOne(
      email ? { email: email.toLowerCase() } : { phoneNumber }
    );
    if (!user) {
      return res.status(400).json({ error: 'Invalid OTP or expired' });
    }

    const reset = await PasswordReset.findOne({
      user: user._id,
      status: 'pending',
    }).sort({ createdAt: -1 });

    if (!reset) {
      return res.status(400).json({ error: 'Invalid OTP or expired' });
    }

    if (reset.otpExpiresAt < new Date()) {
      reset.status = 'expired';
      await reset.save();
      return res.status(400).json({ error: 'Invalid OTP or expired' });
    }

    const attemptsExceeded = await incrementAndCheckAttempts(reset);
    if (attemptsExceeded) {
      reset.status = 'expired';
      await reset.save();
      return res.status(400).json({ error: 'Too many attempts. Please request a new OTP.' });
    }

    const isMatch = await bcrypt.compare(otp, reset.otpHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid OTP or expired' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    reset.resetTokenHash = hashToken(resetToken);
    reset.resetTokenExpiresAt = new Date(Date.now() + RESET_EXP_MIN * 60 * 1000);
    reset.status = 'verified';
    await reset.save();

    res.json({ resetToken, expiresInMinutes: RESET_EXP_MIN });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Reset password using reset token
router.post('/password/reset', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'resetToken and newPassword are required' });
    }

    if (!passwordMeetsPolicy(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol' });
    }

    const reset = await PasswordReset.findOne({
      resetTokenHash: hashToken(resetToken),
      status: { $in: ['pending', 'verified'] },
    }).sort({ createdAt: -1 });

    if (!reset || !reset.resetTokenExpiresAt || reset.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = await User.findById(reset.user);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (sameAsCurrent) {
      return res.status(400).json({ error: 'New password must differ from current password' });
    }

    user.password = newPassword;
    await user.save();

    reset.status = 'completed';
    await reset.save();
    // Clean up other pending resets
    await PasswordReset.deleteMany({ user: user._id, status: { $in: ['pending', 'verified'] } });

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify email address
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationTokenExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Mark email as verified and clear token
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationTokenExpires = null;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email, locale = 'en' } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If an account exists, a verification email has been sent.' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationTokenExpires = emailVerificationTokenExpires;
    await user.save();

    // Send verification email
    try {
      const { subject, text, html } = buildRegistrationConfirmationEmail({
        name: user.firstName,
        verificationToken: emailVerificationToken,
        locale
      });
      await sendMail({ to: user.email, subject, text, html });
      res.json({ message: 'If an account exists, a verification email has been sent.' });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Renew token (sliding session)
router.post('/renew', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ user: user.toJSON(), token });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;