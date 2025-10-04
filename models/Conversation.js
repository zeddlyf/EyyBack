const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  passenger: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Passenger is required']
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Driver is required']
  },
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    required: [true, 'Ride ID is required']
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    passenger: {
      type: Number,
      default: 0,
      min: 0
    },
    driver: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Metadata for the conversation
  metadata: {
    rideStatus: {
      type: String,
      enum: ['requested', 'accepted', 'picked_up', 'completed', 'cancelled'],
      default: 'requested'
    },
    startLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      },
      address: String
    },
    endLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      },
      address: String
    }
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ passenger: 1, driver: 1 });
conversationSchema.index({ rideId: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// Ensure unique conversation per ride
conversationSchema.index({ rideId: 1 }, { unique: true });

// Virtual for conversation title
conversationSchema.virtual('title').get(function() {
  return `Ride Chat - ${this.rideId}`;
});

// Virtual for other participant
conversationSchema.virtual('otherParticipant').get(function() {
  // This will be populated when needed
  return null;
});

// Ensure virtual fields are serialized
conversationSchema.set('toJSON', { virtuals: true });
conversationSchema.set('toObject', { virtuals: true });

// Static method to find or create conversation
conversationSchema.statics.findOrCreateConversation = async function(passengerId, driverId, rideId) {
  try {
    let conversation = await this.findOne({ rideId });
    
    if (!conversation) {
      conversation = new this({
        participants: [passengerId, driverId],
        passenger: passengerId,
        driver: driverId,
        rideId: rideId
      });
      await conversation.save();
    }
    
    return conversation;
  } catch (error) {
    throw new Error(`Failed to create/find conversation: ${error.message}`);
  }
};

// Method to update unread count
conversationSchema.methods.updateUnreadCount = function(userId) {
  if (userId.toString() === this.passenger.toString()) {
    this.unreadCount.passenger = 0;
  } else if (userId.toString() === this.driver.toString()) {
    this.unreadCount.driver = 0;
  }
  return this.save();
};

// Method to increment unread count
conversationSchema.methods.incrementUnreadCount = function(userId) {
  if (userId.toString() === this.passenger.toString()) {
    this.unreadCount.passenger += 1;
  } else if (userId.toString() === this.driver.toString()) {
    this.unreadCount.driver += 1;
  }
  return this.save();
};

// Method to update last message
conversationSchema.methods.updateLastMessage = function(messageId) {
  this.lastMessage = messageId;
  this.lastMessageAt = new Date();
  return this.save();
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
