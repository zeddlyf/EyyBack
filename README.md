# Eyytrike Backend

This is the backend server for the Eyytrike ride-sharing application. It provides RESTful APIs and real-time communication using Socket.IO for managing users, rides, payments, wallets, and driver-passenger interactions.

## Features

- User authentication and authorization
- Real-time location tracking
- Ride request and management
- Driver-passenger matching
- Wallet and payment management
- Rating system
- Real-time notifications

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/eyytrike
   JWT_SECRET=your_jwt_secret_key_here
   ```
4. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login user
- GET `/api/auth/me` - Get current user profile

### Users
- GET `/api/users/profile` - Get user profile
- PATCH `/api/users/profile` - Update user profile
- PATCH `/api/users/driver/availability` - Update driver availability
- PATCH `/api/users/driver/location` - Update driver location
- GET `/api/users/drivers/nearby` - Get nearby drivers

### Rides
- POST `/api/rides` - Create new ride request
- GET `/api/rides/my-rides` - Get user's rides
- GET `/api/rides/nearby` - Get nearby ride requests
- PATCH `/api/rides/:id/accept` - Accept ride request
- PATCH `/api/rides/:id/status` - Update ride status
- POST `/api/rides/:id/rate` - Rate completed ride

### Wallets
- POST `/api/wallets` - Create a new wallet
- GET `/api/wallets` - Get all wallets for authenticated user
- GET `/api/wallets/:id` - Get a wallet by ID (owned by user)
- PUT `/api/wallets/:id` - Update a wallet by ID (owned by user)
- DELETE `/api/wallets/:id` - Delete a wallet by ID (owned by user)

### Payments
- POST `/api/payments` - Create a new payment
- GET `/api/payments` - Get all payments for authenticated user
- GET `/api/payments/:id` - Get a payment by ID (owned by user)
- PUT `/api/payments/:id` - Update a payment by ID (owned by user)
- DELETE `/api/payments/:id` - Delete a payment by ID (owned by user)

## Socket.IO Events

### Client to Server
- `joinUserRoom` - Join user's personal room
- `joinRideRoom` - Join ride room
- `driverLocationUpdate` - Update driver location
- `rideStatusUpdate` - Update ride status

### Server to Client
- `newRideRequest` - New ride request notification
- `rideAccepted` - Ride accepted notification
- `rideStatusChanged` - Ride status update
- `driverLocationChanged` - Driver location update

## Error Handling

The API uses standard HTTP status codes and returns error messages in the following format:
```json
{
  "error": "Error message here"
}
```

## Security

- JWT-based authentication
- Password hashing using bcrypt
- Input validation
- CORS enabled
- Environment variables for sensitive data