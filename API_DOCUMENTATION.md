# EyyTrike Backend API Documentation

## Overview
This document describes the API endpoints for the EyyTrike ride-sharing application backend, including the newly added address functionality.

## Base URL
```
http://localhost:3000/api
```

## Authentication
Most endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## User Model
The User model now includes comprehensive address information:

```javascript
{
  fullName: String (required),
  email: String (required, unique),
  password: String (required),
  phoneNumber: String (required),
  role: String (enum: ['driver', 'commuter'], required),
  licenseNumber: String (required for drivers),
  address: {
    street: String,
    city: String (required),
    province: String (required),
    postalCode: String,
    country: String (default: 'Philippines'),
    fullAddress: String (auto-generated)
  },
  location: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  isAvailable: Boolean (default: true),
  rating: Number (0-5),
  totalRides: Number,
  isActive: Boolean (default: true),
  profilePicture: String
}
```

## Authentication Endpoints

### POST /api/auth/register
Register a new user with address information.

**Request Body:**
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phoneNumber": "+639123456789",
  "role": "commuter",
  "licenseNumber": "DL123456789", // Required for drivers
  "address": {
    "street": "123 Main Street",
    "city": "Naga City",
    "province": "Camarines Sur",
    "postalCode": "4400",
    "country": "Philippines"
  }
}
```

**Response:**
```json
{
  "user": {
    "_id": "...",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "commuter",
    "address": {
      "street": "123 Main Street",
      "city": "Naga City",
      "province": "Camarines Sur",
      "postalCode": "4400",
      "country": "Philippines",
      "fullAddress": "123 Main Street, Naga City, Camarines Sur, 4400, Philippines"
    }
  },
  "token": "jwt-token-here"
}
```

### POST /api/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

### GET /api/auth/me
Get current user profile (requires authentication).

## User Management Endpoints

### GET /api/users/profile
Get user profile (requires authentication).

### PATCH /api/users/profile
Update user profile including address (requires authentication).

**Request Body:**
```json
{
  "fullName": "John Updated",
  "address": {
    "street": "456 New Street",
    "city": "Naga City",
    "province": "Camarines Sur",
    "postalCode": "4400"
  }
}
```

### GET /api/users/address
Get user's address information (requires authentication).

### PATCH /api/users/address
Update user's address (requires authentication).

**Request Body:**
```json
{
  "street": "789 Updated Street",
  "city": "Naga City",
  "province": "Camarines Sur",
  "postalCode": "4400",
  "country": "Philippines"
}
```

### GET /api/users/by-city/:city
Get users by city (requires authentication).

**Query Parameters:**
- `role`: Filter by role (driver/commuter)

**Example:**
```
GET /api/users/by-city/Naga%20City?role=driver
```

### GET /api/users/drivers/nearby
Get nearby available drivers (requires authentication).

**Query Parameters:**
- `latitude`: User's latitude
- `longitude`: User's longitude
- `maxDistance`: Maximum distance in meters (default: 5000)

**Example:**
```
GET /api/users/drivers/nearby?latitude=13.6245&longitude=123.1875&maxDistance=3000
```

### PATCH /api/users/driver/availability
Update driver availability (requires authentication, driver only).

**Request Body:**
```json
{
  "isAvailable": true
}
```

### PATCH /api/users/driver/location
Update driver location (requires authentication, driver only).

**Request Body:**
```json
{
  "latitude": 13.6245,
  "longitude": 123.1875
}
```

## Error Responses
All endpoints return appropriate HTTP status codes and error messages:

```json
{
  "error": "Error message description"
}
```

Common status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## Testing
Run the test script to verify backend functionality:
```bash
npm test
```

## Environment Variables
Required environment variables:
- `JWT_SECRET`: Secret key for JWT token signing
- `MONGODB_URI`: MongoDB connection string
- `PORT`: Server port (default: 3000)

## Socket.IO Events
The server also supports real-time communication via Socket.IO:

### Client Events:
- `joinUserRoom`: Join user-specific room
- `joinRideRoom`: Join ride-specific room
- `driverLocationUpdate`: Update driver location

### Server Events:
- `driverLocationChanged`: Driver location updated
- `error`: Error occurred

## Address Features
The new address functionality includes:
1. **Structured Address Storage**: Street, city, province, postal code, country
2. **Auto-generated Full Address**: Automatically creates a formatted full address string
3. **Address Validation**: Ensures required fields (city, province) are provided
4. **City-based User Search**: Find users by city with optional role filtering
5. **Address Updates**: Dedicated endpoints for address management
6. **Geographic Queries**: Integration with location-based features