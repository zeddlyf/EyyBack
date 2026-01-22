# Driver Cash-Out (Withdrawal) System - Setup Guide

## Overview
The driver cash-out system allows drivers to withdraw their earnings from the wallet. In development mode, this uses **simulated Xendit payouts** that don't require real money or API credentials.

## How It Works

### Development Mode (Simulated)
1. Driver enters cash-out amount and bank details
2. System creates a simulated payout in Xendit format
3. Amount is immediately deducted from wallet (marked as PENDING)
4. Automated webhook callback updates the status to COMPLETED after 2 seconds
5. Driver sees success message and updated balance

### Production Mode (Real Xendit)
1. Driver enters cash-out amount and bank details
2. System creates a real payout request via Xendit API
3. Amount is deducted from wallet (marked as PENDING)
4. Xendit webhook notifies backend when payout is processed
5. Status is updated to COMPLETED or FAILED based on webhook

## Environment Configuration

### Required Environment Variables

```bash
# Server Port
PORT=5001

# Environment
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/eyytrike

# Xendit Configuration
XENDIT_API_KEY=xnd_development_test_key  # Use test key in development
XENDIT_CALLBACK_TOKEN=test_token
XENDIT_WEBHOOK_TOKEN=test_token

# Enable Simulated Webhooks (Development Only)
SIMULATE_WEBHOOKS=true

# Callback URLs
CALLBACK_URL=http://localhost:5001
APP_URL=http://localhost:3000
```

### Copy Environment Template

```bash
cp .env.example .env
```

## Testing Cash-Out in Development

### Step 1: Ensure Driver Has Wallet Balance

The driver needs to have completed rides that generated earnings:
- Wallet balance must be ≥ ₱100 (minimum withdrawal)
- Or have completed rides with wallet payments

### Step 2: Navigate to Driver Profile

1. Open the driver app
2. Go to Profile page
3. Click "Cash Out Earnings" button (if balance > 0)

### Step 3: Fill Withdrawal Form

- **Amount**: Enter amount ≥ ₱100
- **Bank**: Enter bank code (e.g., "BPI", "BDO", "GCASH", "PAYMAYA")
- **Account Number**: Enter account number (e.g., "123456789")
- **Account Holder Name**: Enter full name (e.g., "John Doe")

### Step 4: Submit and Monitor

1. Click "Submit Request"
2. Check console logs for:
   ```
   ✅ Payout created: ID=sim_payout_...
   📤 Simulating Xendit payout callback...
   ✅ Simulated callback sent successfully
   ```
3. Backend should automatically complete the payment after 2 seconds

### Step 5: Verify Wallet Update

- Open wallet balance endpoint: `GET /api/wallet`
- Transaction should show: `type: 'CASHOUT'`, `status: 'COMPLETED'`
- Driver's wallet balance should reflect the deduction

## API Endpoints

### Initiate Cash-Out
```
POST /api/wallet/cashout
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 500,
  "bankCode": "BPI",
  "accountNumber": "123456789",
  "accountHolderName": "John Doe"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "payoutId": "sim_payout_1234567890...",
  "referenceId": "payout_1234567890...",
  "status": "pending",
  "amount": 500,
  "message": "Cash-out request submitted successfully..."
}
```

### Handle Webhook Callback
```
POST /api/wallet/webhook/cashout
x-callback-token: test_token
Content-Type: application/json

{
  "id": "sim_payout_...",
  "reference_id": "payout_...",
  "status": "COMPLETED",
  "amount": 500,
  "currency": "PHP"
}
```

### Test Cash-Out (Development Only)
```
POST /api/wallet/test/simulate-cashout-callback
Content-Type: application/json

{
  "referenceId": "payout_1234567890...",
  "status": "COMPLETED"
}
```

## Troubleshooting

### Issue: "Failed to initiate cash-out"

**Solution**: Check the following:

1. **Validate Request Body**
   - All fields must be present: `amount`, `bankCode`, `accountNumber`, `accountHolderName`
   - Amount must be ≥ ₱100
   - All fields must be strings

2. **Check Wallet Balance**
   ```bash
   # Terminal command to check wallet
   curl -X GET http://localhost:5001/api/wallet \
     -H "Authorization: Bearer <your-token>"
   ```

3. **Check Backend Logs**
   ```
   ✅ Payout created: ID=sim_payout_...
   ✅ Cash-out initiated. Amount deducted.
   ```

4. **Verify Environment Variables**
   ```bash
   echo $NODE_ENV  # Should be 'development'
   echo $SIMULATE_WEBHOOKS  # Should be 'true'
   ```

### Issue: Wallet Not Updated After Cash-Out

**Solution**:
1. Verify webhook callback was sent:
   ```
   📤 Simulating Xendit payout callback for payout_...
   ✅ Simulated callback sent successfully
   ```

2. Check webhook handler processed it:
   ```
   💰 Xendit payout callback received
   ✅ Payout completed
   ```

3. Manually test webhook:
   ```bash
   POST /api/wallet/test/simulate-cashout-callback
   referenceId: "payout_..."
   status: "COMPLETED"
   ```

## Development Features

### Automatic Webhook Simulation
When `SIMULATE_WEBHOOKS=true`, the backend automatically sends a success callback 2 seconds after payout creation.

### Manual Webhook Testing
Use the test endpoint to manually trigger webhook processing:
```
POST /api/wallet/test/simulate-cashout-callback
{
  "referenceId": "payout_xxx",
  "status": "COMPLETED"  // or "FAILED"
}
```

### Debug Logging
Enable verbose logging to see all cash-out operations:
```bash
NODE_ENV=development node server.js
```

Console output will show:
- Payout creation
- Wallet deduction
- Webhook simulation
- Status updates

## Security Notes

1. **Account Numbers**: Only last 4 digits stored in transactions
2. **Webhook Verification**: Token required for production
3. **Amount Validation**: Minimum ₱100, must have sufficient balance
4. **Transaction Records**: All cash-outs logged with metadata

## Next Steps

1. Set up `.env` file with development variables
2. Start backend server: `npm start`
3. Driver completes a ride to generate earnings
4. Test cash-out flow
5. Verify wallet balance updates

For production deployment, update:
- `NODE_ENV` to `production`
- `XENDIT_API_KEY` to real API key
- `XENDIT_CALLBACK_TOKEN` to secure token
- `SIMULATE_WEBHOOKS` to `false`
