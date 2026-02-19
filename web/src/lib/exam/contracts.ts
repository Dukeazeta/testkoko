import type { AuthErrorResponse } from "@/lib/auth/contracts";
import type { StrikeEventType } from "@/lib/exam/types";

export interface ExamRuntimeRequest {
  examId?: string;
  sessionToken?: string;
}

export interface ExamRuntimeQuestion {
  questionId: string;
  orderIndex: number;
  prompt: string;
  options: string[];
  selectedOption: string | null;
  savedAt: string | null;
}

export interface ExamRuntimeSuccessResponse {
  ok: true;
  data: {
    sessionId: string;
    examId: string;
    candidateId: string;
    candidateName: string;
    title: string;
    timeRemainingSeconds: number;
    questions: ExamRuntimeQuestion[];
  };
}

export interface ExamAutosaveRequestBody {
  examId?: string;
  sessionToken?: string;
  questionId?: string;
  selectedOption?: string;
}

export interface ExamAutosaveSuccessResponse {
  ok: true;
  data: {
    sessionId: string;
    questionId: string;
    selectedOption: string;
    savedAt: string;
  };
}

export interface ExamSubmitRequestBody {
  examId?: string;
  sessionToken?: string;
  mode?: "manual" | "timeout";
}

export interface ExamSubmitSuccessResponse {
  ok: true;
  data: {
    sessionId: string;
    receiptId: string;
    submittedAt: string;
    mode: "manual" | "timeout";
    totalQuestions: number;
    answeredQuestions: number;
    correctAnswers: number;
    scorePercent: number;
    alreadySubmitted: boolean;
  };
}

export interface ExamEventIngestRequestBody {
  examId?: string;
  sessionToken?: string;
  eventType?: StrikeEventType;
  hiddenDurationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface ExamEventIngestSuccessResponse {
  ok: true;
  data: {
    sessionId: string;
    eventType: StrikeEventType;
    addedStrikes: number;
    totalStrikes: number;
    action: "none" | "warning" | "temporary_lock" | "auto_submit";
    autoSubmitted: boolean;
  };
}

export interface AdminMonitoringRequest {
  examId?: string;
}

export interface AdminCandidateMonitoringRow {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  status: "Active" | "Disconnected" | "Flagged" | "Submitted";
  strikes: number;
  lastEventType: string | null;
  lastEventAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
  extendedUntil: string | null;
}

export interface AdminMonitoringSuccessResponse {
  ok: true;
  data: {
    examId: string;
    title: string;
    activeCount: number;
    disconnectedCount: number;
    flaggedCount: number;
    submittedCount: number;
    candidates: AdminCandidateMonitoringRow[];
  };
}

export interface AdminTimelineRequest {
  examId?: string;
  sessionId?: string;
}

export interface AdminTimelineSuccessResponse {
  ok: true;
  data: {
    examId: string;
    sessionId: string;
    candidateId: string;
    candidateName: string;
    entries: Array<{
      id: string;
      kind: "event" | "admin_action";
      createdAt: string;
      label: string;
      detail: string;
      strikeDelta?: number;
      strikeTotalAfter?: number;
      actor?: string;
    }>;
  };
}

export interface AdminActionRequestBody {
  examId?: string;
  sessionId?: string;
  actionType?: "force_submit" | "extend_time" | "reset_session";
  extraMinutes?: number;
  reason?: string;
}

export interface AdminActionSuccessResponse {
  ok: true;
  data: {
    actionType: "force_submit" | "extend_time" | "reset_session";
    sessionId: string;
    status: "Active" | "Disconnected" | "Flagged" | "Submitted";
    message: string;
    submittedReceiptId?: string;
    newExpiresAt?: string;
    newExtendedUntil?: string;
  };
}

export interface AdminExamSummary {
  examId: string;
  accessCode: string;
  title: string;
  startsAt: string;
  endsAt: string;
  sessionPolicy: "BlockNew" | "KickOld";
  warningThreshold: number;
  temporaryLockThreshold: number;
  autoSubmitThreshold: number;
  candidateCount: number;
  questionCount: number;
  createdAt: string;
}

export interface AdminExamCreateRequestBody {
  accessCode?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  sessionPolicy?: "BlockNew" | "KickOld";
  warningThreshold?: number;
  temporaryLockThreshold?: number;
  autoSubmitThreshold?: number;
  questions?: Array<{
    prompt: string;
    options: string[];
    correctOption: string;
  }>;
}

export interface AdminExamCreateSuccessResponse {
  ok: true;
  data: {
    exam: AdminExamSummary;
  };
}

export interface AdminExamListSuccessResponse {
  ok: true;
  data: {
    exams: AdminExamSummary[];
  };
}

export interface AdminRosterUploadRequestBody {
  csv?: string;
}

export interface AdminRosterUploadSuccessResponse {
  ok: true;
  data: {
    examId: string;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    totalProcessed: number;
    issues: Array<{
      row: number;
      message: string;
    }>;
  };
}

export interface AdminSimilarityRunRequestBody {
  examId?: string;
  answerWeight?: number;
  timingWeight?: number;
  scoreThreshold?: number;
  minCommonAnswers?: number;
}

export interface AdminSimilarityRunSuccessResponse {
  ok: true;
  data: {
    runId: string;
    examId: string;
    generatedPairs: number;
    scoreThreshold: number;
    createdAt: string;
  };
}

export interface AdminSimilarityListRequest {
  examId?: string;
  minScore?: string;
}

export interface AdminSimilarityListSuccessResponse {
  ok: true;
  data: {
    run: {
      runId: string;
      examId: string;
      initiatedBy: string;
      answerWeight: number;
      timingWeight: number;
      scoreThreshold: number;
      minCommonAnswers: number;
      generatedPairs: number;
      createdAt: string;
    } | null;
    pairs: Array<{
      id: string;
      leftCandidateId: string;
      rightCandidateId: string;
      leftCandidateName: string;
      rightCandidateName: string;
      commonAnswered: number;
      matchingAnswers: number;
      answerSimilarity: number;
      timingSimilarity: number;
      combinedScore: number;
      flagged: boolean;
    }>;
  };
}

export interface AdminAnalyticsRequest {
  examId?: string;
}

export interface AdminAnalyticsSuccessResponse {
  ok: true;
  data: {
    examId: string;
    generatedAt: string;
    totals: {
      registeredCandidates: number;
      submittedCandidates: number;
      flaggedCandidates: number;
      activeSessions: number;
    };
    rates: {
      submissionSuccessRate: number;
      flaggedRate: number;
    };
    integrity: {
      strikeEvents: number;
      abuseAttemptEvents: number;
      averageStrikesPerCandidate: number;
    };
    reliability: {
      autosaveCadenceP95Seconds: number | null;
    };
  };
}

export interface AdminAuditReportRequest {
  examId?: string;
}

export interface AdminAuditReportSuccessResponse {
  ok: true;
  data: {
    exam: {
      examId: string;
      accessCode: string;
      title: string;
      startsAt: string;
      endsAt: string;
      generatedAt: string;
    };
    candidates: Array<{
      candidateId: string;
      candidateName: string;
      sessionId: string | null;
      sessionStatus: "active" | "revoked" | "expired" | "submitted" | null;
      submittedAt: string | null;
      scorePercent: number | null;
      strikes: number;
      lastEventType: string | null;
      events: Array<{
        eventType: string;
        addedStrikes: number;
        totalStrikesAfter: number;
        createdAt: string;
      }>;
      adminActions: Array<{
        actionType: string;
        adminIdentity: string;
        metadata: unknown;
        createdAt: string;
      }>;
    }>;
  };
}

export interface ExamRuntimeErrorResponse {
  ok: false;
  error: {
    code:
      | AuthErrorResponse["error"]["code"]
      | "INVALID_QUESTION"
      | "NO_QUESTIONS_CONFIGURED"
      | "SUBMISSION_NOT_ALLOWED"
      | "INVALID_EVENT"
      | "FORBIDDEN";
    message: string;
  };
}
