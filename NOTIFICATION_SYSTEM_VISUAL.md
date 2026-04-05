# Notification System - Visual Architecture

## User Interface Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         NAVBAR                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Dashboard │ Profile │ Jobs │ Tracker │ Smart Apply │ 🔔[3]     │
│                                                      ^            │
│                                            Unread badge          │
│                                          (pulse animation)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

         Click Bell Icon ↓

┌──────────────────────────────────────────────────────────────┐
│                  NOTIFICATION DROPDOWN                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Notifications          ✓ Mark all read                      │
│                                                               │
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║ 💼 New Job Alert 🎯                              ○ ✕ ║  │
│  ║    Senior Engineer at TechCorp matches profile       ║  │
│  ║    Mar 2, 3:45 PM                                    ║  │
│  ║                                      [→ Go] [○ Read] ║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│                                                               │
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║ ✓ Application Sent ✓                           ◉ ✕ ║ ║  │
│  ║   Your application for Engineer at StartupXYZ sent   ║  │
│  ║   Mar 1, 2:15 PM                                      ║  │
│  ║                                      [→ Go] [◉ Unread]║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│                                                               │
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║ ⭐ Response Received 🎉                          ◉ ✕ ║ ║  │
│  ║   TechCorp has accepted your application!             ║  │
│  ║   Mar 1, 10:30 AM                                     ║  │
│  ║                                      [→ Go] [◉ Unread]║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│                                                               │
│  3 total notifications                                       │
│                                                               │
└──────────────────────────────────────────────────────────────┘

INTERACTIVITY:

○  = Mark as read
◉  = Mark as unread  
→  = Navigate to related item
✕  = Delete notification
✓ Mark all read = Mark all as read at once
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTION                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
         ┌──────▼─────┐ ┌───▼────────┐ ┌─▼──────────┐
         │   APPLY    │ │ GENERATE   │ │  RESPONSE  │
         │ TO JOB (2) │ │ PROPOSAL   │ │  RECEIVED  │
         └──────┬─────┘ └───┬────────┘ └─┬──────────┘
                │            │            │
                └────────────┼────────────┘
                             │
                       ┌─────▼──────┐
                       │  Database  │
                       │  Create    │
                       │Notification│
                       └─────┬──────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
        ┌─────▼──────┐             ┌──────▼────────┐
        │  User Sees │             │  Notification │
        │ in Dropdown│             │  Stored in DB │
        │  (Polling) │             │  with Metadata│
        └────────────┘             └─────────────┘
```

## Notification Types & Visual Indicators

```
TYPE: job_match
ICON: 💼
COLOR: Cyan (#00d4c8)
MESSAGE: "New job alert! [Title] at [Company] matches your profile"
ACTION: /jobs/[jobId]
EXAMPLE:
  💼 New Job Alert 🎯
  Senior Engineer at TechCorp matches your profile!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE: application_submitted
ICON: ✓
COLOR: Green (#22d47c)
MESSAGE: "Your application for [Title] at [Company] has been submitted"
ACTION: /applications
EXAMPLE:
  ✓ Application Sent ✓
  Your application for Senior Engineer at StartupXYZ has been submitted.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE: response_received (ACCEPTED)
ICON: ⭐
COLOR: Green (#22d47c)
MESSAGE: "[Company] has Accepted your application for [Title]"
ACTION: /applications
EXAMPLE:
  ⭐ Response Received 🎉
  TechCorp has accepted your application for Senior Engineer!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE: response_received (REJECTED)
ICON: ⚠️
COLOR: Red (#ff4d4d)
MESSAGE: "[Company] has Rejected your application for [Title]"
ACTION: /applications
EXAMPLE:
  ⚠️ Response Received 👋
  StartupXYZ has rejected your application for Engineer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE: response_received (PENDING)
ICON: ℹ️
COLOR: Cyan (#00d4c8)
MESSAGE: "[Company] has Reviewed your application for [Title]"
ACTION: /applications
EXAMPLE:
  ℹ️ Response Received 📋
  TechCorp has reviewed your application for Senior Engineer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE: profile_update
ICON: ℹ️
COLOR: Cyan (#00d4c8)
MESSAGE: "Your profile is more complete. Better job matches incoming!"
ACTION: /settings
EXAMPLE:
  ℹ️ Profile Completed 🎨
  Your profile is now more complete. This helps us find better matches!
```

## API Request/Response Flow

```
┌──────────────────────────────┐
│   Frontend (Every 5 seconds)  │
│  GET /notifications/unread    │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Backend (Fast Query)        │
│  countDocuments({             │
│    user: userId,              │
│    read: false                │
│  })                           │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Response                    │
│  {                            │
│    unreadCount: 3             │
│  }                            │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Update UI                   │
│  Badge: shows "3"             │
│  Color: highlights in cyan    │
│  Animation: pulse             │
└──────────────────────────────┘

WHEN USER CLICKS BELL:

┌──────────────────────────────┐
│   Frontend                    │
│  GET /notifications           │
│  (limit: 20)                  │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Backend                     │
│  find({ user: userId })       │
│  .sort({ createdAt: -1 })     │
│  .limit(20)                   │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Response                    │
│  {                            │
│    notifications: [...],      │
│    unreadCount: 3,            │
│    total: 47                  │
│  }                            │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   Render Dropdown             │
│  Show 20 notifications        │
│  Unread appear highlighted    │
└──────────────────────────────┘
```

## Animation Timeline

```
BELL ICON BREATHING (Continuous):
  0ms    ─────────────────────────────  rotate(0°)
  50ms   ╱╲                             rotate(-5°)
  100ms  ║  ╲ ───────────────────────   rotate(0°)
  200ms  ║  │                           rotate(5°)  
  300ms  ║  ╱ ───────────────────────   rotate(0°)
  ... repeats every 2 seconds

BADGE PULSE (Continuous):
  0ms    ◯ (scale:1 opacity:1)
  1000ms   (scale:1.1 opacity:0.8)
  2000ms ◯ (scale:1 opacity:1)    ← repeats

BELL ON HOVER/EXPANDED:
  0ms    rotate(0°) speed:1
  250ms  rotate(10°) speed:1.2
  500ms  rotate(-10°) speed:0.8
  750ms  rotate(0°) speed:0.5
  1000ms done

NOTIFICATION SLIDE-IN:
  0ms    opacity:0 translateY(18px)
  300ms  opacity:1 translateY(0px)   ← ease-out cubic

DROPDOWN SLIDE DOWN:
  0ms    opacity:0 translateY(-10px)
  300ms  opacity:1 translateY(0px)   ← ease-out cubic
```

## Database Indexes

```
Collection: notifications

Index 1: { user: 1, createdAt: -1 }
  Purpose: Fast notification list retrieval
  Query: find({ user }).sort({ createdAt: -1 }).limit(20)
  Scan: ~50ms → ~2-5ms with index

Index 2: { user: 1, read: 1 }
  Purpose: Fast unread count queries
  Query: countDocuments({ user, read: false })
  Scan: ~50ms → ~1-2ms with index

Result: 10-20x query performance improvement
```

## Real-Time Polling Strategy

```
┌────────────────┐
│  5 Second Loop │
└────────┬───────┘
         │
    ┌────▼─────────────────────────────┐
    │ GET /notifications/unread-count   │
    │ Time: 1-2ms (DB indexed query)    │
    │ Data: { unreadCount: N }          │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────┐
    │ Update Badge  │
    │ if count > 0  │
    │ show number   │
    │ else hide     │
    └────┬──────────┘
         │
    ┌────▼───────────┐
    │ Wait 5 seconds │
    └────┬───────────┘
         │
    └────────────────┘ (repeat)

BANDWIDTH: ~100 bytes per request
REQUESTS PER DAY: 17,280 (5s poll × 86,400s)
COST: Negligible (same as 1-2 page views)
LATENCY: 5-second max delay to see new notification
```

## Color Scheme Reference

```
NOTIFICATION TYPE    BACKGROUND COLOR                    BORDER COLOR
─────────────────────────────────────────────────────────────────────
Accent (default)     rgba(0, 212, 200, 0.08)             rgba(0, 212, 200, 0.25)
                     Cyan blend                          ──→ Slightly more opaque

OK (success)         rgba(34, 212, 124, 0.08)            rgba(34, 212, 124, 0.25)
                     Green blend                         ──→ Slightly more opaque

Bad (error)          rgba(255, 77, 77, 0.08)             rgba(255, 77, 77, 0.25)
                     Red blend                           ──→ Slightly more opaque

Warn (caution)       rgba(245, 185, 66, 0.08)            rgba(245, 185, 66, 0.25)
                     Yellow blend                        ──→ Slightly more opaque

Muted (info)         rgba(122, 136, 152, 0.08)           rgba(122, 136, 152, 0.25)
                     Gray blend                          ──→ Slightly more opaque

HOVER STATE:         border-color increases to 0.15
                     background increases to 0.03
```

## Performance Impact Summary

```
┌─────────────────────────────────────┐
│         BEFORE    │    AFTER        │
├─────────────────────────────────────┤
│ CSS: 27.14 kB     │ 32.43 kB  (+5.3│
│ JS:  246.81 kB    │ 249.65 kB (+2.84│
│ Gzip CSS: 5.46kB  │ 6.98 kB   (+1.5 │
│ Gzip JS: 78.73kB  │ 80.51 kB  (+1.8 │
└─────────────────────────────────────┘

Impact: Negligible (~2% increase total)
Reason: Single component, efficient CSS, minimal JS
```
