export interface CandidateLoginRequestBody {
  examId?: string;
  examAccessCode?: string;
  candidateId?: string;
  surname?: string;
}

export interface CandidateLoginSuccessResponse {
  ok: true;
  data: {
    sessionId: string;
    sessionToken: string;
    examId: string;
    candidateId: string;
    candidateName: string;
    expiresAt: string;
    sessionPolicy: "BlockNew" | "KickOld";
  };
}

export interface CandidateSessionValidationRequestBody {
  sessionToken?: string;
  examId?: string;
}

export interface CandidateSessionValidationSuccessResponse {
  ok: true;
  data: {
    sessionId: string;
    examId: string;
    candidateId: string;
    candidateName: string;
    expiresAt: string;
  };
}

export interface AuthErrorResponse {
  ok: false;
  error: {
    code:
      | "INVALID_REQUEST"
      | "EXAM_NOT_FOUND"
      | "EXAM_CLOSED"
      | "RATE_LIMITED"
      | "INVALID_CREDENTIALS"
      | "ACTIVE_SESSION_EXISTS"
      | "SESSION_NOT_FOUND"
      | "SESSION_REVOKED"
      | "SESSION_EXPIRED"
      | "SERVICE_UNAVAILABLE";
    message: string;
    retryAfterSeconds?: number;
  };
}
