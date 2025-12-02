const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const auth = require('../middleware/auth');
const { encrypt } = require('../services/encryption');
const AuditLog = require('../models/AuditLog');
const xendit = require('../services/xendit');

// Initiate a payment via Xendit
router.post('/', auth, async (req, res) => {
  try {
    const { amount, currency = 'PHP', method = 'invoice', channel, description, ride, wallet, metadata = {} } = req.body || {}
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' })

    let providerId = null
    let status = 'PENDING'
    let providerPayload = null
    const externalId = `eyy_${req.user._id}_${Date.now()}`

    if (method === 'invoice') {
      const inv = await xendit.createInvoice({ amount, currency, description, external_id: externalId, customer: { email: req.user.email, given_names: req.user.firstName, surname: req.user.lastName } })
      providerId = inv.id
      providerPayload = inv
      status = inv.status === 'PAID' ? 'PAID' : inv.status === 'EXPIRED' ? 'EXPIRED' : 'PENDING'
    } else if (method === 'ewallet') {
      if (!channel) return res.status(400).json({ error: 'channel_code required for ewallet' })
      const ch = await xendit.createEwalletCharge({ reference_id: externalId, amount, channel_code: channel, currency })
      providerId = ch.id
      providerPayload = ch
      status = ch.status === 'SUCCEEDED' ? 'PAID' : ch.status === 'FAILED' ? 'FAILED' : 'PENDING'
    } else if (method === 'credit_card') {
      if (!req.body.token_id) return res.status(400).json({ error: 'token_id required for credit_card' })
      const cc = await xendit.createCardCharge({ token_id: req.body.token_id, amount, currency, external_id: externalId })
      providerId = cc.id
      providerPayload = cc
      status = cc.status === 'CAPTURED' || cc.status === 'AUTHORIZED' ? 'PAID' : cc.status === 'FAILED' ? 'FAILED' : 'PENDING'
    } else {
      return res.status(400).json({ error: 'Unsupported method' })
    }

    const payment = await Payment.create({
      user: req.user._id,
      ride: ride || null,
      wallet: wallet || null,
      amount,
      currency,
      method,
      channel,
      status,
      providerId,
      description,
      metadata,
      webhookPayloadEnc: encrypt(JSON.stringify(providerPayload || {}))
    })

    await AuditLog.create({ resourceType: 'Payment', resourceId: payment._id.toString(), actorId: req.user._id.toString(), action: 'create', changes: { status } })

    const Notification = require('../models/Notification');
    const io = req.app.get('io');
    const note = await Notification.create({ user: req.user._id, type: 'payment', title: 'Payment initiated', body: `₱${payment.amount} ${method}`, data: { paymentId: payment._id } })
    io.to(`user_${req.user._id}`).emit('notification', note)
    res.status(201).json(payment)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Get all payments for the authenticated user
router.get('/', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('user ride wallet');
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a payment by ID (only if owned by user)
router.get('/:id', auth, async (req, res) => {
    try {
        const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id }).populate('user ride wallet');
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json(payment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin reconciliation: fetch latest status from Xendit and update
router.post('/:id/reconcile', auth, auth.requireRole('admin'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    let latest = null
    if (payment.method === 'invoice') latest = await xendit.getInvoice(payment.providerId)
    if (payment.method === 'ewallet') latest = await xendit.getEwalletCharge(payment.providerId)
    if (payment.method === 'credit_card') latest = await xendit.getCardCharge(payment.providerId)
    if (!latest) return res.status(400).json({ error: 'Unsupported method for reconciliation' })
    const before = payment.status
    let status = before
    if (payment.method === 'invoice') status = latest.status === 'PAID' ? 'PAID' : latest.status === 'EXPIRED' ? 'EXPIRED' : before
    if (payment.method === 'ewallet') status = latest.status === 'SUCCEEDED' ? 'PAID' : latest.status === 'FAILED' ? 'FAILED' : before
    if (payment.method === 'credit_card') status = ['CAPTURED','AUTHORIZED'].includes(latest.status) ? 'PAID' : latest.status === 'FAILED' ? 'FAILED' : before
    payment.status = status
    payment.webhookPayloadEnc = encrypt(JSON.stringify(latest))
    await payment.save()
    await AuditLog.create({ resourceType: 'Payment', resourceId: payment._id.toString(), actorId: req.user._id.toString(), action: 'update', changes: { from: before, to: status } })
    res.json(payment)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Delete a payment by ID (only if owned by user)
router.delete('/:id', auth, async (req, res) => {
    try {
        const payment = await Payment.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json({ message: 'Payment deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Webhook endpoint for Xendit
router.post('/webhook', async (req, res) => {
  try {
    if (!xendit.verifyWebhook(req)) return res.status(401).json({ error: 'Invalid callback token' })
    const payload = req.body || {}
    const type = (payload.event || payload.status || '').toString().toUpperCase()
    const providerId = payload.id || payload.data?.id || payload.invoice?.id || payload.charge?.id
    if (!providerId) return res.status(400).json({ error: 'Missing provider id' })
    const payment = await Payment.findOne({ providerId })
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    const before = payment.status
    let status = before
    if (payment.method === 'invoice') {
      status = payload.status === 'PAID' ? 'PAID' : payload.status === 'EXPIRED' ? 'EXPIRED' : before
    } else if (payment.method === 'ewallet') {
      status = payload.status === 'SUCCEEDED' ? 'PAID' : payload.status === 'FAILED' ? 'FAILED' : before
    } else if (payment.method === 'credit_card') {
      status = ['CAPTURED','AUTHORIZED'].includes(payload.status) ? 'PAID' : payload.status === 'FAILED' ? 'FAILED' : before
    }
    payment.status = status
    payment.webhookPayloadEnc = encrypt(JSON.stringify(payload))
    await payment.save()
    await AuditLog.create({ resourceType: 'Payment', resourceId: payment._id.toString(), actorId: 'xendit', action: 'update', changes: { from: before, to: status } })
    const Notification = require('../models/Notification');
    const io = req.app.get('io');
    const note = await Notification.create({ user: payment.user, type: 'payment', title: 'Payment update', body: `${payment.method} ${status}`, data: { paymentId: payment._id } })
    io.to(`user_${payment.user}`).emit('notification', note)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router;
