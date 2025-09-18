# User CRUD API Documentation

This document describes the CRUD (Create, Read, Update, Delete) operations for the User model with the new name structure.

## User Model Structure

The User model now uses separate fields for names:
- `firstName` (required): User's first name
- `lastName` (required): User's last name  
- `middleName` (optional): User's middle name
- `fullName` (virtual): Automatically generated from firstName, middleName, and lastName

## Authentication

All CRUD operations require admin authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## API Endpoints

### 1. CREATE - Create a new user

**POST** `/api/users/`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "middleName": "Michael", // optional
  "email": "john.doe@example.com",
  "password": "password123",
  "phoneNumber": "+1234567890",
  "role": "commuter", // or "driver", "admin"
  "licenseNumber": "DL123456", // required if role is "driver"
  "address": {
    "street": "123 Main Street",
    "city": "Naga City",
    "province": "Camarines Sur",
    "postalCode": "4400",
    "country": "Philippines"
  }
}
```

**Response (201 Created):**
```json
{
  "_id": "user_id",
  "firstName": "John",
  "lastName": "Doe",
  "middleName": "Michael",
  "fullName": "John Michael Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+1234567890",
  "role": "commuter",
  "approvalStatus": "approved",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. READ - Get all users (with pagination and filtering)

**GET** `/api/users/`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `role` (optional): Filter by role (commuter, driver, admin)
- `approvalStatus` (optional): Filter by approval status (pending, approved, rejected)
- `search` (optional): Search in firstName, lastName, email, phoneNumber

**Example:** `/api/users/?page=1&limit=5&role=driver&search=john`

**Response (200 OK):**
```json
{
  "users": [
    {
      "_id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "middleName": "Michael",
      "fullName": "John Michael Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "+1234567890",
      "role": "driver",
      "approvalStatus": "approved",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "totalPages": 1,
  "currentPage": 1,
  "total": 1
}
```

### 3. READ - Get user by ID

**GET** `/api/users/:id`

**Response (200 OK):**
```json
{
  "_id": "user_id",
  "firstName": "John",
  "lastName": "Doe",
  "middleName": "Michael",
  "fullName": "John Michael Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+1234567890",
  "role": "driver",
  "approvalStatus": "approved",
  "isActive": true,
  "address": {
    "street": "123 Main Street",
    "city": "Naga City",
    "province": "Camarines Sur",
    "postalCode": "4400",
    "country": "Philippines",
    "fullAddress": "123 Main Street, Naga City, Camarines Sur, 4400, Philippines"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 4. UPDATE - Full update user by ID

**PUT** `/api/users/:id`

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "middleName": "Elizabeth",
  "email": "jane.smith@example.com",
  "phoneNumber": "+0987654321",
  "role": "driver",
  "approvalStatus": "approved",
  "licenseNumber": "DL654321",
  "address": {
    "street": "456 Oak Avenue",
    "city": "Legazpi City",
    "province": "Albay",
    "postalCode": "4500",
    "country": "Philippines"
  },
  "isActive": true
}
```

**Response (200 OK):**
```json
{
  "_id": "user_id",
  "firstName": "Jane",
  "lastName": "Smith",
  "middleName": "Elizabeth",
  "fullName": "Jane Elizabeth Smith",
  "email": "jane.smith@example.com",
  "phoneNumber": "+0987654321",
  "role": "driver",
  "approvalStatus": "approved",
  "isActive": true,
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 5. UPDATE - Partial update user by ID

**PATCH** `/api/users/:id`

**Request Body:**
```json
{
  "firstName": "Jane",
  "middleName": "E.",
  "phoneNumber": "+1111111111"
}
```

**Response (200 OK):**
```json
{
  "_id": "user_id",
  "firstName": "Jane",
  "lastName": "Smith",
  "middleName": "E.",
  "fullName": "Jane E. Smith",
  "email": "jane.smith@example.com",
  "phoneNumber": "+1111111111",
  "role": "driver",
  "approvalStatus": "approved",
  "isActive": true,
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 6. DELETE - Soft delete user (deactivate)

**DELETE** `/api/users/:id`

**Response (200 OK):**
```json
{
  "message": "User deactivated successfully",
  "user": {
    "_id": "user_id",
    "firstName": "Jane",
    "lastName": "Smith",
    "middleName": "E.",
    "fullName": "Jane E. Smith",
    "email": "jane.smith@example.com",
    "isActive": false,
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 7. DELETE - Hard delete user (permanent)

**DELETE** `/api/users/:id/hard`

**Response (200 OK):**
```json
{
  "message": "User permanently deleted",
  "user": {
    "_id": "user_id",
    "firstName": "Jane",
    "lastName": "Smith",
    "middleName": "E.",
    "fullName": "Jane E. Smith",
    "email": "jane.smith@example.com"
  }
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "firstName, lastName, email, password, phoneNumber, and role are required"
}
```

### 401 Unauthorized
```json
{
  "error": "Access denied. No token provided."
}
```

### 403 Forbidden
```json
{
  "error": "Access denied. Admin role required."
}
```

### 404 Not Found
```json
{
  "error": "User not found"
}
```

### 409 Conflict
```json
{
  "error": "Email already exists"
}
```

## Validation Rules

- `firstName`: Required, minimum 2 characters
- `lastName`: Required, minimum 2 characters
- `middleName`: Optional, trimmed string
- `email`: Required, unique, valid email format
- `password`: Required, minimum 6 characters (hashed automatically)
- `phoneNumber`: Required, valid phone number format
- `role`: Required, must be one of: "driver", "commuter", "admin"
- `licenseNumber`: Required if role is "driver"

## Notes

1. **Virtual Field**: The `fullName` field is automatically generated from `firstName`, `middleName`, and `lastName`
2. **Password Hashing**: Passwords are automatically hashed before saving
3. **Soft Delete**: The regular DELETE endpoint deactivates users instead of permanently deleting them
4. **Admin Only**: All CRUD operations require admin authentication
5. **Pagination**: The GET all users endpoint supports pagination and filtering
6. **Search**: The search functionality works across firstName, lastName, email, and phoneNumber fields
