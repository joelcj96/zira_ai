# Notification System - Quick Start & Testing Guide

## Quick Start (5 Minutes)

### 1. Backend Ready ✓
- All models and routes are integrated
- Notifications auto-create on application submission
- Database indexes are set up

### 2. Test the System

**Option A: Create Test Notification**

```bash
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "application_submitted"}'

# Supported types:
# - job_match
# - application_submitted
# - response_received
```

**Option B: Apply to a Job**
1. Go to Jobs page
2. Click "Apply" on any job
3. Check notification bell - should show "Application Sent ✓"
4. Bell badge increments by 1

**Option C: Simulate Real Flow**
1. Open app in two browser tabs
2. In Tab 1: Open notification dropdown
3. In Tab 2: Create test notification via curl
4. In Tab 1: Wait 5 seconds - notification appears automatically
5. In Tab 1: Mark as read - badge decrements

### 3. Verify Installation

**Frontend Component**
```bash
# Check NotificationBell is in Layout
grep -r "NotificationBell" frontend/src/components/Layout.jsx
# Should show: import NotificationBell from "./NotificationBell";
```

**Backend Routes**
```bash
# Check notifications routes mounted
grep -r "notificationsRoutes" backend/src/server.js
# Should show: app.use("/api/notifications", notificationsRoutes);
```

**Styles**
```bash
# Check notification styles exist
grep -r "notification-bell" frontend/src/styles.css
# Should show: hundreds of lines of notification CSS
```

## Full Testing Workflow

### 1. Authentication
```bash
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.token')

# Use $TOKEN for all subsequent requests
```

### 2. Check Initial State
```bash
curl http://localhost:5000/api/notifications \
  -H "Authorization: Bearer $TOKEN"

# Response:
# {
#   "notifications": [],
#   "unreadCount": 0,
#   "total": 0
# }
```

### 3. Create Test Notifications

**Job Match**
```bash
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"job_match"}'
```

**Application Submitted**
```bash
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"application_submitted"}'
```

**Response Received**
```bash
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"response_received"}'
```

### 4. List Notifications
```bash
curl http://localhost:5000/api/notifications?limit=10 \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'

# Response includes: _id, type, title, message, icon, color, read, createdAt
```

### 5. Check Unread Count (Polling Test)
```bash
curl http://localhost:5000/api/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN"

# Response: { "unreadCount": 3 }
```

### 6. Mark as Read
```bash
NOTIF_ID=$(curl http://localhost:5000/api/notifications \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.notifications[0]._id')

curl -X PUT http://localhost:5000/api/notifications/$NOTIF_ID/read \
  -H "Authorization: Bearer $TOKEN"

# Check again - unreadCount should decrease
```

### 7. Mark as Unread
```bash
curl -X PUT http://localhost:5000/api/notifications/$NOTIF_ID/unread \
  -H "Authorization: Bearer $TOKEN"

# unreadCount should increase
```

### 8. Mark All as Read
```bash
curl -X PUT http://localhost:5000/api/notifications/mark-all/read \
  -H "Authorization: Bearer $TOKEN"

# All notifications now have read: true
```

### 9. Delete Notification
```bash
curl -X DELETE http://localhost:5000/api/notifications/$NOTIF_ID \
  -H "Authorization: Bearer $TOKEN"

# total count decreases
```

### 10. Clear All
```bash
curl -X DELETE http://localhost:5000/api/notifications/clear/all \
  -H "Authorization: Bearer $TOKEN"

# All notifications deleted, total = 0
```

## UI Testing Checklist

### Bell Icon
- [ ] Bell icon appears in navbar top-right
- [ ] Bell has gentle breathing animation
- [ ] Hovering over bell makes it ring actively
- [ ] No errors in browser console

### Badge
- [ ] Badge shows unread count (e.g., "3")
- [ ] Badge is red/orange gradient
- [ ] Badge has slight pulse animation
- [ ] Badge disappears when all read

### Dropdown
- [ ] Click bell opens dropdown smoothly
- [ ] Dropdown appears below and to the right
- [ ] Dropdown has glassmorphic background (blurred)
- [ ] Close by clicking outside
- [ ] Close by clicking bell again

### Notifications List
- [ ] Notifications display with emoji icons
- [ ] Titles are bold and prominent
- [ ] Messages are descriptive and clear
- [ ] Timestamps show relative time (e.g., "Feb 28, 2:45 PM")
- [ ] Unread notifications are highlighted slightly
- [ ] List scrolls if more than ~5 items

### Actions
- [ ] ○ (unread circle) appears for read notifications
- [ ] ◉ (filled circle) appears for unread notifications
- [ ] → (arrow) links work and navigate to correct page
- [ ] ✕ (X) deletes notification
- [ ] "Mark all read" button visible when unread count > 0

### Real-Time Polling
- [ ] Open dropdown
- [ ] Create notification from different tab/API
- [ ] Wait 5 seconds
- [ ] Notification appears in list
- [ ] Badge updates automatically

### Responsive
- [ ] Works on desktop (380px dropdown)
- [ ] Works on tablet (90vw)
- [ ] Works on mobile (full width adjusts)
- [ ] Actions still functional on small screens

## Common Issues & Solutions

### Issue: Bell icon not visible
**Solution**:
- Check NotificationBell component is imported in Layout.jsx
- Check browser console for import errors
- Run: `grep -r "NotificationBell" frontend/src/`

### Issue: Notifications don't appear
**Solution**:
- Verify API endpoint exists: `GET /api/notifications`
- Check Network tab in DevTools for 401 (auth) or 404 (endpoint)
- Ensure JWT token is valid
- Check backend server is running

### Issue: Polling not working
**Solution**:
- Check Network tab for repeated `/unread-count` requests every 5 seconds
- Check if requests are succeeding (200 status)
- Look for CORS errors in console
- Verify backend `/api/notifications/unread-count` endpoint

### Issue: Styling looks wrong
**Solution**:
- Clear browser cache (Ctrl+Shift+Delete)
- Run frontend rebuild: `npm run build`
- Check notification styles were added to styles.css
- Search for "notification-bell" in styles.css

### Issue: Mark as read doesn't work
**Solution**:
- Check Network tab - PUT request should succeed (200)
- Ensure notification ID is correct
- Check server logs for errors
- Reload page and check if change persisted

## Performance Monitoring

### Check Backend Load
```bash
# Monitor response times
curl -w "Total time: %{time_total}s\n" \
  http://localhost:5000/api/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN"

# Should be < 10ms
```

### Check Frontend Bundle
```bash
# In browser DevTools Network tab:
# - Verify no huge files added
# - Check gzip sizes:
#   - CSS: should be ~7KB
#   - JS: should be ~80KB
```

### Monitor Polling Requests
```bash
# In browser DevTools Network tab:
# - Filter to XHR requests
# - Should see request every 5 seconds
# - Each request ~100 bytes
# - Response ~50 bytes
```

## Production Checklist

Before deploying to production:

- [ ] Remove or secure POST `/test` endpoint
- [ ] Test with real user data
- [ ] Monitor database indexes are created
- [ ] Set up monitoring/alerting on `/api/notifications` endpoint
- [ ] Test WebSocket upgrade path (future)
- [ ] Load test with multiple concurrent users
- [ ] Test on real mobile devices
- [ ] Test on Chrome, Firefox, Safari
- [ ] Document any rate limits
- [ ] Plan for notification retention policy (e.g., delete after 30 days)

## Example Production Code

```javascript
// Production: Remove or gate test endpoint
router.post("/test", protect, async (req, res, next) => {
  // Check environment
  if (process.env.NODE_ENV === "production") {
    res.status(403);
    throw new Error("Test endpoint not available in production");
  }

  // ... rest of test endpoint
});
```

## Logs to Watch For

After implementing notifications, you should see:

```
✓ Notification created: application_submitted for user@example.com
GET /api/notifications - 200 (2ms)
GET /api/notifications/unread-count - 200 (1ms)
PUT /api/notifications/{id}/read - 200 (1ms)
```

If you see errors:
```
✗ Failed to create notification: User not found
✗ Notification query timeout (>5s)
✗ Database connection lost
```

## Next Steps

1. **Integrate with Jobs**
   - Add notification when new job matches profile
   - File: `jobsRoutes.js`

2. **Integrate with Responses**
   - Mock endpoint to simulate application response
   - Trigger `notifyResponseReceived()`

3. **Add Email Notifications**
   - Send email digest nightly
   - Let users disable per notification type

4. **Upgrade to WebSocket**
   - Replace polling with Socket.io
   - Real-time < 100ms latency

## Summary of All Endpoints

```
GET    /api/notifications                    → Get list + unread count
GET    /api/notifications/unread-count       → Get unread count only  
PUT    /api/notifications/:id/read           → Mark one as read
PUT    /api/notifications/:id/unread         → Mark one as unread
PUT    /api/notifications/mark-all/read      → Mark all as read
DELETE /api/notifications/:id                → Delete one notification
DELETE /api/notifications/clear/all          → Delete all notifications
POST   /api/notifications/test               → Create test notification
```

All endpoints are protected with `protect` middleware (require auth).

Good luck with your notification system! 🔔
