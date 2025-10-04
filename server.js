const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');
const User = require('./models/User');
require('dotenv').config();

// Check for required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Set io instance on app for access in routes
app.set('io', io);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('Successfully connected to MongoDB');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const rideRoutes = require('./routes/rides');
const paymentRoutes = require('./routes/payment');
const walletRoutes = require('./routes/wallet');
const messagingRoutes = require('./routes/messaging');

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'EyyBack API is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'EyyBack API Server',
    version: '1.0.0',
    status: 'running'
  });
});

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/messaging', messagingRoutes);

// Socket.io connection and event handlers
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinUserRoom', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('joinRideRoom', (rideId) => {
    socket.join(`ride_${rideId}`);
    console.log(`User joined ride room: ${rideId}`);
  });

  socket.on('joinConversationRoom', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`User joined conversation room: ${conversationId}`);
  });

  socket.on('leaveConversationRoom', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`User left conversation room: ${conversationId}`);
  });

  socket.on('typingStart', (data) => {
    const { conversationId, userId } = data;
    socket.to(`conversation_${conversationId}`).emit('userTyping', {
      userId,
      isTyping: true
    });
  });

  socket.on('typingStop', (data) => {
    const { conversationId, userId } = data;
    socket.to(`conversation_${conversationId}`).emit('userTyping', {
      userId,
      isTyping: false
    });
  });

  socket.on('driverLocationUpdate', async (data) => {
    try {
      const { driverId, location, rideId } = data;
      
      // Update driver location in database
      await User.findByIdAndUpdate(driverId, {
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        }
      });

      if (rideId) {
        io.to(`ride_${rideId}`).emit('driverLocationChanged', { driverId, location });
      } else {
        socket.broadcast.emit('driverLocationChanged', { driverId, location });
      }
    } catch (error) {
      console.error('Error updating driver location:', error);
      socket.emit('error', { message: 'Failed to update location' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Public URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}`);
}); 