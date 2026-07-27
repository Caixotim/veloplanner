# Cycling AI App

This repository is a Next.js 16 App Router application for generating cycling training plans, syncing plans and ride data with Intervals.icu, and presenting the result as an editable calendar with exports and analytics.

## Primary Purpose

- Build named cycling training plans from a small set of plan-driving inputs.
- Use athlete constraints and Intervals.icu ride data to shape workout targets.
- Persist plans locally in IndexedDB.
- Push planned workouts to Intervals.icu and recover previously synced plans.
- Export plans to PDF, CSV, ICS, and Garmin/Zwift workout bundles.

## Runtime Architecture

### UI shell

- `app/page.tsx` is the main orchestration surface.
- It owns plan creation, plan selection, plan deletion, profile updates, session editing, exports, sync actions, and local persistence refreshes.
- It coordinates the core modules instead of using a separate global state library.

### Domain logic

- `app/lib/trainingPlanner.ts` generates plans, session dates, target metrics, and structured workouts.
- `app/lib/mealPlanner.ts` generates meal suggestions.
- `app/lib/diffPlanner.ts` compares original and edited plans.
- `app/lib/analytics.ts` tracks UI and workflow events.

### Persistence

- `app/lib/storage.ts` is the IndexedDB layer.
- It stores user profiles, plans, edit history, ride cache, and sync metadata.
- `StoredPlan` is the local persisted unit for plan library and reopening flows.

### Intervals.icu integration

- `app/lib/intervalsIntegration.ts` handles client-side sync orchestration, fitness insight calculation, and fetching plan backups.
- `app/api/intervals/rides/route.ts` fetches ride data from Intervals.icu.
- `app/api/intervals/plans/route.ts` pushes, replaces, and deletes synced workouts.
- `app/api/intervals/plans/fetch/route.ts` reconstructs plans from previously synced Intervals events.
- `app/api/auth/intervals/*` contains auth and token endpoints.

### Background sync

- `app/lib/useSyncWorker.ts` and `app/lib/syncWorker.ts` manage background ride sync.
- `public/sync-worker.js` is the worker entry served to the browser.

## Data Model

Core types live in `app/lib/types.ts`.

Important entities:

- `UserProfile`: rider context and plan-driving inputs.
- `TrainingPlan`: named plan with weeks, sessions, metrics, and Intervals sync metadata.
- `TrainingWeek`: a week bucket for plan structure and totals.
- `TrainingSession`: dated workout or rest day entry.
- `SyncResult`: Intervals ride-sync result and detected profile changes.
- `PlanDiff`: edit-tracking diff between saved and current plan state.

## Current Planning Model

The app currently separates two concerns:

- Plan inputs: `planName`, `goal`, `planStartDate`, `desiredPlanWeeks`, `ftpIncreaseTargetWatts`.
- Athlete details and constraints: age, height, weight, equipment, injuries, available time, FTP, max HR, and power meter availability.

The plan generator depends mainly on:

- Goal
- Explicit start date
- Duration in weeks
- FTP increase target
- Available time
- Equipment
- FTP / HR / power-meter state for target prescription

Weight changes currently matter mainly for derived metrics like climbing watts per kg, and only force plan refreshes when relevant target logic changes.

## Key User Flows

### Create a plan

1. User enters plan inputs and athlete details in `UserProfileForm.tsx`.
2. `app/page.tsx` builds a `UserProfile`.
3. `trainingPlanner.ts` generates a named plan with explicit dates.
4. Plan and profile are stored in IndexedDB.
5. Plan can be pushed to Intervals.icu immediately.

### Edit a plan

1. User edits sessions in `TrainingCalendar.tsx` or `SessionEditorModal.tsx`.
2. `page.tsx` updates current in-memory plan state.
3. `diffPlanner.ts` tracks pending changes.
4. Save replaces synced Intervals events and updates local storage.

### Update profile

1. User edits the stored profile from the active plan view.
2. `page.tsx` assesses whether the changed fields require regeneration.
3. If required, the plan is regenerated and resynced.
4. If not, only profile or derived metrics are updated.

### Delete a plan

1. User deletes from the active plan controls or saved-plan library.
2. Local stored plan is removed.
3. Intervals cleanup is attempted through the plans API.
4. The plan list is refreshed and the next plan is selected if available.

## UI Structure

### Main components

- `app/components/UserProfileForm.tsx`: plan inputs and athlete details form.
- `app/components/TrainingCalendar.tsx`: editable calendar view with actual dates.
- `app/components/TrainingPlanDisplay.tsx`: print/export friendly plan display.
- `app/components/SessionEditorModal.tsx`: full session editor.
- `app/components/MealSuggestions.tsx`: meal suggestion display.
- `app/components/PerformanceCharts.tsx`: charts and plan/ride trend display.
- `app/components/AnalyticsDashboard.tsx`: analytics overview.
- `app/components/IntervalsConnection.tsx`: Intervals auth/connect UI.

### Styling

- SCSS Modules are used for component/page styling.
- Global styles live in `app/globals.css`.
- There is no external component library; styling is bespoke.

## Important Files By Responsibility

### Entry points

- `app/page.tsx`: main client page and workflow coordinator.
- `app/layout.tsx`: app shell.

### Planning and business logic

- `app/lib/types.ts`
- `app/lib/trainingPlanner.ts`
- `app/lib/mealPlanner.ts`
- `app/lib/diffPlanner.ts`

### Persistence and sync

- `app/lib/storage.ts`
- `app/lib/intervalsIntegration.ts`
- `app/lib/useSyncWorker.ts`
- `app/lib/syncWorker.ts`

### API routes

- `app/api/auth/intervals/authorize/route.ts`
- `app/api/auth/intervals/token/route.ts`
- `app/api/intervals/rides/route.ts`
- `app/api/intervals/plans/route.ts`
- `app/api/intervals/plans/fetch/route.ts`

## Libraries In Use

### Runtime dependencies

- `next`: app framework and API routes.
- `react`, `react-dom`: UI runtime.
- `clsx`: conditional class names.
- `date-fns`: date utilities when needed.
- `recharts`: analytics and performance visualizations.
- `html2canvas`: DOM capture for PDF export.
- `jspdf`: PDF creation.
- `jszip`: Garmin/Zwift workout bundle ZIP export.

### Development dependencies

- `typescript`: strict typechecking.
- `eslint`, `eslint-config-next`: linting.
- `jest`: test runner.
- `sass`: SCSS support.
- `@types/*`: TypeScript typings for runtime/dev dependencies.

## Conventions

- TypeScript strict mode is expected.
- Prefer editing through the existing domain helpers rather than duplicating logic in components.
- Keep public data shapes centralized in `app/lib/types.ts`.
- Use native `console` logging for debug output.
- Keep component styling in colocated `.module.scss` files.
- Prefer minimal, targeted edits over broad refactors.

## Environment And Commands

### Environment

- Intervals credentials are read from `.env.local`.
- Expected keys include `INTERVALS_ICU_API_KEY` and `INTERVALS_ICU_ATHLETE_ID`.

### Common commands

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

## Notes For Future Agents

- Start from `app/page.tsx` if the request involves user-visible plan lifecycle behavior.
- Start from `app/lib/trainingPlanner.ts` if the request involves workout structure, dates, targets, or generation rules.
- Start from `app/api/intervals/plans/route.ts` if the request involves Intervals push/delete behavior.
- Start from `app/lib/storage.ts` if the request involves saved plans, plan library behavior, or persistence bugs.
- The app already supports multiple named plans and explicit plan start dates.
- Calendar correctness matters because Intervals.icu sync uses the session dates generated here.
