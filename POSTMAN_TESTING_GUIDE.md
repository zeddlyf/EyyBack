# Postman Testing Guide for EyyTrike Admin CRUD

This guide will help you test all the CRUD operations for the User model using Postman.

## 🚀 Quick Setup

### 1. Import the Collection
1. Open Postman
2. Click **Import** button
3. Select the file: `EyyTrike_Admin_CRUD.postman_collection.json`
4. The collection will be imported with all the necessary requests

### 2. Server Setup
Make sure your backend server is running:
```bash
cd EyyBack
npm start
```
Server should be running on `http://localhost:3000`

### 3. Admin User Credentials
- **Email**: `admin@eyytrike.com`
- **Password**: `admin123`

## 📋 Testing Steps

### Step 1: Authentication
1. **Login Admin**
   - Go to `Authentication > Login Admin`
   - Click **Send**
   - ✅ Should return status `200` with user data and token
   - The token will be automatically saved to collection variables

### Step 2: Test User Registration (New Name Structure)
1. **Register New User**
   - Go to `Authentication > Register New User`
   - Click **Send**
   - ✅ Should return status `201` with user data
   - Notice the new name structure: `firstName`, `lastName`, `middleName`

### Step 3: CRUD Operations

#### CREATE Operations
1. **Create New User**
   - Go to `User CRUD Operations > CREATE - Create New User`
   - Click **Send**
   - ✅ Should return status `201` with created user data
   - The user ID will be automatically saved for other tests

2. **Create Driver User**
   - Go to `User CRUD Operations > CREATE - Create Driver User`
   - Click **Send**
   - ✅ Should return status `201` with driver user data

#### READ Operations
1. **Get All Users**
   - Go to `User CRUD Operations > READ - Get All Users`
   - Click **Send**
   - ✅ Should return status `200` with paginated user list

2. **Get Users by Role**
   - Go to `User CRUD Operations > READ - Get All Users (Filtered by Role)`
   - Click **Send**
   - ✅ Should return status `200` with only driver users

3. **Search Users**
   - Go to `User CRUD Operations > READ - Search Users`
   - Click **Send**
   - ✅ Should return status `200` with search results

4. **Get User by ID**
   - Go to `User CRUD Operations > READ - Get User by ID`
   - Click **Send**
   - ✅ Should return status `200` with specific user data

#### UPDATE Operations
1. **Full Update (PUT)**
   - Go to `User CRUD Operations > UPDATE - Full Update User (PUT)`
   - Click **Send**
   - ✅ Should return status `200` with updated user data
   - Notice the `fullName` virtual field updates automatically

2. **Partial Update (PATCH)**
   - Go to `User CRUD Operations > UPDATE - Partial Update User (PATCH)`
   - Click **Send**
   - ✅ Should return status `200` with partially updated user data

#### DELETE Operations
1. **Soft Delete (Deactivate)**
   - Go to `User CRUD Operations > DELETE - Soft Delete User (Deactivate)`
   - Click **Send**
   - ✅ Should return status `200` with deactivation message
   - User is deactivated but not permanently deleted

2. **Hard Delete (Permanent)**
   - Go to `User CRUD Operations > DELETE - Hard Delete User (Permanent)`
   - Click **Send**
   - ✅ Should return status `200` with deletion message
   - User is permanently removed from database

### Step 4: Error Testing
1. **Test Unauthorized Access**
   - Go to `Error Testing > Test Unauthorized Access`
   - Click **Send**
   - ✅ Should return status `401` with authentication error

2. **Test Invalid Token**
   - Go to `Error Testing > Test Invalid Token`
   - Click **Send`
   - ✅ Should return status `401` with authentication error

3. **Test Invalid User ID**
   - Go to `Error Testing > Test Invalid User ID`
   - Click **Send`
   - ✅ Should return status `400` with validation error

4. **Test Non-existent User**
   - Go to `Error Testing > Test Non-existent User`
   - Click **Send`
   - ✅ Should return status `404` with not found error

### Step 5: Profile Operations
1. **Get User Profile**
   - Go to `User Profile Operations > Get User Profile`
   - Click **Send`
   - ✅ Should return status `200` with current user profile

2. **Update User Profile**
   - Go to `User Profile Operations > Update User Profile`
   - Click **Send`
   - ✅ Should return status `200` with updated profile

## 🔍 What to Look For

### Successful Responses
- **Status Codes**: 200 (OK), 201 (Created)
- **Response Body**: Contains user data with new name structure
- **Virtual Field**: `fullName` is automatically generated from `firstName`, `middleName`, `lastName`

### Error Responses
- **401 Unauthorized**: Missing or invalid token
- **403 Forbidden**: Insufficient privileges (non-admin trying admin operations)
- **400 Bad Request**: Validation errors or invalid data
- **404 Not Found**: User not found

### Name Structure Validation
- `firstName`: Required, minimum 2 characters
- `lastName`: Required, minimum 2 characters
- `middleName`: Optional, defaults to empty string
- `fullName`: Virtual field, automatically generated

## 🧪 Test Scenarios

### Scenario 1: Complete CRUD Flow
1. Login as admin
2. Create a new user
3. Read the created user
4. Update the user (both PUT and PATCH)
5. Soft delete the user
6. Verify user is deactivated
7. Hard delete the user
8. Verify user is permanently deleted

### Scenario 2: Search and Filter
1. Create multiple users with different roles
2. Test search functionality
3. Test role filtering
4. Test pagination

### Scenario 3: Error Handling
1. Test without authentication
2. Test with invalid token
3. Test with invalid data
4. Test with non-existent resources

## 📊 Expected Results

| Operation | Endpoint | Expected Status | Key Fields |
|-----------|----------|----------------|------------|
| Login | `POST /auth/login` | 200 | `token`, `user` |
| Register | `POST /auth/register` | 201 | `firstName`, `lastName`, `middleName` |
| Create User | `POST /users` | 201 | `_id`, `fullName` |
| Get All Users | `GET /users` | 200 | `users[]`, `total`, `totalPages` |
| Get User by ID | `GET /users/:id` | 200 | Complete user object |
| Update User | `PUT /users/:id` | 200 | Updated user object |
| Partial Update | `PATCH /users/:id` | 200 | Partially updated user |
| Soft Delete | `DELETE /users/:id` | 200 | `isActive: false` |
| Hard Delete | `DELETE /users/:id/hard` | 200 | Deletion confirmation |

## 🐛 Troubleshooting

### Common Issues
1. **Server not running**: Make sure `npm start` is running in the EyyBack directory
2. **Authentication failed**: Check if admin user exists, run `node create-admin.js`
3. **Token expired**: Re-run the "Login Admin" request to get a new token
4. **User not found**: Make sure to create a user first before testing read/update/delete operations

### Debug Tips
1. Check the **Console** tab in Postman for any logged information
2. Verify the **Authorization** header is set correctly
3. Check the **Response** body for detailed error messages
4. Ensure the **Content-Type** header is set to `application/json` for POST/PUT/PATCH requests

## 🎯 Success Criteria

All tests are successful when:
- ✅ Authentication works correctly
- ✅ All CRUD operations return expected status codes
- ✅ New name structure (firstName, lastName, middleName) works properly
- ✅ Virtual fullName field is generated correctly
- ✅ Error handling works as expected
- ✅ Admin-only operations are properly secured
- ✅ Search and filtering work correctly
- ✅ Pagination works properly

Happy testing! 🚀
