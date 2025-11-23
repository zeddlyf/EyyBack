const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Ride = require('../models/Ride');
const auth = require('../middleware/auth');

// Get all conversations for a user
router.get('/conversations', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const conversations = await Conversation.find({
      participants: userId,
      isActive: true
    })
    .populate('passenger', 'firstName lastName profilePicture')
    .populate('driver', 'firstName lastName profilePicture')
    .populate('lastMessage')
    .populate('rideId', 'status pickupLocation dropoffLocation')
    .sort({ lastMessageAt: -1 });

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations'
    });
  }
});

// Get conversation by ride ID
router.get('/conversation/ride/:rideId', auth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({ rideId })
      .populate('passenger', 'firstName lastName profilePicture')
      .populate('driver', 'firstName lastName profilePicture')
      .populate('rideId', 'status pickupLocation dropoffLocation');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is a participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation'
    });
  }
});

// Get messages for a conversation
router.get('/conversation/:conversationId/messages', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'firstName lastName profilePicture')
      .populate('receiver', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Mark messages as read
    await Message.updateMany(
      { 
        conversationId, 
        receiver: userId, 
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );

    // Reset unread count
    await conversation.updateUnreadCount(userId);

    res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await Message.countDocuments({ conversationId })
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
});

// Send a message
router.post('/send', auth, async (req, res) => {
  try {
    const {
      rideId,
      message,
      messageType = 'text',
      location,
      imageUrl
    } = req.body;

    const senderId = req.user.id;

    // Validate required fields
    if (!rideId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID and message are required'
      });
    }

    // Verify ride exists and user is participant
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.passenger.toString() !== senderId && ride.driver.toString() !== senderId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find or create conversation
    const conversation = await Conversation.findOrCreateConversation(
      ride.passenger,
      ride.driver,
      rideId
    );

    // Determine receiver
    const receiverId = ride.passenger.toString() === senderId ? ride.driver : ride.passenger;

    // Create message
    const newMessage = new Message({
      conversationId: conversation._id,
      sender: senderId,
      receiver: receiverId,
      message,
      messageType,
      location,
      imageUrl
    });

    await newMessage.save();

    // Update conversation
    await conversation.updateLastMessage(newMessage._id);
    await conversation.incrementUnreadCount(receiverId);

    // Populate sender info for response
    await newMessage.populate('sender', 'firstName lastName profilePicture');

    // Get receiver info for socket emission
    const receiver = await User.findById(receiverId, 'firstName lastName');

    // Emit real-time message via Socket.IO
    const io = req.app.get('io');
    io.to(`user_${receiverId}`).emit('newMessage', {
      message: newMessage,
      conversationId: conversation._id,
      sender: newMessage.sender,
      receiver: {
        _id: receiverId,
        firstName: receiver.firstName,
        lastName: receiver.lastName
      }
    });
    const Notification = require('../models/Notification');
    const note = await Notification.create({
      user: receiverId,
      type: 'message',
      title: 'New message',
      body: message,
      data: { conversationId: conversation._id, rideId }
    });
    io.to(`user_${receiverId}`).emit('notification', note);

    // Also emit to conversation room
    io.to(`conversation_${conversation._id}`).emit('messageReceived', {
      message: newMessage,
      conversationId: conversation._id
    });

    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

// Mark messages as read
router.put('/conversation/:conversationId/read', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Mark all unread messages as read
    await Message.updateMany(
      { 
        conversationId, 
        receiver: userId, 
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );

    // Reset unread count
    await conversation.updateUnreadCount(userId);

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read'
    });
  }
});

// Send location message
router.post('/send-location', auth, async (req, res) => {
  try {
    const {
      rideId,
      location,
      address
    } = req.body;

    const senderId = req.user.id;

    // Validate required fields
    if (!rideId || !location || !location.coordinates) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID and location are required'
      });
    }

    // Verify ride exists and user is participant
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.passenger.toString() !== senderId && ride.driver.toString() !== senderId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find or create conversation
    const conversation = await Conversation.findOrCreateConversation(
      ride.passenger,
      ride.driver,
      rideId
    );

    // Determine receiver
    const receiverId = ride.passenger.toString() === senderId ? ride.driver : ride.passenger;

    // Create location message
    const newMessage = new Message({
      conversationId: conversation._id,
      sender: senderId,
      receiver: receiverId,
      message: address || 'Shared location',
      messageType: 'location',
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        address: address
      }
    });

    await newMessage.save();

    // Update conversation
    await conversation.updateLastMessage(newMessage._id);
    await conversation.incrementUnreadCount(receiverId);

    // Populate sender info for response
    await newMessage.populate('sender', 'firstName lastName profilePicture');

    // Emit real-time message via Socket.IO
    const io = req.app.get('io');
    io.to(`user_${receiverId}`).emit('newMessage', {
      message: newMessage,
      conversationId: conversation._id,
      sender: newMessage.sender,
      receiver: {
        _id: receiverId
      }
    });

    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Error sending location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send location'
    });
  }
});

// Get unread message count for user
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: userId,
      isActive: true
    });

    let totalUnread = 0;
    conversations.forEach(conversation => {
      if (userId.toString() === conversation.passenger.toString()) {
        totalUnread += conversation.unreadCount.passenger;
      } else if (userId.toString() === conversation.driver.toString()) {
        totalUnread += conversation.unreadCount.driver;
      }
    });

    res.json({
      success: true,
      unreadCount: totalUnread
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

module.exports = router;
