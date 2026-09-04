# VeloPlanner — Backend Migration Plan

## Goal
Move from device-local only persistence to a cloud source of truth so user plans, profile changes, edit history, and Intervals sync metadata remain consistent across devices.

The product experience is coach-first: the daily recommendation is the primary workflow, while the calendar and detailed metrics remain supporting views.

## Current Implementation Status

The migration is still local-first. The first stabilization slice is now implemented before introducing cloud state:

- Background ride sync preserves the last successful cursor, uses a small overlap window, prevents overlapping requests, and caches returned rides.
- Ride and plan sync routes perform runtime request validation.
- New plan publication uses non-destructive upsert semantics; ordinary capacity handling never deletes existing workouts.
- Generated plan and session IDs avoid same-millisecond collisions.
- Coach proposal scheduling removes the proposal immediately and restores it only when creation fails.
- The domain model now has backward-compatible plan lifecycle and revision fields for the cloud contract.
- A provider-neutral plan repository contract now defines the future local/cloud persistence seam without selecting an auth or database provider.
- The local repository now implements that contract with optimistic revision checks, providing a safe reference implementation for the future cloud adapter.
- Plan-session deduplication is now a pure, tested helper used by the Intervals publication route.
- Ride-sync request validation is directly covered by route-level tests without contacting Intervals.icu.
- Plan-sync request validation is directly covered by route-level tests without contacting Intervals.icu.
- Worker timer replacement, shutdown, and single-flight behavior are covered by pure lifecycle tests.
- The ride sync route is behavior-tested with mocked upstream responses for normalization, stable-ID filtering, cursor emission, and missing-credential safety.
- IndexedDB persistence is integration-tested for plans, date hydration, edit history, sync metadata, ride caching, and deletion; Jest now uses a fake IndexedDB implementation.
- Plan publication is behavior-tested for stable external IDs and non-destructive capacity refusal; capacity refusals are not retried as transient failures.
- Athlete profiles now persist an IANA timezone, generated plans retain it, and Intervals date formatting uses that timezone with a UTC legacy fallback.
- Generated plans remain `draft` until the athlete explicitly chooses Review & Publish Plan; publication syncs to Intervals first and activates the plan only after a successful push.

Remaining P0 work is application authentication, server-owned Intervals credentials, and a defined cloud source of truth. No production backend route should accept browser-supplied Intervals credentials after that slice is complete.

The implementation order below is authoritative: stabilize local behavior first, then establish identity and contracts, then add cloud persistence and server-side sync.

## Delivery Status — 2026-09-04

**Current position: Stage 1 started, backend foundation and identity.** Stage 0 local stabilization is complete; the application remains local-first until the Supabase project is configured and cloud reads/writes are enabled.

Deployment constraint: the initial production target is Vercel free tier. API handlers must remain short-lived and idempotent; no in-process worker, cron assumption, or local filesystem persistence is allowed. Durable background sync will use persisted Supabase jobs and a later externally-triggered or request-triggered worker slice rather than a permanently running process.

| Stage | Status | What is complete | What is still missing |
| --- | --- | --- | --- |
| 0. Local stabilization and contracts | ✅ Complete | Availability-aware planning, lifecycle types, local repository with revision checks, stable IDs, durable local cursor with overlap, single-flight sync, tested plan-session deduplication, route request and ride behavior validation, worker lifecycle controls, IndexedDB integration, timezone-aware dates, explicit draft publication, runtime sync validation, non-destructive upsert | None for the local stabilization exit criteria |
| 1. Backend foundation and identity | 🟡 In progress | Supabase + Google OAuth direction selected, initial ownership-safe schema/migration added, server/browser Supabase client boundaries added, login/callback/session/logout routes added, SSR session refresh middleware added, sign-in/sign-out account entry point added, ownership-enforced profile and plan collection APIs added, plan detail CRUD with revision conflicts, nested session collection APIs, session detail CRUD, and unauthenticated route tests added | Configure Supabase project and Google provider, apply migration |
| 2. Cloud repository and migration | 🟡 Started | Provider-neutral contract, local reference adapter, Vercel-safe HTTP CloudRepository adapter, cloud date hydration, revision-conflict mapping, adapter tests, idempotent profile/plan/session migration, explicit import/skip prompt with retry UX, account-scoped IndexedDB namespace, coordinated authenticated startup gating, best-effort cloud-to-local cache mirroring, and repository wiring for workspace/profile reads plus plan/profile create/save/select/publish/delete/duplicate/reconciliation/coach flows exist; cloud adapter is not enabled by default | Cloud CRUD integration tests against Supabase, full ancillary-data migration policy and live validation |
| 3. Server-side Intervals jobs | 🟡 Started | Server-only AES-GCM token helper, authenticated connection status/connect/disconnect API, authenticated connection UI persistence, server-owned credential resolution for authenticated rides/plans/events routes, account-owned idempotent sync-job queue schema/API, durable per-account cursor API, stale-lock-aware claiming, success/failure/retry state transitions, short-lived authenticated and service-role Vercel runners for rides and plan syncs, successful ride cursor and plan session-link persistence, account-scoped sync-status endpoint, authenticated sync status/retry UI, and a 15-minute Vercel Cron configuration added; anonymous local-mode headers remain supported during migration | Token refresh/use, live Supabase/Vercel validation |
| 4. Cloud-first rollout | ⬜ Not started | None | Cloud-first reads, offline fallback, two-device validation, feature flag, rollback and deletion/export flows |

The existing “Phase 0–5” section below is the detailed execution plan. Its statuses describe future delivery phases; this table additionally records the prerequisite local stabilization work that was missing from the original plan.

### Contract decisions already made

- Plan dates are calendar dates owned by the athlete's configured local timezone; they must not be recomputed from UTC timestamps during hydration or sync.
- Intervals event dates are derived from the session's local calendar date, while ride cursors use provider activity timestamps.
- A normal upsert may create or update only the plan namespace it owns. Only an explicit repair operation may delete stale events.
- A successful local sync advances its cursor; failed requests and empty responses never advance it beyond the known provider watermark.
- Empty successful responses now preserve the previous local cursor instead of advancing to the browser clock.

## Stage 3 — Conversational Coach
Stage 3 adds an optional server-side AI explanation layer on top of deterministic training logic. The local coach remains the fallback, so the product works without an AI provider and training calculations do not depend on model output.

### Stage 3 behavior
1. The athlete asks a free-form question from Today.
2. The client sends only a small, relevant context snapshot to `POST /api/coach`.
3. The server calls the configured AI provider without exposing credentials to the browser.
4. The response is shown as guidance, not as an automatic plan mutation.
5. Schedule or intensity changes still require explicit confirmation through the existing editor/calendar workflow.

### Optional environment configuration
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (defaults to `gpt-4o-mini`)
- `OPENAI_API_URL` (optional OpenAI-compatible provider endpoint)

Safety rule: model responses explain and suggest; deterministic domain rules and explicit athlete actions control training changes.

Non-negotiable integration requirement:
- Intervals.icu remains a required sync target because it is the bridge that enables downstream Garmin auto-sync without requiring direct Garmin app approval.

## Why This Is Needed
- Current IndexedDB-only persistence means each device has a different state.
- Intervals.icu sync does not represent full app state (plan edits, local metadata, pending diffs).
- Multi-device users can see drift, duplicates, and partial reconciliation behavior.

## Scope
In scope:
- User authentication and backend persistence for profile/plans/sessions.
- Server-side Intervals token management.
- Cloud-first sync metadata and conflict handling.
- Device migration from local storage to backend.
- Preserve and strengthen Intervals.icu sync as a first-class outbound integration path.

Out of scope (initial rollout):
- Full microservice split.
- Replacing existing training generation logic.
- Major UI redesign.
- Replacing Intervals.icu with direct Garmin integration.

## Architecture Direction
- Runtime: Keep Next.js app as API host for first iteration.
- Database: Managed Postgres (Supabase or Neon + Prisma/Drizzle).
- Auth: OAuth providers as default first-party identity (Google/Apple first, optional fallback email magic link).
- Secrets: Encrypt Intervals access/refresh tokens server-side.
- Source of truth: Backend database; IndexedDB becomes local cache only.

### Selected implementation direction
- Authentication: Google OAuth through Supabase Auth. Google is the first provider; Apple or magic-link sign-in can be added later without changing the domain model.
- Database: Supabase hosted Postgres with Supabase migrations and row-level security. This is preferred for the first production slice because auth, sessions, Postgres, ownership policies, and operational tooling are integrated in one system.
- ORM/query layer: Use the Supabase server client for authenticated reads and writes initially; add Drizzle only if the domain query layer becomes complex enough to justify a second abstraction.
- Secrets: Keep Intervals tokens in server-only tables encrypted with an application-managed key; never place them in browser storage after migration.

Alternatives considered: Neon plus Auth.js/Better Auth provides more infrastructure control but requires separately operating auth, session, authorization, and database integration. A self-managed Postgres plus custom Google OAuth is not recommended for the first slice.

## OAuth Provider Strategy (Default)
Primary recommendation:
- Provider 1: Google OAuth
- Provider 2: Apple OAuth
- Optional fallback: Email magic link for users without provider accounts

Why OAuth-first:
- Lowest friction for users (no password creation/management)
- Better cross-device continuity with stable provider identity
- Reduced account recovery burden

## What Changes Once Login/Credentials Are Added
### Product behavior changes
- App becomes user-account scoped, not browser scoped.
- Plans/profile/sync state are isolated by authenticated user.
- Multi-device continuity is enabled by default.
- Sign-out semantics matter: local cached data must be detached from account session.

### Data architecture changes
- Every domain row must include user ownership (directly or via FK chain).
- Introduce identity mapping for provider subject IDs.
- Intervals credentials become server-owned secrets tied to a user account.

### Operational changes
- Auth lifecycle endpoints and session cookies must be maintained.
- Token refresh and revocation become first-class backend concerns.
- Support flows are added for account link/unlink and provider failures.

### Security changes
- Enforce authenticated access on all backend plan/profile/session routes.
- Apply row-level authorization by user_id.
- Add CSRF, secure cookie policy, and server-side token encryption.

## OAuth Implementation Process (End-to-End)
## Step 0 — Provider setup
1. Create OAuth apps in Google and Apple developer consoles.
2. Configure redirect URIs for local/dev/prod.
3. Store client IDs/secrets in server environment.

Deliverables:
- Provider credentials created.
- Redirect URIs validated.

## Step 1 — Auth schema and identity mapping
1. Add auth-linked tables/columns:
  - users: id, email, created_at, updated_at
  - user_identities: user_id, provider, provider_subject, provider_email, created_at
  - user_sessions (if not managed by auth provider): session_id, user_id, expires_at
2. Add uniqueness constraints:
  - unique(provider, provider_subject)
  - unique(users.email) where applicable

Deliverables:
- Migration applied.
- Identity uniqueness guaranteed.

## Step 2 — Auth route implementation
1. Add routes:
  - GET /api/auth/login/:provider
  - GET /api/auth/callback/:provider
  - POST /api/auth/logout
  - GET /api/auth/session
2. On callback:
  - validate state/nonce
  - exchange code for provider tokens
  - upsert user + user_identities
  - issue secure session cookie

Deliverables:
- Login/logout/session lifecycle works end-to-end.

## Step 3 — Protect backend APIs
1. Add auth middleware for all /api/backend/* routes.
2. Resolve current user from session and inject user_id context.
3. Reject unauthorized or cross-user row access.

Deliverables:
- All backend persistence and sync routes are user-isolated.

## Step 4 — Connect Intervals credentials to user account
1. Move Intervals token storage to intervals_connections per user_id.
2. Encrypt access/refresh tokens at rest.
3. Add connect/disconnect endpoints scoped to authenticated user.

Deliverables:
- Each app user has independently managed Intervals credentials.

## Step 5 — Client auth UX and guarded app shell
1. Add sign-in entry screen and provider buttons.
2. Add authenticated app shell guard in main routes.
3. Show account status (connected providers + Intervals link state).

Deliverables:
- User can sign in and access only own data.

## Step 6 — Local-to-account migration on first login
1. Detect existing IndexedDB plans/profile at login.
2. Offer import/skip choice.
3. Run idempotent import with dedupe report.

Deliverables:
- Existing device-only users can move safely without duplicates.

## Step 7 — Cross-device validation and rollout
1. Validate create/edit/delete consistency across two devices.
2. Validate sign-out/sign-in account boundaries.
3. Roll out behind feature flag, then enable progressively.

Deliverables:
- Stable multi-device account behavior in production.

## Data Model (Phase 1)
### 1) users
- id
- email
- display_name
- created_at

### 1b) user_identities
- user_id (FK users.id)
- provider (google|apple|magic_link)
- provider_subject
- provider_email
- created_at

### 2) athlete_profiles
- user_id (FK users.id)
- age, height, weight
- ftp, max_heart_rate
- equipment, injuries, constraints
- quality_priority, short_day_preference
- updated_at

### 3) plans
- id
- user_id (FK users.id)
- name, goal
- start_date, desired_weeks
- revision
- status (draft|active|archived)
- plan_json (compatibility snapshot)
- created_at, updated_at

Lifecycle rules:
- New plans start as `draft` and are not treated as the user's active schedule until explicitly confirmed.
- Confirmation publishes the plan and transitions it to `active`; only one plan may be active per user in the initial rollout.
- Archiving is non-destructive and must not delete the plan's sessions or sync history.
- Legacy local plans may omit `status` and `revision`; migration assigns `draft` and revision `0` before upload.

### 4) sessions
- id
- plan_id (FK plans.id)
- session_date
- type, duration_minutes
- planned_power_min/max, planned_hr_min/max
- notes
- completed_state
- revision
- updated_at

### 5) sync_links
- session_id (FK sessions.id)
- intervals_event_id
- intervals_external_id
- sync_hash
- last_synced_at

### 6) intervals_connections
- user_id (FK users.id)
- athlete_id
- encrypted_access_token
- encrypted_refresh_token
- expires_at
- updated_at

### 7) sync_jobs
- id
- user_id (FK users.id)
- job_type (push|pull|repair)
- state (queued|running|failed|succeeded)
- retry_count
- error_summary
- payload_hash
- created_at, updated_at

### 8) sync_job_events
- id
- sync_job_id (FK sync_jobs.id)
- level (info|warn|error)
- message
- metadata_json
- created_at

### 9) coaching_insights
- id
- user_id (FK users.id)
- plan_id (FK plans.id, nullable)
- insight_date
- status (green|steady|caution|recovery)
- recommendation
- rationale
- supporting_metrics_json
- created_at

### 10) session_feedback
- id
- session_id (FK sessions.id)
- user_id (FK users.id)
- completion_state (completed|partial|skipped)
- perceived_exertion
- athlete_notes
- coach_feedback
- created_at

### 11) readiness_checkins
- id
- user_id (FK users.id)
- checkin_date
- sleep_quality
- stress_level
- muscle_soreness
- notes
- created_at
- updated_at

Coaching insights should be reproducible from plan, ride, readiness, and body-metric inputs. Store the generated explanation and supporting values for auditability; do not make free-form AI text the source of training truth.

## API Plan
### Auth APIs
- GET /api/auth/login/:provider
- GET /api/auth/callback/:provider
- POST /api/auth/logout
- GET /api/auth/session

### Domain APIs
- GET/PUT /api/backend/profile
- GET/POST /api/backend/plans
- GET/PUT/DELETE /api/backend/plans/:planId
- GET/POST /api/backend/plans/:planId/sessions
- PUT/DELETE /api/backend/sessions/:sessionId

### Sync APIs
- POST /api/backend/sync/push-changes
- GET /api/backend/sync/pull-changes?cursor=...
- POST /api/backend/sync/jobs/:jobId/retry
- GET /api/backend/sync/jobs/:jobId

### Existing Intervals Endpoints Reuse
- Continue using app/api/intervals/plans/* logic, invoked by backend orchestration.
- Keep pagination and duplicate protections already implemented.

## Client Refactor Strategy
### Repository abstraction
Create a storage adapter interface and two implementations:
- LocalRepository (existing IndexedDB behavior)
- CloudRepository (new backend APIs)

### Integration points
Prioritize refactor in:
- app/components/PlansWorkspace.tsx
- app/lib/storage.ts
- app/lib/intervalsIntegration.ts

### State flow
- Write-through: mutate backend first, then mirror to local cache.
- Read-through: load backend first, fallback to local when offline.
- Include per-record revision for optimistic concurrency.

## Conflict Handling
- Each mutable entity includes a revision number.
- Writes must include expected revision.
- On mismatch, API returns conflict payload with latest server state.
- Client shows conflict modal for manual resolution when auto-merge is unsafe.

## Sync Semantics
- Deterministic external IDs per session, scoped by user + plan + date + session id.
- Idempotent push: safe retries without duplicates.
- Replace mode for repair operations.
- Store per-session sync hashes to skip no-op pushes.
- Persist failed session IDs for actionable retries.
- Intervals.icu push remains mandatory for publish/sync flows so Garmin-linked downstream sync behavior is preserved.

## Rollout Phases
## Phase 0 — Design + Contracts (1 week)
Status: ✅ Complete
- Stabilize local planner, persistence, and Intervals synchronization before cloud work.
- Add pure helpers and regression tests for cursor, identity, lifecycle, and idempotency behavior.
- Finalize DB schema and migrations.
- Decide OAuth providers and token encryption approach.
- Finalize redirect URI strategy for dev/staging/prod.
- Define API contracts and error model.
- Define conflict policy and merge rules.
- Record the accepted timezone, publication, cursor, and ownership invariants in the implementation contract.

Exit criteria:
- ADR approved for backend architecture and auth.
- API contract draft reviewed.
- Local sync failure and duplicate scenarios have focused regression coverage.
- The local reference adapter and pure synchronization helpers are covered by unit tests.

## Phase 1 — Backend Foundation (1-2 weeks)
Status: 🟡 In progress
- Provision Postgres and migration tooling.
- Implement OAuth login/callback/session/logout management.
- Implement users + user_identities + session persistence.
- Implement users, athlete_profiles, plans, sessions CRUD.
- Add row-level authorization checks.

Exit criteria:
- CRUD E2E works for a signed-in user.
- Unauthorized access blocked.

## Phase 2 — Dual Write Client (1 week)
Status: 🟡 In progress
- Add repository abstraction. ✅
- Route workspace/profile reads, create, profile save, plan selection, publication, primary plan save, delete, bulk delete, and duplicate through the selected repository. 🟡
- Route remaining edit/delete/duplicate/reconciliation mutations through the repository. ✅
- Mirror writes to IndexedDB cache.

Exit criteria:
- Existing UX still works.
- Backend records match client mutations.

## Phase 3 — Server-side Sync Jobs (1 week)
Status: ⬜ Not started
- Move Intervals push/check/fetch orchestration to backend jobs.
- Persist sync mappings and failures.
- Add retry and repair endpoints.

Exit criteria:
- Sync retries are resilient and observable.
- Duplicate event rate is effectively zero.

## Phase 4 — User Data Migration (1 week)
Status: 🟡 In progress
- On first cloud login, import local plans/profile and sessions.
- Deduplicate by stable plan fingerprint + session external IDs.
- Show migration report (imported/skipped/conflicted); retry failed items safely. ✅

Exit criteria:
- Existing users keep their data after upgrade.
- Migration can be retried safely.
- Edit history, sync metadata, and other local account data have an explicit migration policy.

## Phase 5 — Cloud-first Read Path (1 week)
Status: ⬜ Not started
- Switch reads to backend primary.
- Keep IndexedDB as offline cache.
- Remove deprecated local-only logic after stabilization.

Exit criteria:
- Multi-device state remains consistent.
- Rollback switch available via feature flag.

## Testing Plan
### Unit
- Repository adapters.
- Revision conflict logic.
- Sync hash/idempotency utilities.

### Integration
- API auth and authorization.
- CRUD + revision mismatch responses.
- Sync job lifecycle and retries.

### End-to-end
- Device A edits appear on Device B.
- Partial Intervals failures recover with retry.
- No duplicate sessions after repair sync.

## Observability
- Structured logs for sync actions and failures.
- Metrics:
  - sync_push_success_rate
  - sync_partial_failure_count
  - duplicate_event_detection_count
  - multi_device_replication_latency_ms
- Dashboard and alerts for sustained sync failures.

## Security Checklist
- Validate OAuth state and nonce on callback.
- Use httpOnly, secure, sameSite cookies for app sessions.
- Encrypt Intervals tokens at rest.
- Never expose tokens to browser JS.
- Enforce user_id ownership in every query.
- Redact PII from logs and error payloads.

## Risks And Mitigations
- Risk: Migration data conflicts.
  - Mitigation: import dry-run mode + user-visible conflict report.
- Risk: Increased API latency.
  - Mitigation: cache hot plan reads and use incremental pull cursors.
- Risk: Regression in current sync behavior.
  - Mitigation: feature-flag rollout and side-by-side validation.

## Definition Of Done
- A signed-in user can create/edit/delete plans on one device and see same state on another.
- Intervals sync metadata is centralized and auditable.
- Repair sync does not create duplicates.
- Local-only storage is optional cache, not the source of truth.
- End-to-end publish still syncs plans to Intervals.icu successfully for users with connected Intervals accounts.

## Suggested First Implementation Slice
1. Add auth + users + athlete_profiles + plans + sessions tables.
2. Implement backend CRUD for plans and sessions.
3. Refactor PlansWorkspace to dual-write under feature flag.
4. Keep current Intervals pipeline, then move orchestration server-side in next slice.
