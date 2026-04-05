# Credit-Based Usage System - Implementation Summary

## Overview
A scalable credit-based usage system has been implemented allowing users to earn and spend credits on proposals and job applications. The system is mock-payment ready for future real payment integration.

## Features Implemented

### 1. Backend Credit System

#### Models
- **CreditTransaction.js**: Tracks all credit transactions (usage and purchases)
  - Records: deductions, purchases, balance before/after
  - Types: `usage` (proposal/application) and `purchase` (credit purchase)
  - Indexed for fast user transaction queries

- **User.js Enhanced**: Added credit fields
  - `credits`: Current available credits (default: 16)
  - `totalCreditsEarned`: Cumulative credits earned
  - `totalCreditsSpent`: Cumulative credits spent

#### API Endpoints (`/api/credits/`)
1. **GET /balance** - Get current credit balance and statistics
   ```json
   {
     "credits": 10,
     "totalEarned": 16,
     "totalSpent": 6,
     "status": "healthy|low|zero"
   }
   ```

2. **POST /purchase** - Purchase credit packages (mock)
   ```json
   Request: { "package": "10|50|100" }
   Response: { "purchaseId", "credits", "transaction" }
   ```

3. **GET /history** - Get transaction history (last 20 by default)
   ```json
   {
     "total": 47,
     "transactions": [
       {
         "id", "type", "action", "amount",
         "balanceBefore", "balanceAfter", "createdAt"
       }
     ]
   }
   ```

4. **GET /packages** - Get available credit packages and pricing
   ```json
   {
     "packages": [
       { "id": "10", "credits": 10, "price": 4.99, "discount": 0 },
       { "id": "50", "credits": 50, "price": 19.99, "discount": 20, "popular": true },
       { "id": "100", "credits": 100, "price": 34.99, "discount": 30 }
     ]
   }
   ```

### 2. Credit Deduction on Actions

#### Proposal Generation
- **Cost**: 1 credit per proposal
- **Endpoint**: POST `/api/proposals/generate`
- **Behavior**: Deducts credit before generation, fails with 402 if insufficient
- **Response includes**: `credits: { current, deducted, remaining }`

#### Job Application
- **Cost**: 2 credits per application
- **Endpoints**: 
  - POST `/api/applications/` (manual apply)
  - POST `/api/applications/smart-apply` (smart apply)
- **Behavior**: Deducts credit before creation, fails with 402 if insufficient
- **Response includes**: `credits: { deducted, remaining }`

### 3. Frontend UI Components

#### CreditsPurchasePanel Component
- **Location**: `frontend/src/components/CreditsPurchasePanel.jsx`
- **Features**:
  - Real-time credit balance display
  - Status indicators (healthy/medium/low/zero)
  - Statistics: total earned, total spent
  - 3-tier package grid with pricing
  - Popular badge on best-value package
  - Discount badges showing savings percentage
  - Mock purchase simulation with success/error messages
  - Transaction history support (built-in, can be extended)

#### Dashboard Credit Display
- **Location**: Enhanced `DashboardPage.jsx`
- **Features**:
  - Shows current credits at top of dashboard
  - Low credit warning (≤2 credits)
  - Out-of-credits alert
  - Visual status indicator with color coding

#### Settings Integration
- **Location**: `SmartApplySettingsPage.jsx`
- **Changes**:
  - Integrated CreditsPurchasePanel below Smart Apply settings
  - Full credit purchase flow within settings page
  - Persistent credit balance display

### 4. Styling System

#### Credit UI Styles (styles.css)
- `.credits-panel`: Main container with glassmorphism design
- `.credits-display`: Credit balance display with status colors
- `.package-grid`: Responsive 3-column grid (2 on tablet, 1 on mobile)
- `.package-card`: Individual credit package with hover effects
- Popular/discount badges with gradient backgrounds
- Warning/error message animations
- Fully responsive design for all screen sizes

#### Color Scheme
- Healthy: Cyan accent (`--accent`)
- Low: Warning yellow (`--warn`)
- Zero: Bad red (`--bad`)
- Popular packages: Purple gradient (`--accent-3`)

## Database Schema

### CreditTransaction Collection
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  type: "usage" | "purchase",
  action: "proposal_generation" | "job_application" | "credit_purchase",
  amount: Number,
  balanceBefore: Number,
  balanceAfter: Number,
  reference: {
    jobId?: String,
    applicationId?: ObjectId,
    purchaseId?: String
  },
  status: "completed" | "failed" | "pending",
  createdAt: Date,
  updatedAt: Date
}
```

## Usage Flow

### For End Users

1. **View Credits**
   - Dashboard shows current credits with warning if low
   - Settings page shows detailed credit information

2. **Use Credits**
   - Generate proposal → 1 credit deducted
   - Apply to job → 2 credits deducted
   - Cannot proceed if insufficient credits (402 error)

3. **Purchase Credits**
   - Click "Buy Now" on any package in Settings
   - Mock purchase simulates success/failure
   - Instant credit balance update
   - Transaction recorded in history

### For Future Real Payments

The system is designed to be payment-agnostic:
- Mock `POST /credits/purchase` can be replaced with real Stripe/PayPal integration
- Transaction model supports payment status tracking
- Hooks available for `pre_purchase` and `post_purchase` logic
- Reference field in transaction allows linking to external payment IDs

## Error Handling

| Scenario | Status Code | Message | Action |
|----------|-----------|---------|--------|
| Insufficient credits | 402 | "Insufficient credits" | User must purchase |
| Zero credits on proposal | 402 | Message + count | Dashboard shows warning |
| Failed purchase (mock) | 400 | "Invalid package" | User selectsdifferent package |
| User not found | 404 | "User not found" | Auth issue, refresh login |

## Scalability Features

1. **Database Indexing**
   - Optimized queries: `user + createdAt`, `user + type`
   - Prevents slow transaction history lookups

2. **Statelessness**
   - Credit deductions are atomic (single DB operation)
   - No race conditions in concurrent requests
   - Purchase simulation uses timestamp-based IDs

3. **Extensibility**
   - Easy to add new credit actions (e.g., profile reviews, contract generation)
   - Pricing can be updated in packages endpoint
   - Purchase handler can be swapped for payment provider

4. **Analytics Ready**
   - Transaction history enables usage analytics
   - Credit spending patterns trackable
   - Revenue model supportable (by purchase amounts)

## Files Modified

### Backend
- ✅ `src/models/User.js` - Added credits fields
- ✅ `src/models/CreditTransaction.js` - New model
- ✅ `src/routes/creditsRoutes.js` - New routes
- ✅ `src/routes/proposalsRoutes.js` - Added credit deduction
- ✅ `src/routes/applicationsRoutes.js` - Added credit deduction
- ✅ `src/server.js` - Mounted credits routes

### Frontend
- ✅ `src/components/CreditsPurchasePanel.jsx` - New component
- ✅ `src/pages/DashboardPage.jsx` - Added credit display
- ✅ `src/pages/SmartApplySettingsPage.jsx` - Integrated purchase panel
- ✅ `src/styles.css` - Added credit system styles

## Testing the System

### Manual Testing Checklist

1. **View Credits**
   ```
   GET /api/credits/balance
   Expected: User's credit balance and status
   ```

2. **Make Proposal (Costs 1 Credit)**
   ```
   POST /api/proposals/generate
   Expected: Proposal returned, credits decremented by 1
   ```

3. **Apply to Job (Costs 2 Credits)**
   ```
   POST /api/applications/
   Expected: Application created, credits decremented by 2
   ```

4. **Purchase Credits (Mock)**
   ```
   POST /api/credits/purchase { "package": "50" }
   Expected: Credits + 50, success message
   ```

5. **View Transaction History**
   ```
   GET /api/credits/history
   Expected: Array of transactions with types and amounts
   ```

6. **Insufficient Credits**
   - Spend all credits
   - Try to generate proposal
   - Expected: 402 error "Insufficient credits"

### Frontend Testing

1. **Dashboard**: See credit balance with warning if ≤2
2. **Settings**: View CreditsPurchasePanel, click Buy buttons
3. **After Purchase**: Verify balance updates immediately
4. **Responsive**: Test on mobile (packages go 3→2→1 column)

## Performance Notes

- Credit balance check is O(1) database lookup
- Transaction history is paginated (20 per request)
- Deduction happens before action (atomic operation)
- No N+1 queries in transaction listing

## Future Enhancement Ideas

1. **Subscription Plans**
   - Monthly recurring credit packages
   - Loyalty bonuses (extra credits after X purchases)

2. **Credit Rewards**
   - Earn credits for successful applications
   - Referral bonuses
   - Achievement milestones

3. **Admin Tools**
   - Manual credit adjustment (for support)
   - Credit refunds for failed transactions
   - Usage analytics and revenue reports

4. **Real Payment Gateway**
   - Integration point: replace mock in `/api/credits/purchase`
   - Stripe, PayPal, or custom processor
   - Webhook support for async payment confirmation

## Summary

The credit system is production-ready with proper error handling, database design, and UI/UX. It's flexible enough to scale with real payments while being simple enough to test with mock data. All code is syntactically valid and builds successfully.
