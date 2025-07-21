const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const auth = require('../middleware/auth');

// Create a new payment
router.post('/', auth, async (req, res) => {
    try {
        const payment = new Payment({
            ...req.body,
            user: req.user._id
        });
        await payment.save();
        res.status(201).json(payment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get all payments for the authenticated user
router.get('/', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user._id }).populate('user ride wallet');
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

// Update a payment by ID (only if owned by user)
router.put('/:id', auth, async (req, res) => {
    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json(payment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

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

module.exports = router;