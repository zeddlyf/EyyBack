# Cashout Simulation Feature

## Overview
The cashout function now includes a **simulation mode** that allows testing and development without making real Xendit API calls. When a driver cashes out, the amount is deducted from their earnings/wallet balance, creating a complete simulation of the cashout process.

## How It Works

### Simulation Mode Enabled
When `CASHOUT_SIMULATION=true` is set in the environment:

1. **Cashout Request** - Driver initiates a cashout request with:
   - Amount to withdraw
   - Bank details (bank code, account number, account holder name)

2. **Validation** - The system checks:
   - User is a driver
   - Amount is valid (minimum ₱100)
   - Bank details are valid
   - Driver has sufficient earnings/wallet balance

3. **Mock Payout** - Instead of calling Xendit API:
   - A mock payout object is created
   - Amount is immediately deducted from wallet balance
   - Transaction is marked as PENDING in the database

4. **Auto-Completion** - After 2 seconds:
   - A simulated webhook callback is triggered
   - Transaction status is updated to COMPLETED
   - The deduction is confirmed

### Result
- Driver's wallet balance is reduced by the cashout amount
- Transaction appears in history as completed
- No real money is processed
- No external API calls are made

## Configuration

### Environment Variables

```dotenv
# Enable cashout simulation (set to 'true' for simulation, remove/comment for real Xendit)
CASHOUT_SIMULATION=true

# Other related settings
NODE_ENV=development
SIMULATE_WEBHOOKS=true
XENDIT_API_KEY=xnd_development_test_key
XENDIT_CALLBACK_TOKEN=test_token
```

### Quick Setup

1. **For Development/Testing (Simulation Mode)**:
   ```bash
   # .env file
   CASHOUT_SIMULATION=true
   NODE_ENV=development
   ```

2. **For Production (Real Xendit)**:
   ```bash
   # .env file - Remove or comment out CASHOUT_SIMULATION
   NODE_ENV=production
   XENDIT_API_KEY=your_real_xendit_key
   ```

## Usage Example

### Request
```bash
POST /api/wallet/cashout
Authorization: Bearer {token}
Content-Type: application/json

{
  "amount": 500,
  "bankCode": "BCA",
  "accountNumber": "1234567890",
  "accountHolderName": "John Doe"
}
```

### Response (Simulation Mode)
```json
{
  "success": true,
  "status": "completed_simulation",
  "amount": 500,
  "message": "Cash-out simulation completed successfully. Amount has been deducted from your earnings.",
  "simulated": true,
  "payoutId": "sim_payout_1672531200000",
  "referenceId": "payout_1672531200000_fake"
}
```

### What Happens Next
1. **Immediately**: Amount is deducted from wallet balance
2. **After 2 seconds**: Transaction is auto-completed
3. **Result**: Driver sees completed withdrawal in transaction history

## Testing

### Using the Test Script

```bash
cd EyyBack
node TEST_CASHOUT_SIMULATION.js
```

This will:
- Check environment configuration
- Authenticate with a test account
- Get current wallet balance
- Initiate a ₱500 cashout
- Wait for auto-completion
- Display final balance and transaction status

### Manual Testing

1. **Login as a driver**:
   - Email: geeper@gmail.com (or any driver account)
   - Get authentication token

2. **Check wallet balance**:
   ```bash
   curl -H "Authorization: Bearer {token}" \
        http://localhost:5001/api/wallet
   ```

3. **Request cashout**:
   ```bash
   curl -X POST http://localhost:5001/api/wallet/cashout \
        -H "Authorization: Bearer {token}" \
        -H "Content-Type: application/json" \
        -d '{
          "amount": 500,
          "bankCode": "BCA",
          "accountNumber": "1234567890",
          "accountHolderName": "Test Driver"
        }'
   ```

4. **Check transaction history** (after 3 seconds):
   ```bash
   curl -H "Authorization: Bearer {token}" \
        http://localhost:5001/api/wallet/transactions
   ```

## Supported Banks

The simulation works with all banks supported by Xendit:

**Philippine Banks:**
- BCA, BNI, MANDIRI, CIMB, OCBC, UOBMM, HSBC, SCB, MAYBANK, DBP, PNB, METROBANK, BPI, BMO, UCPB, and more

**E-Wallets:**
- GCash, PayMaya, GrabPay, Dana, LinkAja, and more

## Logging and Debugging

### Console Output Examples

**When Simulation is Enabled**:
```
🎭 SIMULATION MODE: Creating mock payout (no real Xendit call)...
💸 Cash-out request: Amount=500, Current wallet balance=1000
✅ Cash-out initiated. Amount deducted. New balance: 500
🎭 SIMULATION: Auto-completing cash-out in 2 seconds...
🎭 SIMULATION callback response (200): { success: true, status: 'cashout_completed' }
✅ SIMULATION: Cash-out auto-completed
```

**Debug Endpoint** (Development Only):
```bash
curl -H "Authorization: Bearer {token}" \
     http://localhost:5001/api/wallet/debug
```

Returns detailed information about:
- Wallet balance
- Completed rides and earnings
- Available balance for cashout
- Transaction count

## Key Features

✅ **No External API Calls** - All processing is local
✅ **Instant Feedback** - Immediate response to user
✅ **Auto-Completion** - Automatic transaction completion
✅ **Complete Tracking** - Full transaction history
✅ **Easy Toggle** - Simple environment variable to switch modes
✅ **Safe Testing** - No real money involved
✅ **Driver Earnings Synced** - Completed ride earnings are included in available balance

## Troubleshooting

### Issue: Cashout status is 'pending' instead of 'completed_simulation'
- **Check**: Is `CASHOUT_SIMULATION=true` in .env?
- **Fix**: Verify the environment variable is set correctly
- **Note**: Real Xendit mode will show 'pending' status (this is correct)

### Issue: No response after cashout request
- **Check**: Is the server running on port 5001?
- **Check**: Is the authentication token valid?
- **Fix**: Verify both and retry

### Issue: Insufficient balance error
- **Check**: Does the driver have enough earnings?
- **Fix**: Complete test rides first, then request cashout
- **Note**: Check debug endpoint for detailed earnings breakdown

### Issue: Transaction not appearing in history
- **Wait**: Transaction may take 1-3 seconds to appear in completed state
- **Refresh**: Try requesting transaction history again
- **Check**: Verify the cashout request was successful (status 200)

## Switching Between Modes

### Enable Simulation (Development):
```bash
# In .env
CASHOUT_SIMULATION=true
```

### Disable Simulation (Real Xendit):
```bash
# In .env - Remove or comment out:
# CASHOUT_SIMULATION=true

# And set real Xendit credentials:
XENDIT_API_KEY=xnd_live_your_real_key
```

### Restart Server After Changes:
```bash
# Kill the server
Ctrl+C

# Restart
npm start
# or
node server.js
```

## Security Notes

1. **Development Only** - Simulation mode is for development and testing
2. **No Real Transactions** - No actual money is processed
3. **Test Data** - Use test bank account numbers
4. **Bank Details** - Even in simulation, account numbers are not stored unencrypted
5. **Audit Trail** - All transactions are logged for debugging

## Related Files

- [services/xendit.js](services/xendit.js) - Xendit API service with simulation support
- [controllers/walletController.js](controllers/walletController.js) - Cashout request handler
- [.env.example](.env.example) - Environment variable template
- [TEST_CASHOUT_SIMULATION.js](TEST_CASHOUT_SIMULATION.js) - Test script

## Support

For issues or questions about the simulation feature:
1. Check the console logs for detailed error messages
2. Run the test script to verify setup
3. Check the debug endpoint for wallet information
4. Review transaction history for completion status
