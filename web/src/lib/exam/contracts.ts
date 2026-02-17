import type { AuthErrorResponse } from "@/lib/auth/contracts";

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

export interface ExamRuntimeErrorResponse {
  ok: false;
  error: {
    code:
      | AuthErrorResponse["error"]["code"]
      | "INVALID_QUESTION"
      | "NO_QUESTIONS_CONFIGURED"
      | "SUBMISSION_NOT_ALLOWED";
    message: string;
  };
}
