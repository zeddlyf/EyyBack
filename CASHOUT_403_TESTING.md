# 🧪 Cashout 403 Error - Testing & Verification Guide

## Overview
This guide helps you test and verify the cashout functionality and diagnose 403 errors.

## Quick Diagnosis

### 1. Check Backend Logs
When a user attempts cashout and gets 403, the backend logs will show:
```
[CASHOUT] 403 - User is not a driver (role=commuter, userId=..., email=user@example.com)
```

### 2. Frontend Error Message
The user sees in the app:
```
Withdrawal Failed
Failed to initiate cash-out: Request failed with status code 403
```

### 3. Detailed Error Response
The API returns:
```json
{
  "error": "Only drivers can withdraw funds",
  "userRole": "commuter",
  "message": "Your account is registered as a 'commuter'. Only driver accounts can request cash-outs. Please contact support if you need to upgrade your account."
}
```

## Testing Steps

### Test 1: Verify User's Current Role

#### Option A: Using the Node Script
```bash
cd EyyBack
node scripts/fix-user-role.js check geeper@example.com
```

Expected output for a commuter account:
```
📋 User Information:
   Email: geeper@example.com
   Name: Geeper Deliguin
   Role: commuter                    ⚠️ WRONG
   ID: 507f1f77bcf47dca67844111
```

#### Option B: Using API Debug Endpoint (Development Only)
```bash
curl http://localhost:3000/api/auth/debug/user/geeper@example.com
```

Expected response for commuter:
```json
{
  "user": {
    "role": "commuter"
  },
  "message": "❌ User is a 'commuter' but needs to be a 'driver' to cashout"
}
```

#### Option C: Using Frontend API (Development Only)
In the app console:
```javascript
import { authAPI } from './lib/api';

// Check role
const result = await authAPI.debugUserRole('geeper@example.com');
console.log(result.message); 
// Output: "❌ User is a 'commuter' but needs to be a 'driver' to cashout"
```

### Test 2: Update User Role to Driver

#### Option A: Using the Node Script (RECOMMENDED)
```bash
cd EyyBack
node scripts/fix-user-role.js update geeper@example.com driver
```

Expected output:
```
✅ User role updated:
   Email: geeper@example.com
   Old Role: commuter
   New Role: driver
```

Verify the fix:
```bash
node scripts/fix-user-role.js check geeper@example.com
```

Now should show:
```
   Role: driver                      ✅ CORRECT
```

#### Option B: Direct MongoDB
```javascript
db.users.updateOne(
  { email: "geeper@example.com" },
  { $set: { role: "driver" } }
)
```

### Test 3: Test Cashout Flow

#### Step 1: User Logs Out
In the app, tap Profile → Logout

#### Step 2: User Logs In Again
- Email: geeper@example.com
- Password: (user's password)

This refreshes the token with the new role from the database.

#### Step 3: Navigate to Cash Out
Profile → Cash Out button

#### Step 4: Fill in Details
- Amount: 100 (minimum)
- Bank: GCash
- Account Number: 0912345****
- Account Holder Name: Geeper Deliguin

#### Step 5: Submit
Click "Submit Request"

#### Expected Success
```
✅ Withdrawal successful: {response data}

Alert:
"Withdrawal Request Submitted
Your withdrawal request of ₱100.00 has been submitted successfully. It will be processed within 1-3 business days."
```

## Troubleshooting

### Issue: Still Getting 403 After Updating Role

**Cause**: User hasn't logged out and back in

**Solution**:
1. User must log out completely
2. Close and reopen the app
3. Log back in with email and password
4. This will generate a new token with updated role

### Issue: Can't Connect to Database with Script

**Cause**: Database connection error

**Solutions**:
1. Check `.env` file has correct `MONGODB_URI`
2. Ensure MongoDB is running and accessible
3. Ensure backend server is NOT running (port might be in use)
4. Try manual MongoDB update instead

### Issue: User Role Still Shows as Commuter in Debug Endpoint

**Cause**: Database update didn't work or user has stale cache

**Solutions**:
1. Verify update worked: `node scripts/fix-user-role.js check geeper@example.com`
2. Check MongoDB directly:
   ```javascript
   db.users.findOne({ email: "geeper@example.com" }, { role: 1 })
   // Should show: { _id: ..., role: "driver" }
   ```
3. Clear any browser/app caches
4. Ensure user logs out and back in

### Issue: Cashout Button Not Showing

**Possible Causes**:
1. User role is not 'driver' - use test steps to verify
2. User profile data not loading - check network tab
3. Balance is 0 - should still show button but disabled

**Verification**:
1. Check role with script: `node scripts/fix-user-role.js check <email>`
2. Check wallet balance in database:
   ```javascript
   db.wallets.findOne({ user: ObjectId("...") })
   ```

### Issue: 400 Error "Insufficient Balance"

**Cause**: Available balance is less than requested amount

**Details**:
- Minimum withdrawal: ₱100.00
- Available balance = Max(wallet balance, completed ride earnings)

**Solution**:
1. User needs to complete rides and earn ₱100+
2. Or add funds via top-up first
3. Verify balance: `node scripts/fix-user-role.js check <email>`

### Issue: 400 Error "Bank details are required"

**Cause**: Missing required fields

**Required Fields**:
- bankCode: "Gcash", "BDO", "BPI", etc.
- accountNumber: User's account/phone number
- accountHolderName: User's name

**Solution**: Ensure all fields are filled before submitting

## Verification Checklist

### Before Testing
- [ ] Backend server is running on port 3000
- [ ] MongoDB is connected
- [ ] `.env` file has correct MONGODB_URI

### User Setup
- [ ] User is created in database
- [ ] User role is 'driver' (verify with script)
- [ ] User has wallet (auto-created)
- [ ] User has balance ≥ ₱100 or can top up

### Testing Flow
- [ ] User logs out
- [ ] User logs in again
- [ ] Profile page loads correctly
- [ ] Cash Out button is visible
- [ ] Can fill withdrawal form
- [ ] Form validates correctly
- [ ] Can submit request without 403 error
- [ ] Receives success confirmation

### Database Verification
- [ ] User has correct role: `db.users.findOne({ email: "..." }).role`
- [ ] User has wallet: `db.wallets.findOne({ user: ObjectId(...) })`
- [ ] Wallet has balance ≥ 100: `db.wallets.findOne({ user: ObjectId(...) }).balance`

## Commands Reference

### Check User Role
```bash
node scripts/fix-user-role.js check <email>
```

### Update User Role
```bash
node scripts/fix-user-role.js update <email> driver
```

### View Wallet Balance
```javascript
db.wallets.findOne({ user: ObjectId("...") }, { balance: 1 })
```

### View User's Completed Rides
```javascript
db.rides.find({
  driver: ObjectId("..."),
  status: "completed",
  paymentStatus: "completed"
}, { fare: 1, status: 1 })
```

### Check All Users and Their Roles
```javascript
db.users.find({}, { email: 1, role: 1, createdAt: 1 })
```

## Common Scenarios

### Scenario 1: New Driver Sign-Up → Cashout
1. ✅ User signs up through driver flow
2. ✅ Role is set to 'driver'
3. ✅ Wallet is NOT created (only commuters get initial wallet)
4. ✅ User earns from rides, wallet gets balance
5. ✅ User can cashout

### Scenario 2: Commuter Account Getting 403
1. ⚠️ User signed up as commuter
2. ⚠️ Role is 'commuter'
3. ✅ Use script to update: `update <email> driver`
4. ✅ User logs out and back in
5. ✅ User can now cashout

### Scenario 3: Multiple Attempts Showing Different Errors
1. First attempt: 403 (role issue)
2. After role fix: 400 (insufficient balance)
3. After earning from rides: Success!

## Next Steps if Issue Persists

1. **Collect diagnostic information**:
   ```bash
   node scripts/fix-user-role.js check geeper@example.com > diagnostic.txt
   ```

2. **Check recent server logs**:
   - Look for [CASHOUT] or [AUTH] markers
   - Check for database errors

3. **Verify network connectivity**:
   - Ensure app can reach backend
   - Check CORS headers in response
   - Verify Authorization header is being sent

4. **Review user creation flow**:
   - Check what signup endpoint was used
   - Verify role was sent in signup request
   - Check if save succeeded on backend

5. **Contact support with**:
   - User email
   - Output from `fix-user-role.js check` command
   - Server logs showing the error
   - Network tab from browser dev tools
