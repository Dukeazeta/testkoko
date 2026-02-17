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

Example runtime flow:

```bash
curl "http://localhost:3000/api/exam/runtime?examId=exam-mth101&sessionToken=<token-from-login>"

curl -X POST http://localhost:3000/api/exam/autosave \
  -H "Content-Type: application/json" \
  -d '{"examId":"exam-mth101","sessionToken":"<token-from-login>","questionId":"q-mth101-1","selectedOption":"21"}'

curl -X POST http://localhost:3000/api/exam/submit \
  -H "Content-Type: application/json" \
  -d '{"examId":"exam-mth101","sessionToken":"<token-from-login>","mode":"manual"}'
```

## Next implementation targets

1. Add event log ingestion with strike escalation and monitoring feeds
2. Introduce admin actions (force submit, extend time, reset session) with audit trail
3. Add websocket monitoring stream for admin live dashboard
