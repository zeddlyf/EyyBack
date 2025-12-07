const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');
const User = require('./models/User');
const DriverLocation = require('./models/DriverLocation');
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
const notificationRoutes = require('./routes/notifications');
const contactsV1Routes = require('./routes/v1/contacts');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi.json');

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
app.use('/api/wallet', walletRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/v1/contacts', contactsV1Routes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Socket.io connection and event handlers
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Optional auth via token in handshake
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data = { userId: decoded._id };
    } catch (err) {
      console.warn('Socket auth failed, disconnecting:', err.message);
      socket.disconnect(true);
      return;
    }
  } else {
    console.warn('Socket connection without token, disconnecting');
    socket.disconnect(true);
    return;
  }

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
      const { driverId, location, rideId, hasPassenger, status } = data;
      
      // Update driver location in database
      await User.findByIdAndUpdate(driverId, {
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        }
      });

      // Store location history
      await DriverLocation.create({
        driver: driverId,
        location: { type: 'Point', coordinates: [location.longitude, location.latitude] },
        status: status || (rideId ? 'on-trip' : 'available'),
        hasPassenger: typeof hasPassenger === 'boolean' ? hasPassenger : !!rideId,
        rideId: rideId || null,
      });

      const payload = {
        driverId,
        location,
        rideId: rideId || null,
        hasPassenger: typeof hasPassenger === 'boolean' ? hasPassenger : !!rideId,
        status: status || (rideId ? 'on-trip' : 'available'),
        timestamp: new Date().toISOString(),
      };

      if (rideId) {
        io.to(`ride_${rideId}`).emit('driverLocationChanged', payload);
      }
      // Broadcast to all listeners for admin/tracking views
      socket.broadcast.emit('driverLocationChanged', payload);
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
