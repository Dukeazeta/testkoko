"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type LoginSuccess = {
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
};

type RuntimeSuccess = {
  ok: true;
  data: {
    sessionId: string;
    examId: string;
    candidateId: string;
    candidateName: string;
    title: string;
    timeRemainingSeconds: number;
    questions: Array<{
      questionId: string;
      orderIndex: number;
      prompt: string;
      options: string[];
      selectedOption: string | null;
      savedAt: string | null;
    }>;
  };
};

type SubmitSuccess = {
  ok: true;
  data: {
    receiptId: string;
    submittedAt: string;
    alreadySubmitted: boolean;
  };
};

type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type ExamQuestion = RuntimeSuccess["data"]["questions"][number];

export default function CandidatePage() {
  const [examAccessCode, setExamAccessCode] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [surname, setSurname] = useState("");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [examId, setExamId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string>("");
  const [examTitle, setExamTitle] = useState<string>("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<SubmitSuccess["data"] | null>(null);
  const [activeQuestion, setActiveQuestion] = useState(0);

  const pendingAnswersRef = useRef<Map<string, string>>(new Map());
  const hiddenAtRef = useRef<number | null>(null);

  const isInExam = Boolean(sessionToken && examId && !receipt);

  const activeQuestionData = useMemo(() => {
    return questions[activeQuestion] ?? null;
  }, [activeQuestion, questions]);

  useEffect(() => {
    if (!isInExam) return;
    const timer = setInterval(() => {
      setTimeRemaining((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isInExam]);

  useEffect(() => {
    if (!isInExam || !examId || !sessionToken) return;
    const flushAutosave = async () => {
      const entries = Array.from(pendingAnswersRef.current.entries());
      if (entries.length === 0) return;
      for (const [questionId, selectedOption] of entries) {
        const response = await fetch("/api/exam/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId, sessionToken, questionId, selectedOption }),
        });
        if (response.ok) pendingAnswersRef.current.delete(questionId);
      }
    };
    const interval = setInterval(() => { void flushAutosave(); }, 4000);
    return () => clearInterval(interval);
  }, [examId, isInExam, sessionToken]);

  useEffect(() => {
    if (!isInExam || !examId || !sessionToken) return;
    const sendEvent = async (eventType: string, hiddenDurationSeconds?: number) => {
      await fetch("/api/exam/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, sessionToken, eventType, hiddenDurationSeconds }),
      });
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt) {
        const durationSeconds = Math.max(0, Math.floor((Date.now() - hiddenAt) / 1000));
        void sendEvent("visibility_hidden", durationSeconds);
      }
      void sendEvent("visibility_visible");
    };
    const onOffline = () => void sendEvent("disconnect");
    const onOnline = () => void sendEvent("reconnect");
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [examId, isInExam, sessionToken]);

  const loadRuntime = async (runtimeExamId: string, runtimeToken: string) => {
    const response = await fetch(
      `/api/exam/runtime?examId=${encodeURIComponent(runtimeExamId)}&sessionToken=${encodeURIComponent(runtimeToken)}`,
    );
    const data = (await response.json()) as RuntimeSuccess | ApiError;
    if (!response.ok || !data.ok) {
      throw new Error(data.ok ? "Runtime failed" : data.error.message);
    }
    setExamTitle(data.data.title);
    setTimeRemaining(data.data.timeRemainingSeconds);
    setQuestions(data.data.questions);
    setAnswers(
      data.data.questions.reduce<Record<string, string>>((acc, q) => {
        if (q.selectedOption) acc[q.questionId] = q.selectedOption;
        return acc;
      }, {}),
    );
    setActiveQuestion(0);
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSigningIn(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examAccessCode, candidateId, surname }),
      });
      const data = (await response.json()) as LoginSuccess | ApiError;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Login failed" : data.error.message);
      }
      setSessionToken(data.data.sessionToken);
      setExamId(data.data.examId);
      setCandidateName(data.data.candidateName);
      await loadRuntime(data.data.examId, data.data.sessionToken);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to sign in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const chooseOption = (questionId: string, option: string) => {
    setAnswers((current) => ({ ...current, [questionId]: option }));
    pendingAnswersRef.current.set(questionId, option);
  };

  const submitNow = async () => {
    if (!sessionToken || !examId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      for (const [questionId, selectedOption] of pendingAnswersRef.current.entries()) {
        await fetch("/api/exam/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId, sessionToken, questionId, selectedOption }),
        });
      }
      pendingAnswersRef.current.clear();
      const response = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, sessionToken, mode: "manual" }),
      });
      const data = (await response.json()) as SubmitSuccess | ApiError;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Submission failed" : data.error.message);
      }
      setReceipt(data.data);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const mm = Math.floor(timeRemaining / 60).toString().padStart(2, "0");
  const ss = (timeRemaining % 60).toString().padStart(2, "0");
  const answeredCount = Object.keys(answers).length;

  // ── Sign-in view ──
  if (!sessionToken || !examId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md animate-in">
          <div className="mb-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center bg-[var(--black)] font-mono text-[10px] font-bold text-[var(--accent)]">
              TK
            </div>
            <h1 className="font-display mt-5 text-3xl font-bold tracking-tight">
              Enter Exam
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Sign in with your credentials to begin.
            </p>
          </div>

          {error && (
            <div className="mb-5 border-l-3 border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={signIn}>
            <div>
              <label className="ui-label">Exam Access Code</label>
              <input
                className="ui-input"
                value={examAccessCode}
                onChange={(e) => setExamAccessCode(e.target.value)}
                placeholder="e.g. MTH101-FEB26"
                required
              />
            </div>
            <div>
              <label className="ui-label">Candidate ID</label>
              <input
                className="ui-input"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                placeholder="e.g. MAT-00123"
                required
              />
            </div>
            <div>
              <label className="ui-label">Surname</label>
              <input
                className="ui-input"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="Your surname"
                required
              />
            </div>
            <button
              className="w-full bg-[var(--black)] py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
              type="submit"
              disabled={isSigningIn}
            >
              {isSigningIn ? "Signing in..." : "Start Session"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="font-mono text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Receipt view ──
  if (receipt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-sm text-center animate-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center bg-[var(--accent)]">
            <svg className="h-8 w-8 text-[var(--black)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display mt-6 text-2xl font-bold">
            Exam Submitted
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Your answers have been recorded successfully.
          </p>
          <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-soft)]">
              Receipt
            </p>
            <p className="mt-1 font-mono text-sm font-semibold">
              {receipt.receiptId}
            </p>
            <p className="mt-2 font-mono text-xs text-[var(--text-soft)]">
              {new Date(receipt.submittedAt).toLocaleString()}
            </p>
          </div>
          <Link
            href="/"
            className="mt-8 inline-block font-mono text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  // ── Exam view ──
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
        <div className="ui-shell flex h-12 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center bg-[var(--black)] font-mono text-[8px] font-bold text-[var(--accent)]">
              TK
            </div>
            <span className="font-display text-sm font-bold tracking-tight">{examTitle}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-[var(--text-soft)]">{candidateName}</span>
            <div className="flex items-center gap-1.5 bg-[var(--black)] px-3 py-1">
              <span className="font-mono text-xs font-bold text-[var(--accent)]">
                {mm}:{ss}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="ui-shell max-w-5xl py-6 md:py-8">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* ── Sidebar ── */}
          <aside>
            <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="ui-kicker">Progress</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {answeredCount}/{questions.length}
              </p>

              {/* Progress bar */}
              <div className="mt-3 h-1 w-full bg-[var(--bg-deep)]">
                <div
                  className="h-full bg-[var(--black)] transition-all duration-300"
                  style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {questions.map((question, index) => {
                  const isActive = activeQuestion === index;
                  const isAnswered = Boolean(answers[question.questionId]);
                  return (
                    <button
                      key={question.questionId}
                      className={`flex h-8 items-center justify-center font-mono text-xs font-semibold transition-colors ${isActive
                          ? "bg-[var(--black)] text-[var(--accent)]"
                          : isAnswered
                            ? "bg-[var(--bg-deep)] text-[var(--text)]"
                            : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)]"
                        }`}
                      onClick={() => setActiveQuestion(index)}
                      type="button"
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              className="mt-3 w-full bg-[var(--danger)] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-[var(--danger-hover)] disabled:opacity-40 transition-colors"
              onClick={() => {
                if (window.confirm("Are you sure you want to submit? You cannot change your answers after submission.")) {
                  void submitNow();
                }
              }}
              type="button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Exam"}
            </button>
          </aside>

          {/* ── Question area ── */}
          <section className="border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
            {activeQuestionData ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="ui-kicker">
                    Question {activeQuestionData.orderIndex}
                  </p>
                  <span className="font-mono text-xs text-[var(--text-soft)]">
                    {activeQuestion + 1} of {questions.length}
                  </span>
                </div>

                <h2 className="font-display mt-4 text-xl font-bold leading-8">
                  {activeQuestionData.prompt}
                </h2>

                <div className="mt-6 space-y-2">
                  {activeQuestionData.options.map((option, idx) => {
                    const isSelected = answers[activeQuestionData.questionId] === option;
                    const letter = String.fromCharCode(65 + idx);
                    return (
                      <button
                        className={`flex w-full items-start gap-3 border p-4 text-left text-sm transition-colors ${isSelected
                            ? "border-[var(--black)] bg-[var(--black)] text-white"
                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)]"
                          }`}
                        key={option}
                        onClick={() => chooseOption(activeQuestionData.questionId, option)}
                        type="button"
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center font-mono text-xs font-bold ${isSelected
                            ? "bg-[var(--accent)] text-[var(--black)]"
                            : "bg-[var(--bg-deep)] text-[var(--text-muted)]"
                          }`}>
                          {letter}
                        </span>
                        <span className="pt-0.5">{option}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-5">
                  <button
                    type="button"
                    onClick={() => setActiveQuestion((i) => Math.max(0, i - 1))}
                    disabled={activeQuestion === 0}
                    className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-25 transition-colors"
                  >
                    ← Prev
                  </button>
                  {activeQuestion < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setActiveQuestion((i) => Math.min(questions.length - 1, i + 1))}
                      className="bg-[var(--black)] px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] hover:bg-[#1a1a1a] transition-colors"
                    >
                      Next →
                    </button>
                  ) : (
                    <span className="font-mono text-xs text-[var(--text-soft)]">Last question</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No question loaded.</p>
            )}
          </section>
        </div>

        {error && (
          <div className="mt-4 border-l-3 border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
