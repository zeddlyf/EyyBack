# 🔧 403 Cashout Error Fix Guide

## Problem
Users are getting a **403 Forbidden** error when attempting to withdraw/cashout funds with the message:
> "Only drivers can withdraw funds - Your account is registered as a 'commuter'. Only driver accounts can request cash-outs."

## Root Cause
The user's account role in the database is set to `'commuter'` instead of `'driver'`. This prevents them from accessing the cashout endpoint which requires the driver role.

### Why This Happens
1. **Wrong signup flow** - User may have signed up through the commuter flow instead of the driver flow
2. **Account migration issues** - If the account was created before role validation was added
3. **Role field not saved** - During signup, the role field wasn't properly saved to the database

## Solution

### Quick Fix: Update User Role via Script

#### Step 1: Locate the fixing script
The script is located at:
```
EyyBack/scripts/fix-user-role.js
```

#### Step 2: Check user's current role
```bash
cd EyyBack
node scripts/fix-user-role.js check <user-email>
```

Example:
```bash
node scripts/fix-user-role.js check geeper@example.com
```

This will output:
```
📋 User Information:
   Email: geeper@example.com
   Name: Geeper Deliguin
   Role: commuter                    ← This should be 'driver'
   ID: 507f1f77bcf47dca67844111
   Created: 2024-01-15T10:30:00Z

💰 Wallet Information:
   Balance: ₱0.00
   Transactions: 0
```

#### Step 3: Fix the user role
```bash
node scripts/fix-user-role.js update <user-email> driver
```

Example:
```bash
node scripts/fix-user-role.js update geeper@example.com driver
```

This will output:
```
✅ User role updated:
   Email: geeper@example.com
   Old Role: commuter
   New Role: driver
```

### Step 4: Verify the fix
```bash
node scripts/fix-user-role.js check geeper@example.com
```

Now the user can log out and log back in, and the cashout should work!

### Alternative: Update via Database (MongoDB)

If the script doesn't work, you can manually update the database:

```javascript
// MongoDB Shell or Compass
db.users.updateOne(
  { email: "geeper@example.com" },
  { $set: { role: "driver" } }
)
```

### Alternative: Debug Endpoint (Development Only)

If running in development mode, you can check a user's role via HTTP:

```bash
GET http://localhost:3000/api/auth/debug/user/geeper@example.com
```

Response:
```json
{
  "user": {
    "id": "507f1f77bcf47dca67844111",
    "email": "geeper@example.com",
    "fullName": "Geeper Deliguin",
    "role": "commuter",
    "approvalStatus": null,
    "licenseNumber": "DL-123456",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "wallet": {
    "exists": true,
    "balance": 0,
    "transactions": 0
  },
  "message": "❌ User is a 'commuter' but needs to be a 'driver' to cashout"
}
```

## Frontend Impact
After fixing the user role:
1. **User logs out** - Remove the old token
2. **User logs back in** - New token will have the updated role
3. **Cashout works** - User can now access the cashout endpoint

## Prevention
To prevent this issue in the future:

1. **Ensure signup form sends correct role**
   - Driver signup sends `role: 'driver'`
   - Commuter signup sends `role: 'commuter'`

2. **Add validation in auth.js**
   - Already implemented: checks required role-specific fields
   - See: `/register` endpoint validation

3. **Test both signup flows**
   - Test driver signup flow with license number
   - Test commuter signup flow without license number

## Testing Checklist

- [ ] Check user role is correct with `fix-user-role.js check`
- [ ] Update role with `fix-user-role.js update`
- [ ] User logs out and back in
- [ ] User can see "Cash Out" button in profile
- [ ] Cashout dialog accepts amount and bank details
- [ ] Cashout request succeeds (no 403 error)
- [ ] Success message shows withdrawal pending message

## Troubleshooting

### "User not found" error
- Check email spelling (case-insensitive)
- Verify user was created successfully
- Check MONGODB_URI environment variable

### Script fails to connect
- Ensure backend is not running
- Verify MONGODB_URI is correctly set in `.env`
- Check MongoDB is running and accessible

### User still can't cashout after fix
1. Verify role was actually updated with `check` command
2. User must log out and log back in to get new token
3. Check logs for any other 403 errors (approval status, etc.)

## Related Issues
- **401 Unauthorized**: Token has expired - user needs to log in again
- **400 Bad Request**: Validation error - check error message for details
- **Insufficient Balance**: User doesn't have ₱100+ available balance
