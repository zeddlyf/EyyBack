# Cashout Simulation - Quick Reference

## TL;DR - What Changed

**The cashout function now supports SIMULATION MODE:**
- When `CASHOUT_SIMULATION=true`, drivers can test cashout without real money
- Amount is deducted from their wallet/earnings
- Transaction auto-completes after 2 seconds
- No real Xendit API calls are made

## Current Configuration

✅ **Already Enabled** - Check your `.env` file:
```bash
CASHOUT_SIMULATION=true  # Currently enabled for testing
NODE_ENV=development
CASHOUT_SIMULATION=true
```

## How to Use

### 1. Make a Cashout Request
```bash
curl -X POST http://localhost:5001/api/wallet/cashout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500,
    "bankCode": "BCA",
    "accountNumber": "1234567890",
    "accountHolderName": "Driver Name"
  }'
```

### 2. Immediate Response
```json
{
  "success": true,
  "status": "completed_simulation",
  "amount": 500,
  "simulated": true,
  "message": "Cash-out simulation completed successfully."
}
```

### 3. Check Transaction History
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5001/api/wallet/transactions
```

## What Happens

1. **Request Made** → Amount validated
2. **Wallet Updated** → Amount deducted immediately
3. **Mock Payout** → Simulated payout created (no real API call)
4. **Auto-Complete** → After 2 seconds, transaction marked COMPLETED
5. **Driver Sees** → Withdrawal in their transaction history ✓

## Examples

### Scenario: Driver with ₱1,000 balance cashes out ₱500

```
Initial Balance: ₱1,000
Cashout Amount: ₱500
↓
After Request: ₱500 (deducted immediately)
↓
After 2 seconds: Transaction COMPLETED ✓
```

### Check Balance
```bash
# Before cashout
GET /api/wallet → { balance: 1000 }

# After cashout request
GET /api/wallet → { balance: 500 }

# Transaction history
GET /api/wallet/transactions → [{
  type: 'withdrawal',
  amount: 500,
  status: 'completed',
  ...
}]
```

## Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `CASHOUT_SIMULATION` | `true` | Enable simulation mode |
| `NODE_ENV` | `development` | Development environment |
| `XENDIT_API_KEY` | test key | Not used in simulation |
| `SIMULATE_WEBHOOKS` | `true` | Auto-trigger callbacks |

## Common Issues

| Issue | Solution |
|-------|----------|
| Cashout status is 'pending' | Verify `CASHOUT_SIMULATION=true` in .env |
| Balance not deducted | Check if wallet exists; may need to add funds first |
| Transaction not completed | Wait 3-5 seconds and refresh; auto-complete may be in progress |
| "Insufficient balance" error | Driver needs more earnings or wallet balance |

## Important Notes

1. **Simulation Only** - This mode is for testing, not production
2. **No Real Money** - No Xendit API calls, no actual transfers
3. **Earnings Included** - Completed rides are counted as available balance
4. **Auto-Complete** - Transactions automatically complete after 2 seconds
5. **Test Data** - Use test bank account numbers

## To Switch to Real Xendit

Edit `.env`:
```bash
# Remove or comment out:
# CASHOUT_SIMULATION=true

# Add real Xendit key:
XENDIT_API_KEY=xnd_live_your_real_key_here
```

Then restart the server:
```bash
npm start
```

## Related Files

- **Guide**: [CASHOUT_SIMULATION_GUIDE.md](CASHOUT_SIMULATION_GUIDE.md)
- **Service**: [services/xendit.js](services/xendit.js)
- **Controller**: [controllers/walletController.js](controllers/walletController.js)
- **Test Script**: [TEST_CASHOUT_SIMULATION.js](TEST_CASHOUT_SIMULATION.js)

## Test It Out

```bash
# In EyyBack directory
node TEST_CASHOUT_SIMULATION.js
```

This will test the complete cashout simulation flow with a real driver account.

---

**Status**: ✅ Cashout simulation is fully functional and ready for testing
