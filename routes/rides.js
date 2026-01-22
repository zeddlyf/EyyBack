const express = require('express');
const router = express.Router();
const Ride = require('../models/Ride');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Create new ride request
router.post('/', auth, async (req, res) => {
  try {
    const ride = new Ride({
      ...req.body,
      passenger: req.user._id
    });
    await ride.save();
    
    // Notify available drivers
    req.app.get('io').emit('newRideRequest', ride);
    
    // Return ride with 'id' property for frontend compatibility
    const rideObj = ride.toObject();
    rideObj.id = rideObj._id;
    res.status(201).json(rideObj);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user's rides
router.get('/my-rides', auth, async (req, res) => {
  try {
    const rides = await Ride.find({
      $or: [
        { passenger: req.user._id },
        { driver: req.user._id }
      ]
    })
    .populate('passenger', 'firstName lastName phoneNumber')
    .populate('driver', 'firstName lastName phoneNumber rating')
    .sort({ createdAt: -1 });
    
    res.json(rides);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all rides (for frontend compatibility)
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      $or: [
        { passenger: req.user._id },
        { driver: req.user._id }
      ]
    };
    
    if (status) {
      query.status = status;
    }
    
    const rides = await Ride.find(query)
      .populate('passenger', 'firstName lastName phoneNumber')
      .populate('driver', 'firstName lastName phoneNumber')
      .sort({ createdAt: -1 });
    
    res.json(rides);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get nearby ride requests (for drivers)
router.get('/nearby', auth, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can view nearby rides' });
    }

    const { latitude, longitude, maxDistance = 5000 } = req.query;
    
    const rides = await Ride.find({
      status: 'pending',
      pickupLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).populate('passenger', 'firstName lastName phoneNumber');
    
    res.json(rides);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get ride by ID (restrict to ObjectId format)
router.get('/:id([0-9a-fA-F]{24})', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('passenger', 'firstName lastName phoneNumber')
      .populate('driver', 'firstName lastName phoneNumber');
    
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    
    // Check if user is authorized to view this ride
    const isDriver = ride.driver && req.user._id.toString() === ride.driver.toString();
    const isPassenger = ride.passenger && req.user._id.toString() === ride.passenger.toString();
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: 'Not authorized to view this ride' });
    }
    
    res.json(ride);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Accept ride request
  router.patch('/:id/accept', auth, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can accept rides' });
    }

    const ride = await Ride.findById(req.params.id)
      .populate('passenger', '_id');
    
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'pending') {
      return res.status(400).json({ error: 'Ride is no longer available' });
    }

    // If ride payment is via wallet, validate passenger has sufficient balance
    if (ride.paymentMethod === 'wallet') {
      try {
        const Wallet = require('../models/Wallet');
        const passengerWallet = await Wallet.findByUserId(ride.passenger._id);
        
        if (!passengerWallet) {
          return res.status(400).json({ error: 'Passenger wallet not found' });
        }

        if (passengerWallet.balance < ride.fare) {
          return res.status(400).json({ error: 'Passenger has insufficient wallet balance for this ride' });
        }
      } catch (walletError) {
        console.error('Error validating passenger wallet:', walletError);
        return res.status(400).json({ error: 'Failed to validate passenger wallet' });
      }
    }

    ride.driver = req.user._id;
    ride.status = 'accepted';
    await ride.save();

    const io = req.app.get('io');
    // Ensure conversation exists and notify both parties
    const Conversation = require('../models/Conversation');
    const conversation = await Conversation.findOrCreateConversation(ride.passenger, ride.driver, ride._id);
    // Notify passenger and driver
    io.to(`user_${ride.passenger}`).emit('rideAccepted', { ride, conversationId: conversation._id });
    io.to(`user_${ride.driver}`).emit('conversationCreated', { rideId: ride._id, conversationId: conversation._id });
    const Notification = require('../models/Notification');
    const passNote = await Notification.create({ user: ride.passenger, type: 'ride', title: 'Ride accepted', body: 'A driver accepted your ride', data: { rideId: ride._id } });
    const drvNote = await Notification.create({ user: ride.driver, type: 'ride', title: 'Ride assigned', body: 'You accepted a ride', data: { rideId: ride._id } });
    req.app.get('io').to(`user_${ride.passenger}`).emit('notification', passNote);
    req.app.get('io').to(`user_${ride.driver}`).emit('notification', drvNote);
    
    // Re-populate driver fields before responding
    await ride.populate('driver', 'firstName lastName phoneNumber rating');
    res.json(ride);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update ride status
  router.patch('/:id/status', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('passenger', 'firstName lastName phoneNumber')
      .populate('driver', 'firstName lastName phoneNumber rating');
    
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    const isDriver = ride.driver && req.user._id.toString() === ride.driver._id.toString();
    const isPassenger = ride.passenger && req.user._id.toString() === ride.passenger._id.toString();
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ error: 'Not authorized to update this ride' });
    }

    ride.status = req.body.status;
    await ride.save();

    // Notify all parties involved
    req.app.get('io').to(`ride_${ride._id}`).emit('rideStatusChanged', ride);
    const Notification = require('../models/Notification');
    const targets = [ride.passenger._id, ride.driver._id].filter(Boolean);
    for (const u of targets) {
      const note = await Notification.create({ user: u, type: 'ride', title: 'Ride status updated', body: `Status: ${ride.status}`, data: { rideId: ride._id } });
      req.app.get('io').to(`user_${u}`).emit('notification', note);
    }
    
    res.json(ride);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Complete ride
  router.post('/:id/complete', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('passenger', '_id')
      .populate('driver', '_id firstName lastName phoneNumber rating');
    
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    console.log(`📍 Completing ride ${ride._id}:`, {
      currentStatus: ride.status,
      driverId: ride.driver?._id.toString(),
      requestUserId: req.user._id.toString(),
      match: ride.driver?._id.toString() === req.user._id.toString()
    });

    if (!ride.driver || req.user._id.toString() !== ride.driver._id.toString()) {
      return res.status(403).json({ error: 'Only drivers can complete rides' });
    }

    if (ride.status !== 'accepted') {
      console.warn(`⚠️  Cannot complete ride with status: ${ride.status}`);
      return res.status(400).json({ error: `Can only complete accepted rides. Current status: ${ride.status}` });
    }

    // Process payment if using wallet
    if (ride.paymentMethod === 'wallet' && ride.paymentStatus === 'pending') {
      try {
        const Wallet = require('../models/Wallet');
        const crypto = require('crypto');
        
        console.log(`💰 Processing payment for ride ${ride._id}`);
        console.log(`   Fare: ₱${ride.fare}`);
        console.log(`   Passenger ID: ${ride.passenger._id}`);
        console.log(`   Driver ID: ${ride.driver._id}`);
        
        // Get passenger's wallet
        let passengerWallet = await Wallet.findByUserId(ride.passenger._id);
        if (!passengerWallet) {
          console.warn('❌ Passenger wallet not found - creating new wallet');
          passengerWallet = new Wallet({
            user: ride.passenger._id,
            balance: 0,
            currency: 'PHP',
            transactions: []
          });
          await passengerWallet.saveWithRepair();
          console.log('✅ New passenger wallet created');
          ride.paymentStatus = 'pending';
        } else if (passengerWallet.balance < ride.fare) {
          console.warn(`❌ Insufficient balance. Required: ₱${ride.fare}, Available: ₱${passengerWallet.balance}`);
          ride.paymentStatus = 'pending';
        } else {
          try {
            const referenceId = `ride_${ride._id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
            console.log(`   Deducting ₱${ride.fare} from passenger...`);
            const deductResult = await passengerWallet.deductFunds(ride.fare, {
              type: 'PAYMENT',
              referenceId: referenceId,
              description: `Payment for ride from ${ride.pickupLocation.address} to ${ride.dropoffLocation.address}`,
              metadata: {
                rideId: ride._id.toString(),
                driverId: ride.driver._id.toString(),
                distance: ride.distance,
                duration: ride.duration
              }
            });
            console.log(`✅ Passenger deducted. New balance: ₱${deductResult.balance}`);

            // Add funds to driver's wallet
            let driverWallet = await Wallet.findByUserId(ride.driver._id);
            if (!driverWallet) {
              console.log('📝 Driver wallet not found - creating new wallet');
              driverWallet = new Wallet({
                user: ride.driver._id,
                balance: 0,
                currency: 'PHP',
                transactions: []
              });
              const saved = await driverWallet.saveWithRepair();
              console.log(`✅ New driver wallet created with ID: ${saved._id}`);
            }

            const driverReferenceId = `ride_income_${ride._id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
            console.log(`   Adding ₱${ride.fare} to driver wallet...`);
            const addResult = await driverWallet.addFunds(ride.fare, {
              type: 'TOPUP',
              referenceId: driverReferenceId,
              xenditId: null,
              paymentMethod: 'RIDE_PAYMENT',
              description: `Income from ride to ${ride.dropoffLocation.address}`,
              metadata: {
                rideId: ride._id.toString(),
                passengerId: ride.passenger._id.toString(),
                distance: ride.distance,
                duration: ride.duration
              }
            });
            console.log(`✅ Driver credited. New balance: ₱${addResult.balance}`);
            ride.paymentStatus = 'completed';
          } catch (transactionError) {
            console.error('❌ Transaction error:', transactionError.message);
            console.error(transactionError);
            ride.paymentStatus = 'pending';
            throw transactionError;
          }
        }
      } catch (walletError) {
        console.error('❌ Wallet error:', walletError.message);
        console.error(walletError);
        console.warn('⚠️  Continuing with ride completion despite wallet error');
      }
    }

    ride.status = 'completed';
    if (req.body.rating) {
      ride.rating = req.body.rating;
    }
    await ride.save();

    // Set TTL for messages in this conversation (24h retention)
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const conversation = await Conversation.findOne({ rideId: ride._id });
    if (conversation) {
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await Message.updateMany({ conversationId: conversation._id }, { expiresAt: expiry });
      conversation.isActive = false;
      await conversation.save();
      // Notify passenger
      req.app.get('io').to(`user_${ride.passenger}`).emit('rideCompleted', { ride, conversationId: conversation._id });
    } else {
      req.app.get('io').to(`user_${ride.passenger}`).emit('rideCompleted', { ride });
    }
    const Notification = require('../models/Notification');
    const passNote = await Notification.create({ user: ride.passenger, type: 'ride', title: 'Ride completed', body: 'Your ride has been completed', data: { rideId: ride._id } });
    const drvNote = await Notification.create({ user: ride.driver, type: 'ride', title: 'Ride completed', body: 'You completed a ride', data: { rideId: ride._id } });
    req.app.get('io').to(`user_${ride.passenger}`).emit('notification', passNote);
    req.app.get('io').to(`user_${ride.driver}`).emit('notification', drvNote);

    // Re-populate ride with full driver info before responding
    await ride.populate('driver', 'firstName lastName phoneNumber rating');
    res.json(ride);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rate ride
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({ error: 'Can only rate completed rides' });
    }

    if (!ride.passenger || req.user._id.toString() !== ride.passenger.toString()) {
      return res.status(403).json({ error: 'Only passengers can rate rides' });
    }

    const rawRating = Number(req.body.rating);
    if (Number.isNaN(rawRating)) {
      return res.status(400).json({ error: 'Rating is required' });
    }
    // Clamp to 1–5 and enforce 0.5 increments
    let rating = Math.max(1, Math.min(5, rawRating));
    rating = Math.round(rating * 2) / 2;

    const feedbackText = (req.body.feedback || '').toString();
    if (feedbackText.length < 20 || feedbackText.length > 500) {
      return res.status(400).json({ error: 'Feedback must be 20-500 characters' });
    }
    // Basic sanitization: strip HTML tags and escape angle brackets
    const sanitized = feedbackText.replace(/<[^>]*>?/gm, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    ride.rating = rating;
    ride.feedback = sanitized;
    ride.feedbackStatus = 'pending';

    // Lightweight moderation: auto-approve if no banned words
    const banned = ['spam', 'scam', 'hate'];
    const containsBanned = banned.some(w => sanitized.toLowerCase().includes(w));
    if (!containsBanned) {
      ride.feedbackStatus = 'approved';
    }

    // Save the ride with rating and feedback
    await ride.save();

    // Update driver's average rating (approved only)
    const driver = await User.findById(ride.driver);
    if (driver) {
      const driverRides = await Ride.find({ driver: ride.driver, rating: { $exists: true }, feedbackStatus: { $ne: 'rejected' } });
      if (driverRides.length > 0) {
        const averageRating = driverRides.reduce((acc, ride) => acc + ride.rating, 0) / driverRides.length;
        driver.rating = averageRating;
        await driver.save();
      }
    }

    res.json(ride);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// List feedback for a driver with sorting/filtering
router.get('/feedback', auth, async (req, res) => {
  try {
    const { driverId, status = 'approved', sort = 'newest', page = 1, limit = 20 } = req.query;
    const query = { rating: { $exists: true } };
    if (driverId) query.driver = driverId;
    if (!driverId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only for listing all feedback' });
    }
    if (status) query.feedbackStatus = status;
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest: { rating: -1 },
      lowest: { rating: 1 }
    };
    const docs = await Ride.find(query)
      .select('rating feedback feedbackStatus createdAt passenger driver')
      .populate('passenger', 'firstName lastName')
      .populate('driver', 'firstName lastName')
      .sort(sortMap[sort] || sortMap.newest)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    const total = await Ride.countDocuments(query);
    res.json({ items: docs, total });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rating distribution for a driver
router.get('/feedback/distribution', async (req, res) => {
  try {
    const { driverId } = req.query;
    if (!driverId) {
      return res.status(400).json({ error: 'driverId is required' });
    }
    const rides = await Ride.find({ driver: driverId, rating: { $exists: true }, feedbackStatus: { $ne: 'rejected' } }).select('rating');
    const buckets = { 1: 0, 1.5: 0, 2: 0, 2.5: 0, 3: 0, 3.5: 0, 4: 0, 4.5: 0, 5: 0 };
    let sum = 0;
    for (const r of rides) {
      const val = Math.round(r.rating * 2) / 2;
      buckets[val] = (buckets[val] || 0) + 1;
      sum += val;
    }
    const average = rides.length ? sum / rides.length : 0;
    res.json({ distribution: buckets, average, count: rides.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Flag feedback on a ride
router.post('/:id/feedback/flag', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (req.user._id.toString() !== ride.passenger.toString() && req.user._id.toString() !== ride.driver.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to flag this feedback' });
    }
    const reason = (req.body.reason || '').toString().trim().slice(0, 200);
    ride.feedbackFlagged = true;
    if (reason) ride.feedbackFlags.push(reason);
    await ride.save();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: list pending/flagged feedback
router.get('/admin/feedback/pending', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const items = await Ride.find({ rating: { $exists: true }, $or: [{ feedbackStatus: 'pending' }, { feedbackFlagged: true }] })
      .select('rating feedback feedbackStatus feedbackFlagged feedbackFlags passenger driver createdAt')
      .populate('passenger', 'firstName lastName')
      .populate('driver', 'firstName lastName');
    res.json({ items });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: approve feedback
router.post('/admin/feedback/:rideId/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    ride.feedbackStatus = 'approved';
    ride.feedbackFlagged = false;
    await ride.save();
    const driverRides = await Ride.find({ driver: ride.driver, rating: { $exists: true }, feedbackStatus: { $ne: 'rejected' } });
    const averageRating = driverRides.reduce((acc, r) => acc + r.rating, 0) / driverRides.length;
    await User.findByIdAndUpdate(ride.driver, { rating: averageRating });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: reject feedback
router.post('/admin/feedback/:rideId/reject', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    ride.feedbackStatus = 'rejected';
    ride.feedbackFlagged = false;
    await ride.save();
    const driverRides = await Ride.find({ driver: ride.driver, rating: { $exists: true }, feedbackStatus: { $ne: 'rejected' } });
    const averageRating = driverRides.length ? (driverRides.reduce((acc, r) => acc + r.rating, 0) / driverRides.length) : 0;
    await User.findByIdAndUpdate(ride.driver, { rating: averageRating });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;