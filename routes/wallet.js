const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const auth = require('../middleware/auth');

// Create a new wallet
router.post('/', auth, async (req, res) => {
    try {
        const wallet = new Wallet({
            ...req.body,
            user: req.user._id
        });
        await wallet.save();
        res.status(201).json(wallet);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get all wallets for the authenticated user
router.get('/', auth, async (req, res) => {
    try {
        const wallets = await Wallet.find({ user: req.user._id }).populate('user');
        res.json(wallets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a wallet by ID (only if owned by user)
router.get('/:id', auth, async (req, res) => {
    try {
        const wallet = await Wallet.findOne({ _id: req.params.id, user: req.user._id }).populate('user');
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a wallet by ID (only if owned by user)
router.put('/:id', auth, async (req, res) => {
    try {
        const wallet = await Wallet.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
        res.json(wallet);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete a wallet by ID (only if owned by user)
router.delete('/:id', auth, async (req, res) => {
    try {
        const wallet = await Wallet.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
        res.json({ message: 'Wallet deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;