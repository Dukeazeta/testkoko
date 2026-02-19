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
    scorePercent: number;
    correctAnswers: number;
    totalQuestions: number;
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
  const [examAccessCode, setExamAccessCode] = useState("MTH101-FEB26");
  const [candidateId, setCandidateId] = useState("MAT-00123");
  const [surname, setSurname] = useState("Adebayo");

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
  const [flash, setFlash] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmitSuccess["data"] | null>(null);
  const [activeQuestion, setActiveQuestion] = useState(0);

  const pendingAnswersRef = useRef<Map<string, string>>(new Map());
  const hiddenAtRef = useRef<number | null>(null);

  const isInExam = Boolean(sessionToken && examId && !receipt);

  const activeQuestionData = useMemo(() => {
    return questions[activeQuestion] ?? null;
  }, [activeQuestion, questions]);

  useEffect(() => {
    if (!isInExam) {
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isInExam]);

  useEffect(() => {
    if (!isInExam || !examId || !sessionToken) {
      return;
    }

    const flushAutosave = async () => {
      const entries = Array.from(pendingAnswersRef.current.entries());
      if (entries.length === 0) {
        return;
      }

      for (const [questionId, selectedOption] of entries) {
        const response = await fetch("/api/exam/autosave", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            examId,
            sessionToken,
            questionId,
            selectedOption,
          }),
        });

        if (response.ok) {
          pendingAnswersRef.current.delete(questionId);
        }
      }
    };

    const interval = setInterval(() => {
      void flushAutosave();
    }, 4000);

    return () => clearInterval(interval);
  }, [examId, isInExam, sessionToken]);

  useEffect(() => {
    if (!isInExam || !examId || !sessionToken) {
      return;
    }

    const sendEvent = async (eventType: string, hiddenDurationSeconds?: number) => {
      await fetch("/api/exam/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examId,
          sessionToken,
          eventType,
          hiddenDurationSeconds,
        }),
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
      data.data.questions.reduce<Record<string, string>>((accumulator, question) => {
        if (question.selectedOption) {
          accumulator[question.questionId] = question.selectedOption;
        }

        return accumulator;
      }, {}),
    );
    setActiveQuestion(0);
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSigningIn(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examAccessCode,
          candidateId,
          surname,
        }),
      });

      const data = (await response.json()) as LoginSuccess | ApiError;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Login failed" : data.error.message);
      }

      setSessionToken(data.data.sessionToken);
      setExamId(data.data.examId);
      setCandidateName(data.data.candidateName);
      await loadRuntime(data.data.examId, data.data.sessionToken);
      setFlash("Signed in. Autosave runs every 4 seconds.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to sign in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const chooseOption = (questionId: string, option: string) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: option,
    }));
    pendingAnswersRef.current.set(questionId, option);
    setFlash("Answer captured locally and queued for autosave.");
  };

  const submitNow = async () => {
    if (!sessionToken || !examId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFlash(null);

    try {
      for (const [questionId, selectedOption] of pendingAnswersRef.current.entries()) {
        await fetch("/api/exam/autosave", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            examId,
            sessionToken,
            questionId,
            selectedOption,
          }),
        });
      }

      pendingAnswersRef.current.clear();

      const response = await fetch("/api/exam/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examId,
          sessionToken,
          mode: "manual",
        }),
      });

      const data = (await response.json()) as SubmitSuccess | ApiError;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? "Submission failed" : data.error.message);
      }

      setReceipt(data.data);
      setFlash(data.data.alreadySubmitted ? "Submission already existed." : "Submitted successfully.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const mm = Math.floor(timeRemaining / 60)
    .toString()
    .padStart(2, "0");
  const ss = (timeRemaining % 60).toString().padStart(2, "0");

  return (
    <div className="min-h-screen bg-neutral-50 py-6 md:py-10">
      <main className="ui-shell max-w-6xl">
        <div className="mb-4 flex items-center justify-between text-sm text-neutral-600">
          <Link href="/" className="hover:text-black">
            Back to home
          </Link>
          <span className="ui-kicker">Candidate Console</span>
        </div>

        <section className="ui-card overflow-hidden">
          <div className="border-b border-neutral-200 px-5 py-4 md:px-7">
            <p className="ui-kicker">Exam session</p>
            <h1 className="font-heading mt-1 text-2xl font-semibold md:text-3xl">Take Exam</h1>
            <p className="mt-1 text-sm text-neutral-600">Sign in, answer questions, and submit once complete.</p>
          </div>

          <div className="p-5 md:p-7">
            {!sessionToken || !examId ? (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={signIn}>
                <label>
                  <span className="ui-label">Exam Access Code</span>
                  <input className="ui-input" value={examAccessCode} onChange={(event) => setExamAccessCode(event.target.value)} required />
                </label>

                <label>
                  <span className="ui-label">Candidate ID</span>
                  <input className="ui-input" value={candidateId} onChange={(event) => setCandidateId(event.target.value)} required />
                </label>

                <label className="md:col-span-2">
                  <span className="ui-label">Surname</span>
                  <input className="ui-input" value={surname} onChange={(event) => setSurname(event.target.value)} required />
                </label>

                <button className="ui-btn-primary md:col-span-2" type="submit" disabled={isSigningIn}>
                  {isSigningIn ? "Signing in..." : "Start Session"}
                </button>
              </form>
            ) : receipt ? (
              <div className="ui-muted-card p-5">
                <p className="ui-kicker">Submission complete</p>
                <h2 className="font-heading mt-2 text-2xl font-semibold">Receipt {receipt.receiptId}</h2>
                <p className="mt-3 text-sm text-neutral-700">
                  Score: {receipt.scorePercent}% ({receipt.correctAnswers}/{receipt.totalQuestions})
                </p>
                <p className="mt-1 text-sm text-neutral-700">Submitted at {new Date(receipt.submittedAt).toLocaleString()}</p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[270px_1fr]">
                <aside className="ui-muted-card p-4">
                  <p className="ui-label">Candidate</p>
                  <p className="font-heading text-lg font-semibold">{candidateName}</p>
                  <p className="text-sm text-neutral-600">{examTitle}</p>

                  <div className="mt-4 rounded-xl border border-neutral-300 bg-white p-3">
                    <p className="ui-kicker">Time Remaining</p>
                    <p className="font-heading mt-1 text-3xl font-semibold">
                      {mm}:{ss}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {questions.map((question, index) => {
                      const isActive = activeQuestion === index;
                      const isAnswered = Boolean(answers[question.questionId]);
                      return (
                        <button
                          key={question.questionId}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                            isActive
                              ? "border-black bg-black text-white"
                              : isAnswered
                                ? "border-neutral-400 bg-neutral-100 text-black"
                                : "border-neutral-300 bg-white text-neutral-700"
                          }`}
                          onClick={() => setActiveQuestion(index)}
                          type="button"
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>

                  <button className="ui-btn-primary mt-5 w-full" onClick={() => void submitNow()} type="button" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Submit Exam"}
                  </button>
                </aside>

                <section className="ui-card p-5">
                  {activeQuestionData ? (
                    <>
                      <p className="ui-kicker">Question {activeQuestionData.orderIndex}</p>
                      <h2 className="font-heading mt-2 text-xl font-semibold leading-8">{activeQuestionData.prompt}</h2>

                      <div className="mt-5 grid gap-3">
                        {activeQuestionData.options.map((option) => (
                          <button
                            className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                              answers[activeQuestionData.questionId] === option
                                ? "border-black bg-black text-white"
                                : "border-neutral-300 bg-white text-black hover:border-neutral-500"
                            }`}
                            key={option}
                            onClick={() => chooseOption(activeQuestionData.questionId, option)}
                            type="button"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-600">No question loaded.</p>
                  )}
                </section>
              </div>
            )}

            {flash ? <p className="mt-4 text-sm text-neutral-700">{flash}</p> : null}
            {error ? <p className="mt-3 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-black">{error}</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
