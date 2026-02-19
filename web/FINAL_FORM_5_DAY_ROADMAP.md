# TestKOKO Final Form (5-Day Plan)

## Scope Lock

- Ship V1-lite in 5 days from late-MVP baseline.
- Keep core exam runtime stable: auth, one-session, autosave, submit, strike events, monitoring.
- Defer geofencing to post-launch.

## Day Breakdown

### Day 1 - Stability and gates

- Freeze API behavior for auth/exam/admin slices.
- Run `pnpm verify` and close all P0 regressions.
- Lock release gates and smoke checklist.

### Day 2 - Admin onboarding

- Add exam creation API and admin UI flow.
- Add roster CSV upload API and admin UI flow.
- Enforce roster edits before exam start.

### Day 3 - Similarity detection

- Add answer + timing similarity run service.
- Persist suspicious candidate pairs and run metadata.
- Add admin run/read controls in the dashboard.

### Day 4 - Reporting and analytics

- Add exam analytics endpoint.
- Add audit export endpoint (JSON package).
- Surface KPI and export controls in admin UI.

### Day 5 - Release

- Run full verify and final regression pass.
- Validate `/api/health` and key user journeys.
- Prepare release notes and rollback checklist.

## Launch Gates

- Submission success >= 99.7% in pilot runs.
- Duplicate submissions = 0.
- One-session policy enforced for abuse attempts.
- Similarity review and audit export available for dispute handling.
- `pnpm verify` must pass on release candidate.
