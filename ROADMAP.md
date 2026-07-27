# VeloPlanner — Feature Roadmap

## Phase 1 — Close the Training Loop

### 1.1 Actual vs Planned ride auto-matching ✅
Match cached Intervals rides to planned sessions by date (±1 day window). Show overlay on each calendar card: actual duration, avg power, TSS vs planned. Auto-create a `SessionCompletion` from the matched ride if none exists manually.

**Files:** `app/lib/rideMatcher.ts` (new), `TrainingCalendar.tsx`, `PlansWorkspace.tsx`

### 1.2 Readiness / morning check-in ✅
Simple daily log: sleep quality (1–5), stress level (1–5), muscle soreness (1–5). Stored per-day in IndexedDB. Shown on the dashboard "Today" tab and as a small indicator on today's calendar cell.

**Files:** `app/components/ReadinessCheckIn.tsx` (new), `app/lib/storage.ts`, `app/lib/types.ts`

---

## Phase 2 — Athlete Body Metrics

### 2.1 Body metrics log ✅
Log weight, resting HR, and optional HRV as a time-series in IndexedDB. Trend chart in the Analytics tab.

**Files:** `app/components/BodyMetricsLog.tsx` (new), `app/lib/storage.ts`, `app/components/PerformanceCharts.tsx`

---

## Phase 3 — Season Planning

### 3.1 Yearly / season planner view ✅
Horizontal timeline showing all stored plans across the calendar year. Phase-color-coded bars (Base / Build / Peak / Recovery). A-B-C events overlaid. Click a plan to switch to it.

**Files:** `app/components/SeasonPlanner.tsx` (new), `PlansWorkspace.tsx` (new tab)

---

## Phase 4 — Device Integrations

### 4.1 Garmin Connect basic sync ⬜
Low priority — Intervals.icu already captures Garmin data for users who have that connection configured.

---

## Status Legend
- ⬜ Not started
- 🔄 In progress
- ✅ Done
