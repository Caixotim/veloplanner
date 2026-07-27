# CyclingAI - Advanced Features Implementation

## 🔐 Intervals.icu OAuth2 Authentication

### Environment Setup
Add these to your `.env.local`:
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3010
NEXT_PUBLIC_INTERVALS_ICU_API_URL=https://intervals.icu
```

Intervals API key and Athlete ID are entered in-app from the Integrations page and stored in browser-local IndexedDB.

### OAuth Flow

#### 1. Start Authorization
```typescript
// Navigate to OAuth authorization
window.location.href = '/api/auth/intervals/authorize'
```

#### 2. Callback Handler
- Receives authorization code from Intervals.icu
- Exchanges code for access/refresh tokens
- Stores tokens in secure httpOnly cookies
- Redirects back to app with `?oauth_success=true`

**File:** `app/api/auth/intervals/callback/route.ts`

#### 3. Token Management
- **GET** `/api/auth/intervals/token` - Get current auth status
- **POST** `/api/auth/intervals/token/refresh` - Refresh expired token
- **DELETE** `/api/auth/intervals/token` - Revoke authentication

### Token Security
- Tokens stored in **httpOnly cookies** (not accessible to JavaScript)
- CSRF protection with state parameter
- Automatic token refresh before expiration
- Secure SameSite policy

---

## 🔄 Background Sync Worker

### How It Works
The background sync worker runs independently in a Web Worker thread, syncing Intervals.icu data every **15 minutes**.

```typescript
// Start background sync
const { startSync, stopSync } = useSyncWorker(accessToken)
startSync()

// Stop when needed
stopSync()
```

### Features
- ✅ Non-blocking sync (doesn't freeze UI)
- ✅ Periodic execution (15 minutes interval)
- ✅ localStorage caching for sync metadata
- ✅ Real-time updates via postMessage to main thread

### Files
- **Worker:** `app/lib/syncWorker.ts`
- **Hook:** `app/lib/useSyncWorker.ts`
- **API Route:** `app/api/intervals/rides/route.ts`

### Message Protocol

**Start Sync:**
```typescript
worker.postMessage({
  type: 'SYNC_START',
  interval: 15 * 60 * 1000, // 15 minutes
  accessToken: 'Bearer ...'
})
```

**Sync Result:**
```typescript
{
  type: 'SYNC_RESULT',
  success: boolean,
  newRidesCount: number,
  changes: [{ type, label }],
  timestamp: number,
  error?: string
}
```

### Fallback
If Web Workers are not supported, the app logs a warning and continues with manual sync triggers.

---

## 📊 Analytics & Monitoring

### Event Tracking

Track user actions throughout the app:

```typescript
import { useAnalytics } from '@/app/lib/analytics'

const { trackEvent, startTimer, endTimer, trackMetric } = useAnalytics()

// Simple event
trackEvent('plan_created', { goal: 'ftp_increase', duration: 12 })

// Timed event
startTimer('plan_creation')
// ... do work ...
endTimer('plan_creation', 'plan_created', { data: {...} })

// Performance metric
trackMetric('sync_time', 1234, 'ms', { ridesCount: 5 })
```

### Event Types
- `plan_created` - Plan successfully generated
- `plan_edited` - User modified plan
- `session_edited` - Individual session changed
- `plan_saved` - Changes persisted to storage
- `plan_exported` - Plan exported to PDF/CSV
- `intervals_sync_started` - Sync operation started
- `intervals_sync_completed` - Sync completed successfully
- `intervals_sync_failed` - Sync encountered error
- `intervals_authenticated` - User connected to Intervals.icu
- `intervals_disconnected` - User disconnected from Intervals.icu
- `power_meter_enabled` - User enabled power meter
- `power_meter_disabled` - User disabled power meter

### Analytics Dashboard

View all analytics with the built-in dashboard:

```typescript
import { AnalyticsDashboard } from '@/app/components/AnalyticsDashboard'

// Displays:
// - Total events, plans created, sessions edited
// - Average sync time, error count, last sync
// - Event breakdown pie chart
// - Performance metrics timeline
// - Export to JSON button
```

**Features:**
- 📈 Real-time metrics updates
- 📊 Event breakdown by type
- ⚡ Performance metrics trending
- 💾 Export analytics as JSON
- 🧹 Auto-cleanup of old data

### Storage
All analytics stored in IndexedDB with automatic cleanup:
- Events: Last 1000 tracked
- Metrics: Last 500 tracked
- Retention: Until manually cleared

---

## ⚡ Power Meter Detection

### User Profile Enhancement

New field added to `UserProfile`:
```typescript
interface UserProfile {
  // ... existing fields
  hasPowerMeter: boolean // Does user have a power meter?
}
```

### UI Changes

#### 1. User Profile Form
- **New Section:** "⚡ Power Meter & Performance Data"
- **Checkbox:** "I have a power meter on my bike"
- **Hint Text:** Shows context-sensitive help

```tsx
<label className={styles.checkboxLabel}>
  <input
    type="checkbox"
    checked={profile.hasPowerMeter || false}
    onChange={e => setProfile({ ...profile, hasPowerMeter: e.target.checked })}
  />
  <span>I have a power meter on my bike</span>
</label>
```

#### 2. Training Plan Display
Sessions will show different zones based on power meter:

**With Power Meter (hasPowerMeter = true):**
```
⚡ Zone 1: 120-180W (60-80% FTP)
⚡ Zone 2: 180-240W (80-100% FTP)
⚡ Zone 3: 240-300W (100-125% FTP)
⚡ Zone 4: 300-360W (125-150% FTP)
```

**Without Power Meter (hasPowerMeter = false):**
```
❤️ Zone 1: 120-145 bpm (60-75% max HR)
❤️ Zone 2: 145-160 bpm (75-85% max HR)
❤️ Zone 3: 160-175 bpm (85-95% max HR)
❤️ Zone 4: 175-190 bpm (95-100% max HR)
```

### Training Plan Generation

The training planner respects the `hasPowerMeter` flag:
- If true: Exercises include `plannedPower` field (watts)
- If false: Exercises include `plannedHeartRate` ranges (bpm)

---

## API Routes Summary

### Authentication
- `GET /api/auth/intervals/authorize` - Start OAuth flow
- `GET /api/auth/intervals/callback` - OAuth callback handler
- `GET /api/auth/intervals/token` - Get token info
- `POST /api/auth/intervals/token` - Refresh token
- `DELETE /api/auth/intervals/token` - Revoke auth

### Data Sync
- `POST /api/intervals/rides` - Fetch new rides from Intervals.icu

---

## Implementation Checklist

### Phase 1: Authentication ✅
- [x] OAuth authorization endpoint
- [x] OAuth callback handler
- [x] Token management API
- [x] Secure cookie storage

### Phase 2: Background Sync ✅
- [x] Web Worker implementation
- [x] Sync hook for React
- [x] Periodic sync every 15 minutes
- [x] Message protocol for worker communication

### Phase 3: Analytics ✅
- [x] Event tracking system
- [x] Performance metrics
- [x] Analytics dashboard component
- [x] Export to JSON
- [x] Auto-cleanup of old data

### Phase 4: Power Meter ✅
- [x] `hasPowerMeter` field in UserProfile
- [x] Checkbox in user profile form
- [x] Power meter hint text
- [x] Display in plan summary
- [x] Conditional zone display logic (ready for TrainingPlanDisplay update)

---

## Usage Example

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useAnalytics } from '@/app/lib/analytics'
import { useSyncWorker } from '@/app/lib/useSyncWorker'

export default function MyComponent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const { trackEvent, trackMetric } = useAnalytics()
  const { startSync } = useSyncWorker(isAuthenticated ? 'token' : null)

  useEffect(() => {
    // Start background sync when authenticated
    if (isAuthenticated) {
      startSync()
      trackEvent('background_sync_started')
    }
  }, [isAuthenticated])

  const handleCreatePlan = async () => {
    trackEvent('plan_creation_started')
    
    try {
      // Create plan...
      trackMetric('plan_creation_time', duration, 'ms')
      trackEvent('plan_created', { goal: 'ftp_increase' })
    } catch (error) {
      trackEvent('plan_creation_failed', { error: error.message })
    }
  }

  return (
    <button onClick={handleCreatePlan}>
      Create Training Plan
    </button>
  )
}
```

---

## Testing

### Local Development

1. **Mock OAuth Flow:**
   - OAuth routes work with or without real Intervals.icu credentials
   - Callback route stores mock tokens for testing

2. **Test Background Sync:**
   ```typescript
   // Enable worker logging in browser console
   const worker = new Worker('./syncWorker.ts')
   worker.onmessage = (e) => console.log('Sync result:', e.data)
   ```

3. **Mock Intervals.icu Rides API:**
   - Generates random ride data
   - No real API calls needed
   - Perfect for UI development

4. **Analytics Testing:**
   ```typescript
   const { getDashboard, exportAnalytics } = useAnalytics()
   
   // View current dashboard
   console.log(getDashboard())
   
   // Export for inspection
   const json = exportAnalytics()
   console.log(JSON.parse(json))
   ```

---

## Production Deployment

### Before Going Live

1. **Configure Intervals.icu Credentials**
   - Add real `INTERVALS_ICU_ATHLETE_ID` and `INTERVALS_ICU_API_KEY`
   - Set `NEXT_PUBLIC_APP_URL` to production domain

2. **Enable HTTPS**
   - OAuth requires secure context
   - httpOnly cookies require HTTPS in production

3. **Monitor Background Sync**
   - Check browser DevTools -> Application -> Cookies
   - Verify `intervals_connected` is httpOnly and Secure

4. **Analytics Export**
   - Implement server-side storage for analytics
   - Consider using logging service (Sentry, DataDog, etc.)

5. **Error Boundaries**
   - Wrap components with error boundaries
   - Handle worker errors gracefully
   - Fallback to manual sync if worker fails

---

## Performance Considerations

- **Worker:** Offloads sync from main thread, no UI blocking
- **Analytics:** In-memory with auto-cleanup, <10MB overhead
- **OAuth:** Token refresh automatic, no manual intervention
- **Power Meter:** Minimal overhead, simple boolean check

---

## Future Enhancements

- [ ] Real-time ride notifications
- [ ] Analytics API for server-side storage
- [ ] Advanced ML-based plan adjustments
- [ ] Multi-device sync
- [ ] Offline support with Service Workers
- [ ] Strava/Garmin integration
- [ ] Coach sharing & feedback
