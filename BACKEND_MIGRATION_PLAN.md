# VeloPlanner — Backend Migration Plan

## Goal
Move from device-local only persistence to a cloud source of truth so user plans, profile changes, edit history, and Intervals sync metadata remain consistent across devices.

The product experience is coach-first: the daily recommendation is the primary workflow, while the calendar and detailed metrics remain supporting views.

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
Status: ⬜ Not started
- Finalize DB schema and migrations.
- Decide OAuth providers and token encryption approach.
- Finalize redirect URI strategy for dev/staging/prod.
- Define API contracts and error model.
- Define conflict policy and merge rules.

Exit criteria:
- ADR approved for backend architecture and auth.
- API contract draft reviewed.

## Phase 1 — Backend Foundation (1-2 weeks)
Status: ⬜ Not started
- Provision Postgres and migration tooling.
- Implement OAuth login/callback/session/logout management.
- Implement users + user_identities + session persistence.
- Implement users, athlete_profiles, plans, sessions CRUD.
- Add row-level authorization checks.

Exit criteria:
- CRUD E2E works for a signed-in user.
- Unauthorized access blocked.

## Phase 2 — Dual Write Client (1 week)
Status: ⬜ Not started
- Add repository abstraction.
- Route create/edit/delete through CloudRepository under feature flag.
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
Status: ⬜ Not started
- On first cloud login, import local plans/profile/history.
- Deduplicate by stable plan fingerprint + session external IDs.
- Show migration report (imported/skipped/conflicted).

Exit criteria:
- Existing users keep their data after upgrade.
- Migration can be retried safely.

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
