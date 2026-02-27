# TestKOKO Web

Mobile-first CBT platform scaffold for TestKOKO MVP.

## Package manager

Use `pnpm` for all dependency and script commands.

## Quick start

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:push
pnpm prisma:seed
pnpm dev
```

For a destructive local reset seed, run:

```bash
ALLOW_DESTRUCTIVE_SEED=true pnpm prisma:seed -- --reset
```

Open `http://localhost:3000`.
Copy `.env.example` to `.env` before running Prisma commands.

Run PostgreSQL locally before auth testing. Redis can be local or hosted (`rediss://...`).

## Planning and architecture

- PRD source: `../TestKOKO_PRD.md`
- MVP build plan page: `/docs/mvp-implementation-plan`
- Core domain contracts:
  - `src/lib/auth/candidate-identity.ts`
  - `src/lib/exam/session-policy.ts`
  - `src/lib/exam/strike-engine.ts`
  - `src/lib/exam/types.ts`

## Locked MVP decisions

- Candidate sign in with `candidateId + surname`
- `candidateId` accepts matric or exam number
- Default session strategy is `BlockNew`
- Candidate record edits allowed before exam start only
- Autosave target interval is 4 seconds

## Auth/session API slice

- `POST /api/auth/login`
  - Input: `examId` or `examAccessCode`, `candidateId`, `surname`
  - Behavior: validates roster identity from PostgreSQL, applies rate limit, enforces one-session policy (`BlockNew` default)
- `POST /api/auth/session/validate`
  - Input: `sessionToken`, `examId`
  - Behavior: verifies token is active, not expired, and still the active session for that candidate
- `GET /api/auth/reference` (development only)
  - Returns seeded exam and demo candidate credentials for local testing

Session token and active-session cache keys are maintained in Redis, with PostgreSQL as the source of truth.
In production, Redis is required. In development, the app can fall back if Redis is unavailable unless `REQUIRE_REDIS=true`.
Integration tests skip Redis by default (`USE_REDIS_IN_TEST=false`) to reduce flaky network dependencies.

## Local auth test

1. Ensure PostgreSQL is running and `REDIS_URL` points to local or hosted Redis
2. Start app with `pnpm dev`
3. Read demo credentials from `GET http://localhost:3000/api/auth/reference`
4. Call login endpoint:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"examAccessCode":"MTH101-FEB26","candidateId":"MAT-00123","surname":"Adebayo"}'
```

5. Validate returned session:

```bash
curl -X POST http://localhost:3000/api/auth/session/validate \
  -H "Content-Type: application/json" \
  -d '{"examId":"exam-mth101","sessionToken":"<token-from-login>"}'
```

## Exam runtime API slice

- `GET /api/exam/runtime?examId=<id>&sessionToken=<token>`
  - Returns session-locked randomized question order and current saved answers.
- `POST /api/exam/autosave`
  - Input: `examId`, `sessionToken`, `questionId`, `selectedOption`
  - Behavior: idempotent answer upsert by `(sessionId, questionId)`.
- `POST /api/exam/submit`
  - Input: `examId`, `sessionToken`, `mode` (`manual` or `timeout`)
  - Behavior: race-safe finalization with one submission receipt per session.
- `POST /api/exam/events`
  - Input: `examId`, `sessionToken`, `eventType`, optional `hiddenDurationSeconds`, optional `metadata`
  - Behavior: writes event log, updates strike state, and auto-submits when threshold is reached.

## Admin monitoring API slice

- `POST /api/admin/auth/login`
  - Input: `email`, `password`
  - Sets secure httpOnly admin session cookie.
- `GET /api/admin/auth/me`
  - Reads current admin session and role.
- `POST /api/admin/auth/logout`
  - Revokes current admin session.
- `GET /api/admin/monitoring?examId=<id>`
  - Returns candidate runtime statuses (`Active`, `Disconnected`, `Flagged`, `Submitted`) and strike totals.
- `POST /api/admin/actions`
  - Input: `examId`, `sessionId`, `actionType`
  - Supports: `force_submit`, `extend_time` (with `extraMinutes`), `reset_session`
- `GET /api/admin/monitoring/stream?examId=<id>`
  - Server-sent events stream with `snapshot` events for live dashboard updates.
- `GET /api/admin/timeline?examId=<id>&sessionId=<id>`
  - Candidate evidence timeline mixing anti-cheat events and admin interventions.

## Final-form admin API additions

- `GET /api/admin/exams`
  - List recent exams with candidate and question counts.
- `POST /api/admin/exams` (`SUPER_ADMIN`)
  - Create a new exam shell with runtime window and strike thresholds.
- `POST /api/admin/exams/[examId]/roster` (`SUPER_ADMIN`)
  - Upload candidate roster CSV (`candidateId,surname,displayName`) before exam start.
- `POST /api/admin/similarity/run`
  - Run answer + timing similarity detection for submitted sessions.
- `GET /api/admin/similarity?examId=<id>`
  - Read latest suspicious pair results for review.
- `GET /api/admin/analytics?examId=<id>`
  - Operational KPIs: submission success, flagged rate, abuse events, autosave cadence proxy.
- `GET /api/admin/reports/audit?examId=<id>`
  - Export exam audit package as JSON (sessions, strikes, events, admin actions).

Role policy:

- `SUPER_ADMIN`: monitoring + all actions
- `PROCTOR`: monitoring + `force_submit` + `extend_time`

Example runtime flow:

```bash
curl "http://localhost:3000/api/exam/runtime?examId=exam-mth101&sessionToken=<token-from-login>"

curl -X POST http://localhost:3000/api/exam/autosave \
  -H "Content-Type: application/json" \
  -d '{"examId":"exam-mth101","sessionToken":"<token-from-login>","questionId":"q-mth101-1","selectedOption":"21"}'

curl -X POST http://localhost:3000/api/exam/submit \
  -H "Content-Type: application/json" \
  -d '{"examId":"exam-mth101","sessionToken":"<token-from-login>","mode":"manual"}'

curl -X POST http://localhost:3000/api/exam/events \
  -H "Content-Type: application/json" \
  -d '{"examId":"exam-mth101","sessionToken":"<token-from-login>","eventType":"visibility_hidden","hiddenDurationSeconds":11}'

curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@testkoko.local","password":"admin12345"}'

curl "http://localhost:3000/api/admin/monitoring?examId=exam-mth101"
```

## UI routes

- Candidate login link format: `http://localhost:3000/exam/<EXAM-ACCESS-CODE>`
- Admin live desk: `http://localhost:3000/admin`

## Reliability tests

```bash
pnpm test
```

`tests/integration/reliability.spec.ts` validates:

- login/session validity
- autosave idempotent upsert behavior
- duplicate submit race safety
- strike escalation auto-submit behavior

## Health endpoint

- `GET /api/health`
  - Reports postgres + redis readiness and process uptime.

## Verification command

```bash
pnpm verify
```

Runs tests, lint, and production build in sequence.

## Deployment checklist

1. Set production env values from `.env.example`.
2. Ensure `ADMIN_PASSWORD` is changed from the default.
3. Run `pnpm prisma:migration:deploy` in deployment environment.
4. Do not run `pnpm prisma:seed -- --reset` in production unless you intentionally want to wipe and reseed data.
5. Run `pnpm verify` before releasing.
6. Confirm `/api/health` returns status `ok` after deploy.

## Next implementation targets

1. Add websocket transport option (beyond SSE) for high-volume monitoring
2. Expand analytics depth (trend charts + institution-level drilldowns)
3. Add advanced question variants and similarity adjudication workflows

