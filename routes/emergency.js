const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const EmergencyContact = require('../models/EmergencyContact');
const EmergencyAlert = require('../models/EmergencyAlert');
const { encrypt, decrypt } = require('../services/encryption');
const { sendSMS } = require('../services/sms');
const User = require('../models/User');

const MAX_CONTACTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_COUNT = 3; // per user
const rateMap = new Map();

function maskPhone(p) {
  const s = String(p);
  return s.length > 4 ? '*'.repeat(s.length - 4) + s.slice(-4) : s;
}

function checkRate(userId) {
  const now = Date.now();
  const entry = rateMap.get(userId) || { start: now, count: 0 };
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(userId, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_COUNT) return false;
  entry.count += 1;
  rateMap.set(userId, entry);
  return true;
}

router.get('/contacts', auth, async (req, res) => {
  try {
    const list = await EmergencyContact.find({ owner: req.user._id }).sort({ priority: 1, createdAt: -1 });
    const items = list.map(c => ({
      _id: c._id,
      name: c.name,
      phoneMasked: maskPhone(decrypt(c.phoneEncrypted)),
      priority: c.priority,
      enabled: c.enabled,
      role: c.role
    }));
    res.json({ items });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/contacts', auth, async (req, res) => {
  try {
    const current = await EmergencyContact.countDocuments({ owner: req.user._id });
    if (current >= MAX_CONTACTS) return res.status(400).json({ error: 'Maximum contacts reached' });
    const { name, phone, priority = 1, enabled = true } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const doc = await EmergencyContact.create({
      owner: req.user._id,
      role: req.user.role,
      name,
      phoneEncrypted: encrypt(phone),
      priority: Math.min(5, Math.max(1, Number(priority) || 1)),
      enabled: !!enabled,
    });
    res.status(201).json({ _id: doc._id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/contacts/:id', auth, async (req, res) => {
  try {
    const doc = await EmergencyContact.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Contact not found' });
    const { name, phone, priority, enabled } = req.body;
    if (name !== undefined) doc.name = name;
    if (phone !== undefined) doc.phoneEncrypted = encrypt(phone);
    if (priority !== undefined) doc.priority = Math.min(5, Math.max(1, Number(priority)));
    if (enabled !== undefined) doc.enabled = !!enabled;
    await doc.save();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/contacts/:id', auth, async (req, res) => {
  try {
    await EmergencyContact.deleteOne({ _id: req.params.id, owner: req.user._id });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Optional 2FA: request code
const otpMap = new Map();
router.post('/request-otp', auth, async (req, res) => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpMap.set(req.user._id.toString(), { code, ts: Date.now() });
  try {
    await sendSMS((await User.findById(req.user._id)).phoneNumber, `EyyTrike emergency 2FA code: ${code}`);
  } catch {}
  res.json({ ok: true });
});

function verifyOtp(userId, code) {
  const entry = otpMap.get(userId);
  if (!entry) return false;
  if (Date.now() - entry.ts > 5 * 60 * 1000) return false;
  return entry.code === code;
}

router.post('/alert', auth, async (req, res) => {
  try {
    if (!checkRate(req.user._id.toString())) return res.status(429).json({ error: 'SMS rate limit exceeded' });
    const { type = 'manual', messageTemplate = 'EMERGENCY ALERT', location = {}, vehicle = {}, require2fa = false, otp } = req.body;
    if (require2fa && !verifyOtp(req.user._id.toString(), String(otp || ''))) {
      return res.status(403).json({ error: 'Invalid or expired 2FA code' });
    }
    const contacts = await EmergencyContact.find({ owner: req.user._id, enabled: true }).sort({ priority: 1 });
    if (contacts.length === 0) return res.status(400).json({ error: 'No enabled contacts' });
    const user = await User.findById(req.user._id).select('firstName lastName role licenseNumber location');
    const textParts = [
      '[EMERGENCY ALERT]',
      `User: ${user.firstName} ${user.lastName} (${user.role})`,
      type !== 'manual' ? `Type: ${type}` : 'Type: manual',
      location && (location.address || (location.latitude && location.longitude)) ? `Location: ${location.address || `${location.latitude},${location.longitude}`}` : '',
      user.role === 'driver' ? `Vehicle: ${user.licenseNumber || 'N/A'}` : '',
      messageTemplate || ''
    ].filter(Boolean);
    const body = textParts.join(' | ');
    const recipients = [];
    for (const c of contacts) {
      const phone = decrypt(c.phoneEncrypted);
      try {
        const resp = await sendSMS(phone, body);
        recipients.push({ name: c.name, phoneMasked: maskPhone(phone), status: 'sent', providerMessageId: resp.id || resp.message_id || '' });
      } catch (e) {
        recipients.push({ name: c.name, phoneMasked: maskPhone(phone), status: 'failed', providerMessageId: '' });
      }
    }
    const alertDoc = await EmergencyAlert.create({ initiator: req.user._id, role: user.role, type, message: body, location, vehicle, recipients });
    res.status(201).json({ alertId: alertDoc._id, recipients });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delivery status callback (if provider supports)
router.post('/dlr', async (req, res) => {
  try {
    const { message_id, status } = req.body || {};
    if (!message_id) return res.status(200).json({ ok: true });
    await EmergencyAlert.updateOne({ 'recipients.providerMessageId': message_id }, { $set: { 'recipients.$.status': status || 'delivered' } });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;