# Credit System Architecture Diagram

## System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER DASHBOARD                               │
├─────────────────────────────────────────────────────────────────────┤
│                   💳 CREDITS: 10 (Healthy)                           │
│              ⚠️ Low credit warning (if ≤2 credits)                   │
│                                                                      │
│  ┌─────────────────────────────────────┐                           │
│  │  Applications Sent | Response Rate  │                           │
│  │   Jobs Won        | Matched Jobs   │                           │
│  └─────────────────────────────────────┘                           │
│                                                                      │
│  [Charts, Insights, Best-Performing Proposals]                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         SETTINGS PAGE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Smart Apply Defaults [Form]                                        │
│  Subscription Panel [Pro/Free]                                      │
│  Billing Health Card                                                │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   💳 CREDITS SYSTEM                          │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  Current Balance: 10 Credits                                 │  │
│  │  Earned: 16  |  Spent: 6                                     │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │  │
│  │  │  10 Credits  │  │ ⭐50 Credits │  │100 Credits   │        │  │
│  │  │   $4.99      │  │  $19.99      │  │  $34.99      │        │  │
│  │  │  Save 0%     │  │ Save 20% ✓   │  │ Save 30%     │        │  │
│  │  │ [Buy Now]    │  │ [Buy Now]    │  │ [Buy Now]    │        │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │  │
│  │                                                               │  │
│  │  ℹ️ Free Tier: 16 credits                                    │  │
│  │     1 credit per proposal                                    │  │
│  │     2 credits per application                                │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ POST /api/proposals/generate                                 │  │
│  │ ├─ Check credits ≥ 1                                         │  │
│  │ ├─ Deduct 1 credit → CreditTransaction (usage)              │  │
│  │ ├─ Generate proposal                                        │  │
│  │ └─ Return: proposal + credits info                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ POST /api/applications/                                      │  │
│  │ ├─ Check credits ≥ 2                                         │  │
│  │ ├─ Deduct 2 credits → CreditTransaction (usage)              │  │
│  │ ├─ Create application                                       │  │
│  │ └─ Return: application + credits info                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ POST /api/credits/purchase                                   │  │
│  │ ├─ Validate package (10, 50, 100)                            │  │
│  │ ├─ Add credits → CreditTransaction (purchase)                │  │
│  │ ├─ [Future: Call Stripe/PayPal here]                        │  │
│  │ └─ Return: success + updated balance                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GET /api/credits/balance                                     │  │
│  │ └─ Return: current credits + status (healthy/low/zero)       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GET /api/credits/history                                     │  │
│  │ └─ Return: transaction list (usage + purchases)              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       DATABASE SCHEMA                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User {                                                             │
│    _id, name, email, ...                                           │
│    credits: 10          ← Current balance                           │
│    totalCreditsEarned: 16                                          │
│    totalCreditsSpent: 6                                            │
│  }                                                                  │
│                                                                      │
│  CreditTransaction {                                               │
│    _id                                                             │
│    user: ObjectId (User._id)                                      │
│    type: "usage" | "purchase"                                    │
│    action: "proposal_generation" | "job_application"             │
│            | "credit_purchase"                                    │
│    amount: 1 (proposal) | 2 (application) | 10/50/100 (purchase) │
│    balanceBefore: 11                                              │
│    balanceAfter: 10                                               │
│    reference: { jobId, applicationId, purchaseId }               │
│    createdAt, updatedAt                                           │
│  }                                                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

```

## Price Points

| Package | Credits | Price  | Price/Credit | Savings | Status |
|---------|---------|--------|--------------|---------|--------|
| Starter | 10      | $4.99  | $0.499       | 0%      | Basic  |
| Value   | 50      | $19.99 | $0.3998      | 20%     | ⭐ POPULAR |
| Premium | 100     | $34.99 | $0.3499      | 30%     | Best   |

## Features at a Glance

### ✅ User Features
- View current credits on dashboard
- See warning when credits are low (≤2)
- Alert when out of credits (0)
- Earn credits at signup (16 free)
- Purchase more credits with 3 package options
- View transaction history

### ✅ System Features
- Atomic credit deductions (prevents race conditions)
- Transaction tracking for auditing
- Configurable credit costs
- Extensible to real payment providers
- Mock payment simulation
- Status indicators (healthy/medium/low/zero)

### ✅ Admin Features (Future)
- Manual credit adjustments
- User credit refunds
- Usage analytics and reports
- Revenue tracking

## Integration Ready

To connect real payments:

```javascript
// In creditsRoutes.js, POST /purchase endpoint:

// Replace this mock:
const { user, transaction } = await addCredits(...)

// With this real integration:
const stripePaymentIntent = await stripe.paymentIntents.create({...})
const { user, transaction } = await addCredits(...)
// Log transaction.purchaseId = paymentIntent.id for IDEMPOTENCY
```

The system is designed to be payment-agnostic and ready for production.
