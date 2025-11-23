const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { unread = 'false', limit = 50, page = 1 } = req.query;
    const query = { user: req.user._id };
    if (unread === 'true') query.read = false;
    const items = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    const total = await Notification.countDocuments(query);
    res.json({ items, total });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/read', auth, async (req, res) => {
  try {
    const note = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ error: 'Notification not found' });
    note.read = true;
    await note.save();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPreferences pushToken');
    res.json({ preferences: user.notificationPreferences || {}, pushToken: user.pushToken || '' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.notificationPreferences = { ...(user.notificationPreferences || {}), ...(req.body || {}) };
    await user.save();
    res.json({ preferences: user.notificationPreferences });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/push-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user._id);
    user.pushToken = token || '';
    await user.save();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/admin/broadcast', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { title, body, roles } = req.body;
    const filter = roles && roles.length ? { role: { $in: roles } } : {};
    const users = await User.find(filter).select('_id');
    const docs = await Notification.insertMany(users.map(u => ({ user: u._id, type: 'admin', title, body, data: {} })));
    const io = req.app.get('io');
    for (const n of docs) {
      io.to(`user_${n.user}`).emit('notification', n);
    }
    res.json({ ok: true, count: docs.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;