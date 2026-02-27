"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ApiError = { ok: false; error: { code: string; message: string } };

type LoginSuccess = {
  ok: true;
  data: {
    sessionId: string;
    sessionToken: string;
    examId: string;
    candidateId: string;
    candidateName: string;
    expiresAt: string;
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

type EventResponse = {
  ok: true;
  data: {
    action: "none" | "warning" | "temporary_lock" | "auto_submit";
    totalStrikes: number;
    addedStrikes: number;
    autoSubmitted: boolean;
  };
};

type ExamQuestion = RuntimeSuccess["data"]["questions"][number];

function formatTime(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CandidateExamPage() {
  const params = useParams<{ examAccessCode: string }>();
  const rawCode = params.examAccessCode ?? "";
  const examAccessCode = decodeURIComponent(rawCode).trim().toUpperCase();

  const [candidateId, setCandidateId] = useState("");
  const [surname, setSurname] = useState("");

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [examId, setExamId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeQuestion, setActiveQuestion] = useState(0);

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ receiptId: string; submittedAt: string } | null>(null);

  const pendingAnswersRef = useRef<Map<string, string>>(new Map());
  const hiddenAtRef = useRef<number | null>(null);
  const timeoutSubmitRef = useRef(false);

  const isInExam = Boolean(sessionToken && examId && !receipt);
  const activeQuestionData = useMemo(() => questions[activeQuestion] ?? null, [activeQuestion, questions]);
  const answeredCount = Object.keys(answers).length;

  const flushPendingAnswers = useCallback(async () => {
    if (!examId || !sessionToken) {
      return;
    }

    const entries = Array.from(pendingAnswersRef.current.entries());
    if (entries.length === 0) {
      return;
    }

    for (const [questionId, selectedOption] of entries) {
      const response = await fetch("/api/exam/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, sessionToken, questionId, selectedOption }),
      });

      if (response.ok) {
        pendingAnswersRef.current.delete(questionId);
      }
    }
  }, [examId, sessionToken]);

  const submitExam = useCallback(
    async (mode: "manual" | "timeout") => {
      if (!examId || !sessionToken) {
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await flushPendingAnswers();

        const response = await fetch("/api/exam/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId, sessionToken, mode }),
        });

        const data = (await response.json()) as SubmitSuccess | ApiError;
        if (!response.ok || !data.ok) {
          throw new Error(data.ok ? "Submission failed." : data.error.message);
        }

        setReceipt({
          receiptId: data.data.receiptId,
          submittedAt: data.data.submittedAt,
        });
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Submission failed.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [examId, sessionToken, flushPendingAnswers],
  );

  const loadRuntime = useCallback(async (runtimeExamId: string, runtimeToken: string) => {
    const response = await fetch(
      `/api/exam/runtime?examId=${encodeURIComponent(runtimeExamId)}&sessionToken=${encodeURIComponent(runtimeToken)}`,
    );

    const data = (await response.json()) as RuntimeSuccess | ApiError;
    if (!response.ok || !data.ok) {
      throw new Error(data.ok ? "Runtime error." : data.error.message);
    }

    setExamTitle(data.data.title);
    setTimeRemaining(data.data.timeRemainingSeconds);
    setQuestions(data.data.questions);
    setAnswers(
      data.data.questions.reduce<Record<string, string>>((acc, question) => {
        if (question.selectedOption) {
          acc[question.questionId] = question.selectedOption;
        }
        return acc;
      }, {}),
    );
    setActiveQuestion(0);
    timeoutSubmitRef.current = false;
  }, []);

  const sendEvent = useCallback(
    async (eventType: string, hiddenDurationSeconds?: number) => {
      if (!examId || !sessionToken || !isInExam) {
        return;
      }

      try {
        const response = await fetch("/api/exam/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId,
            sessionToken,
            eventType,
            hiddenDurationSeconds,
          }),
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as EventResponse;
        if (data.ok && data.data.action !== "none") {
          if (data.data.action === "warning") {
            setNotice(`System Warning: Leave tab policy violated. Strikes: ${data.data.totalStrikes}.`);
            setTimeout(() => setNotice(null), 5000);
          }
          if (data.data.action === "temporary_lock") {
            setNotice(`Session Brief Lock: Leave tab policy violated. Strikes: ${data.data.totalStrikes}.`);
            setTimeout(() => setNotice(null), 5000);
          }
          if (data.data.action === "auto_submit" || data.data.autoSubmitted) {
            setNotice("Session Terminated: Maximum violations reached.");
            await submitExam("timeout");
          }
        }
      } catch {
        // Ignore transient network issues.
      }
    },
    [examId, sessionToken, isInExam, submitExam],
  );

  useEffect(() => {
    if (!isInExam) {
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((value) => (value > 0 ? value - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isInExam]);

  useEffect(() => {
    if (!isInExam) {
      return;
    }

    const interval = setInterval(() => {
      void flushPendingAnswers();
    }, 4000);

    return () => clearInterval(interval);
  }, [isInExam, flushPendingAnswers]);

  useEffect(() => {
    if (!isInExam) {
      return;
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (hiddenAt) {
        const hiddenDurationSeconds = Math.max(0, Math.floor((Date.now() - hiddenAt) / 1000));
        void sendEvent("visibility_hidden", hiddenDurationSeconds);
      }

      void sendEvent("visibility_visible");
    };

    const onOffline = () => {
      void sendEvent("disconnect");
    };

    const onOnline = () => {
      void sendEvent("reconnect");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [isInExam, sendEvent]);

  useEffect(() => {
    if (!isInExam || isSubmitting || timeRemaining > 0 || timeoutSubmitRef.current) {
      return;
    }

    timeoutSubmitRef.current = true;
    void submitExam("timeout");
  }, [isInExam, isSubmitting, submitExam, timeRemaining]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!examAccessCode) {
      setError("Invalid exam link.");
      return;
    }

    setIsSigningIn(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examAccessCode,
          candidateId,
          surname,
        }),
      });

      const data = (await response.json()) as LoginSuccess | ApiError;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Login failed." : data.error.message);
      }

      setSessionToken(data.data.sessionToken);
      setExamId(data.data.examId);
      setCandidateName(data.data.candidateName);

      await loadRuntime(data.data.examId, data.data.sessionToken);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not sign in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const chooseOption = (questionId: string, option: string) => {
    setAnswers((current) => ({ ...current, [questionId]: option }));
    pendingAnswersRef.current.set(questionId, option);
  };


  // ---------------------------------------------------------------------------
  // RENDER - LOGIN
  // ---------------------------------------------------------------------------
  if (!sessionToken || !examId) {
    return (
      <div className="page justify-center fade-in">
        <main className="shell relative z-10">
          <section className="bg-white border border-zinc-200 p-8 md:p-12 rounded-[2rem] max-w-[460px] mx-auto shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] stagger-1">
            <div className="stack gap-8">
              <div className="text-center stack gap-2 items-center">
                <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shadow-inner mb-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                </div>
                <h1 className="text-2xl tracking-tight font-semibold text-zinc-950">Candidate Access</h1>
                <p className="muted text-sm px-4">Enter your identification details exactly as registered.</p>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-xl flex items-center justify-between shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Target Session</span>
                <span className="text-sm font-bold tracking-widest text-blue-600 font-mono">{examAccessCode || "Invalid"}</span>
              </div>

              {error ? <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">{error}</div> : null}

              <form className="stack gap-5" onSubmit={handleSignIn}>
                <div className="stack gap-1.5">
                  <label className="label">Candidate ID</label>
                  <input
                    className="field uppercase"
                    value={candidateId}
                    onChange={(event) => setCandidateId(event.target.value)}
                    placeholder="e.g. MAT-00123"
                    required
                  />
                </div>

                <div className="stack gap-1.5">
                  <label className="label">Surname</label>
                  <input
                    className="field"
                    value={surname}
                    onChange={(event) => setSurname(event.target.value)}
                    placeholder="e.g. Adebayo"
                    required
                  />
                </div>

                <button className="btn btn-primary w-full mt-2" disabled={isSigningIn || !examAccessCode} type="submit">
                  {isSigningIn ? "Authenticating..." : "Begin Examination"}
                </button>
              </form>

              <div className="pt-4 border-t border-zinc-100 text-center">
                <Link href="/" className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors">
                  Return to homepage
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER - SUBMITTED
  // ---------------------------------------------------------------------------
  if (receipt) {
    return (
      <div className="page justify-center fade-in">
        <main className="shell relative z-10 flex justify-center">
          <section className="bg-white border border-emerald-200 p-8 md:p-12 rounded-[2rem] max-w-lg w-full shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] stagger-1 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>

            <h1 className="text-3xl tracking-tight font-medium text-zinc-950 mb-2">Examination Captured</h1>
            <p className="text-zinc-500 mb-8">Your responses have been successfully recorded in the centralized server.</p>

            <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-[1.5rem] w-full mb-8 text-left stack gap-4">
              <div>
                <p className="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-1">Receipt ID</p>
                <p className="font-mono text-zinc-900 font-medium">{receipt.receiptId}</p>
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-1">Timestamp</p>
                <p className="text-zinc-900 font-medium">
                  {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(receipt.submittedAt))}
                </p>
              </div>
            </div>

            <Link href="/" className="btn btn-secondary w-full">
              Close and Exit
            </Link>
          </section>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER - EXAM RUNTIME
  // ---------------------------------------------------------------------------
  return (
    <div className="page bg-white selection:bg-blue-100 selection:text-blue-900">

      {/* Absolute top toast for notices/warnings */}
      {notice ? (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          {notice}
        </div>
      ) : null}

      <main className="shell flex flex-col h-[100dvh]">
        {/* Sleek Header */}
        <header className="py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-100 shrink-0">
          <div className="flex gap-4 items-center">
            <div className="w-10 h-10 border border-zinc-200 rounded-[10px] flex items-center justify-center font-bold text-zinc-950 text-xs shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
              TK
            </div>
            <div>
              <h1 className="text-lg tracking-tight font-medium text-zinc-950">{examTitle}</h1>
              <p className="text-xs font-mono text-zinc-500 mt-0.5">{candidateId} • {candidateName}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-xl flex items-center gap-2 font-mono text-lg tracking-tight font-medium ${timeRemaining < 300 ? 'bg-rose-50 text-rose-600' : 'bg-zinc-50 border border-zinc-200 text-zinc-900 shadow-sm'}`}>
              {timeRemaining < 300 ? (
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              ) : (
                <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              )}
              {formatTime(timeRemaining)}
            </div>
            <button className="btn btn-primary" disabled={isSubmitting} onClick={() => void submitExam("manual")}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span></span> Submitting
                </span>
              ) : "Finish Exam"}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <section className="flex flex-col-reverse lg:flex-row gap-8 py-8 flex-1 min-h-0">

          {/* Main Question Panel */}
          <article className="flex-1 overflow-y-auto px-2 lg:px-8 pb-10 custom-scrollbar">

            <div className="flex items-center gap-3 mb-8">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded w-max">Question {activeQuestion + 1}</span>
              <span className="text-sm text-zinc-400 font-medium">/ {questions.length}</span>
            </div>

            {activeQuestionData ? (
              <div className="flex flex-col gap-10 max-w-3xl">
                <h2 className="text-3xl md:text-4xl tracking-tight leading-[1.3] font-medium text-zinc-950">
                  {activeQuestionData.prompt}
                </h2>

                <div className="flex flex-col gap-4">
                  {activeQuestionData.options.map((option, index) => {
                    const selected = answers[activeQuestionData.questionId] === option;

                    return (
                      <button
                        className={`group relative text-left w-full p-5 md:p-6 rounded-[1.25rem] border text-lg transition-all duration-200 overflow-hidden ${selected
                            ? "border-transparent bg-zinc-950 text-white shadow-lg"
                            : "border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-md text-zinc-900"
                          }`}
                        key={`option-${index}`}
                        onClick={() => chooseOption(activeQuestionData.questionId, option)}
                      >
                        {/* Option Letter Indicator */}
                        <div className={`absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center border-r transition-colors ${selected ? 'border-zinc-800 text-zinc-400 font-bold' : 'border-zinc-100 text-zinc-300 font-medium group-hover:border-zinc-200 group-hover:text-zinc-400'}`}>
                          {String.fromCharCode(65 + index)}
                        </div>
                        <div className="pl-12 opacity-90">{option}</div>

                        {/* Selection Checkmark */}
                        {selected && (
                          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-white">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-state border-none">Loading sequence...</div>
            )}
          </article>

          {/* Navigation Sidebar */}
          <aside className="lg:w-72 lg:border-l border-zinc-100 lg:pl-8 flex flex-col gap-6 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Navigation</p>
              <div className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">
                {answeredCount} / {questions.length} completed
              </div>
            </div>

            <div className="grid grid-cols-6 lg:grid-cols-4 gap-2.5">
              {questions.map((question, index) => {
                const answered = Boolean(answers[question.questionId]);
                const isActive = index === activeQuestion;

                return (
                  <button
                    className={`h-11 rounded-xl text-sm font-semibold transition-all relative overflow-hidden ${isActive
                        ? "bg-zinc-950 text-white shadow-md scale-105"
                        : answered
                          ? "bg-white border-2 border-emerald-500 text-emerald-700 shadow-sm"
                          : "bg-zinc-50 border border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-800"
                      }`}
                    key={question.questionId}
                    onClick={() => setActiveQuestion(index)}
                    title={answered ? "Completed" : "Pending"}
                  >
                    {isActive && answered && <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-bl-lg"></div>}
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto hidden lg:block bg-zinc-50 rounded-[1.5rem] p-6 border border-zinc-100">
              <svg className="w-6 h-6 text-zinc-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                Auto-save is active. Do not leave this tab or minimize the browser, as it will be recorded as a violation stroke.
              </p>
            </div>
          </aside>

        </section>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #e4e4e7;
            border-radius: 20px;
        }
      `}</style>
    </div>
  );
}
