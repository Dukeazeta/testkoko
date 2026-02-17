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

Run PostgreSQL and Redis locally before auth testing.

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

## Local auth test

1. Ensure PostgreSQL + Redis are running
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

## Next implementation targets

1. Add exam runtime APIs (question delivery, autosave, submit finalization)
2. Add event log ingestion with strike escalation and monitoring feeds
3. Introduce admin actions (force submit, extend time, reset session) with audit trail
