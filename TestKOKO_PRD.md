# TestKOKO

## Product Requirements Document (PRD)

------------------------------------------------------------------------

# 1. Product Overview

**Product Name:** TestKOKO\
**Product Type:** Mobile-first browser-based CBT platform\
**Primary Goal:** Deliver secure, scalable online examinations with
strong anti-cheat detection optimized for mobile browsers.

**Core Principle:**\
Prevent what is technically possible. Detect and penalize what cannot be
prevented.

------------------------------------------------------------------------

# 2. Problem Statement

Institutions require: - Mobile-friendly CBT systems - Strong anti-cheat
enforcement - Real-time monitoring - Reliable submissions under unstable
internet - Audit logs for dispute resolution

Many browser-based CBT systems: - Fail to enforce single-session rules -
Lack strong event tracking - Have weak monitoring dashboards - Break
under poor connectivity

TestKOKO addresses these issues.

------------------------------------------------------------------------

# 3. Target Users

## Primary

-   Universities
-   Polytechnics
-   Colleges
-   Private training institutes

## Secondary

-   Corporate certification bodies
-   Online course providers

------------------------------------------------------------------------

# 4. Product Goals

## MVP

-   Secure exam delivery
-   One active session enforcement
-   Event logging + strike system
-   Question randomization
-   Live monitoring dashboard
-   Auto grading (objective)

## V1

-   Similarity detection engine
-   Geofencing (optional)
-   Question variants system
-   Role-based admin permissions
-   Exportable audit reports
-   Institutional analytics

------------------------------------------------------------------------

# 5. Functional Requirements

## 5.1 Student Side

### Authentication

-   Email + password OR
-   Matric number + OTP
-   Rate-limited login attempts
-   Session token rotation
-   One active session per exam

### Exam Start Flow

1.  Open exam link
2.  Authenticate
3.  Session created
4.  Pre-exam instructions
5.  Start exam (server timer begins)

### During Exam

System must: - Autosave every 3--5 seconds - Track navigation - Track
answer changes - Track visibility/page hide/blur events - Track
disconnects/reconnects - Enforce strike policy

### Strike System (Example)

  Event                      Strike
  -------------------------- --------
  Hidden \<3 sec             0
  Hidden 3--10 sec           +1
  Hidden \>10 sec            +2
  Multiple session attempt   +3
  Devtools detection         +1

Escalation: - 3 strikes → Warning - 5 strikes → Temporary lock - 8
strikes → Auto-submit + flag

### Submission

-   Manual submit
-   Auto-submit on timeout
-   Submission receipt ID
-   Flag status attached if applicable

------------------------------------------------------------------------

## 5.2 Admin Side

### Create Exam

-   Name
-   Duration
-   Start & end window
-   Randomization options
-   Strike thresholds
-   One-session rule (KickOld / BlockNew)

### Question Bank

-   Add MCQs
-   Tag by topic/difficulty
-   Create variants
-   Bulk upload (V1)

### Candidate Management

-   Upload roster (CSV)
-   Generate credentials
-   Assign exams
-   Reset sessions

### Live Monitoring

-   Active candidates list
-   Strike counts
-   Status (Active / Disconnected / Flagged)
-   Force submit
-   Extend time
-   Reset session

### Review Panel

-   Auto-graded results
-   Flag list
-   Candidate event timeline
-   Admin decision (Cleared / Warning / Invalidated)

------------------------------------------------------------------------

# 6. Anti-Cheat Architecture

## Single Active Session Enforcement

-   New session triggers:
    -   KickOld mode: invalidate previous token
    -   BlockNew mode: reject new session
-   All API calls validate active session ID

## Event Logging

EventLog fields: - id - sessionId - candidateId - examId - eventType -
metadata - timestamp

## Similarity Detection (V1)

-   Compare answer similarity
-   Compare timing similarity
-   Flag suspicious pairs

------------------------------------------------------------------------

# 7. Non-Functional Requirements

## Performance

-   Support 1,000+ concurrent students
-   Autosave latency \<300ms
-   Dashboard updates \<2s

## Reliability

-   Tolerate network drops
-   Resume without data loss
-   Prevent duplicate submissions

## Security

-   Short-lived JWT
-   HTTPS only
-   Rate limiting
-   CSRF protection
-   Secure cookies

## Data Privacy

-   Minimal PII storage
-   Role-based access
-   Configurable audit retention

------------------------------------------------------------------------

# 8. Recommended Tech Stack

Frontend: - Next.js - TailwindCSS

Backend: - Next.js API or NestJS - PostgreSQL - Prisma ORM - Redis
(sessions + rate limit) - WebSockets (live monitoring)

Hosting: - Vercel (frontend) - Railway/Render (backend) - Supabase/Neon
(database)

------------------------------------------------------------------------

# 9. Database Entities

-   User
-   Candidate
-   Admin
-   Exam
-   Question
-   QuestionVariant
-   ExamSession
-   Attempt
-   Answer
-   EventLog
-   StrikeState
-   Submission

------------------------------------------------------------------------

# 10. KPIs

-   Submission success rate
-   Flag accuracy rate
-   System uptime
-   Autosave latency
-   Session abuse attempts blocked

------------------------------------------------------------------------

# 11. Roadmap

Phase 1: Core MVP\
Phase 2: Similarity engine + analytics\
Phase 3: Native mobile wrapper + AI-assisted flags

------------------------------------------------------------------------

# 12. Success Criteria

TestKOKO succeeds when: - Institutions trust it for high-stakes exams -
Audit logs resolve disputes - Cheating attempts are detected and
discouraged - System handles large concurrent sessions reliably
