"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

interface ExamSummary {
  examId: string;
  accessCode: string;
  title: string;
  startsAt: string;
  endsAt: string;
  candidateCount: number;
  questionCount: number;
  createdAt: string;
}

interface MonitoringData {
  examId: string;
  title: string;
  activeCount: number;
  disconnectedCount: number;
  flaggedCount: number;
  submittedCount: number;
  candidates: Array<{
    sessionId: string;
    candidateId: string;
    candidateName: string;
    status: "Active" | "Disconnected" | "Flagged" | "Submitted";
    strikes: number;
    lastEventType: string | null;
    submittedAt: string | null;
  }>;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

type View = "auth" | "signup" | "dashboard" | "create" | "monitoring";

export default function LecturerPage() {
  const { data: session, status } = useSession();
  const [view, setView] = useState<View>("auth");
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [monitoring, setMonitoring] = useState<MonitoringData | null>(null);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");

  const [examTitle, setExamTitle] = useState("");
  const [examCode, setExamCode] = useState("");
  const [examStartsAt, setExamStartsAt] = useState("");
  const [examEndsAt, setExamEndsAt] = useState("");
  const [rosterCsv, setRosterCsv] = useState("");
  const [rosterExamId, setRosterExamId] = useState("");
  const [rosterResult, setRosterResult] = useState("");

  const [questions, setQuestions] = useState<Array<{
    prompt: string;
    options: string[];
    correctOption: string;
  }>>([]);

  const loadExams = useCallback(async () => {
    try {
      const res = await fetch("/api/lecturer/exams");
      const json: ApiResult<{ exams: ExamSummary[] }> = await res.json();
      if (json.ok) setExams(json.data.exams);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (status === "authenticated") { setView("dashboard"); loadExams(); }
    else if (status === "unauthenticated") { setView("auth"); }
  }, [status, loadExams]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", { email: authEmail, password: authPassword, redirect: false });
    setLoading(false);
    if (result?.error) setError("Invalid email or password.");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/lecturer/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: authName, email: authEmail, password: authPassword }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error?.message || "Signup failed."); setLoading(false); return; }
      const result = await signIn("credentials", { email: authEmail, password: authPassword, redirect: false });
      setLoading(false);
      if (result?.error) { setError("Account created but sign-in failed. Try signing in manually."); setView("auth"); }
    } catch { setError("Network error."); setLoading(false); }
  }

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/lecturer/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: examTitle,
          accessCode: examCode,
          startsAt: new Date(examStartsAt).toISOString(),
          endsAt: new Date(examEndsAt).toISOString(),
          questions,
        }),
      });
      const json = await res.json();
      setLoading(false);
      if (!json.ok) { setError(json.error?.message || "Failed to create exam."); return; }
      setExamTitle(""); setExamCode(""); setExamStartsAt(""); setExamEndsAt(""); setQuestions([]);
      await loadExams();
      setView("dashboard");
    } catch { setError("Network error."); setLoading(false); }
  }

  async function handleUploadRoster(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setRosterResult("");
    if (!rosterExamId || !rosterCsv.trim()) { setError("Select an exam and paste CSV data."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/lecturer/exams/${rosterExamId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: rosterCsv }),
      });
      const json = await res.json();
      setLoading(false);
      if (!json.ok) { setError(json.error?.message || "Upload failed."); return; }
      setRosterResult(`Created: ${json.data.createdCount}, Updated: ${json.data.updatedCount}, Total: ${json.data.totalProcessed}`);
      setRosterCsv("");
      await loadExams();
    } catch { setError("Network error."); setLoading(false); }
  }

  function openMonitoring(examId: string) {
    setSelectedExamId(examId);
    setView("monitoring");
    fetchMonitoring(examId);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchMonitoring(examId), 5000);
  }

  async function fetchMonitoring(examId: string) {
    try {
      const res = await fetch(`/api/lecturer/exams/${examId}/monitoring`);
      const json: ApiResult<MonitoringData> = await res.json();
      if (json.ok) setMonitoring(json.data);
    } catch { /* silent */ }
  }

  async function downloadResults(examId: string) {
    const res = await fetch(`/api/lecturer/exams/${examId}/results`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${examId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function addQuestion() {
    setQuestions([...questions, { prompt: "", options: ["", "", "", ""], correctOption: "" }]);
  }

  function updateQuestion(index: number, field: string, value: string) {
    const updated = [...questions];
    if (field === "prompt") updated[index].prompt = value;
    else if (field === "correctOption") updated[index].correctOption = value;
    setQuestions(updated);
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  // Loading
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="font-mono text-sm text-[var(--text-soft)]">Loading...</p>
      </div>
    );
  }

  // ── Auth / Signup ──
  if (view === "auth" || view === "signup") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-sm animate-in">
          <div className="mb-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center bg-[var(--black)] font-mono text-[10px] font-bold text-[var(--accent)]">
              TK
            </div>
            <h1 className="font-display mt-5 text-2xl font-bold tracking-tight">
              {view === "signup" ? "Create Account" : "Lecturer Sign In"}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {view === "signup" ? "Sign up to create and manage exams." : "Sign in to manage your exams."}
            </p>
          </div>

          {error && (
            <div className="mb-5 border-l-3 border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <form onSubmit={view === "signup" ? handleSignUp : handleSignIn} className="space-y-4">
            {view === "signup" && (
              <div>
                <label className="ui-label">Full Name</label>
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="ui-input"
                  required
                />
              </div>
            )}
            <div>
              <label className="ui-label">Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="ui-input"
                required
              />
            </div>
            <div>
              <label className="ui-label">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="ui-input"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--black)] py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
            >
              {loading ? "Loading..." : view === "signup" ? "Create Account" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
            {view === "signup" ? (
              <>Already have an account?{" "}<button onClick={() => { setView("auth"); setError(""); }} className="font-semibold text-[var(--text)] underline underline-offset-2">Sign in</button></>
            ) : (
              <>Don&apos;t have an account?{" "}<button onClick={() => { setView("signup"); setError(""); }} className="font-semibold text-[var(--text)] underline underline-offset-2">Sign up</button></>
            )}
          </p>

          <div className="mt-4 text-center">
            <Link href="/" className="font-mono text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  if (view === "dashboard") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
          <div className="ui-shell flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center bg-[var(--black)] font-mono text-[8px] font-bold text-[var(--accent)]">TK</div>
              <span className="font-display text-sm font-bold tracking-tight">Dashboard</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[var(--text-soft)]">{session?.user?.name}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/admin" })}
                className="border border-[var(--border)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="ui-shell py-8">
          {error && (
            <div className="mb-6 border-l-3 border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 animate-in">
            <h1 className="font-display text-2xl font-bold tracking-tight">Your Exams</h1>
            <button
              onClick={() => { setView("create"); setError(""); }}
              className="bg-[var(--black)] px-5 py-2.5 text-[13px] font-bold uppercase tracking-wide text-[var(--accent)] hover:bg-[#1a1a1a] transition-colors"
            >
              + Create Exam
            </button>
          </div>

          {/* Roster upload */}
          <details className="mb-8 border border-[var(--border)] bg-[var(--surface)] animate-in delay-1">
            <summary className="cursor-pointer px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Upload Student Roster (CSV)
            </summary>
            <form onSubmit={handleUploadRoster} className="space-y-3 border-t border-[var(--border)] p-5">
              <div>
                <label className="ui-label">Select Exam</label>
                <select
                  value={rosterExamId}
                  onChange={(e) => setRosterExamId(e.target.value)}
                  className="ui-input"
                >
                  <option value="">-- Select --</option>
                  {exams.map((ex) => (
                    <option key={ex.examId} value={ex.examId}>
                      {ex.title} ({ex.accessCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ui-label">CSV Data</label>
                <textarea
                  value={rosterCsv}
                  onChange={(e) => setRosterCsv(e.target.value)}
                  rows={4}
                  placeholder={"candidateId,surname,displayName\nCSC/2020/001,Doe,John Doe"}
                  className="ui-input font-mono !h-auto p-3 text-xs"
                  style={{ minHeight: "100px" }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-[var(--black)] px-5 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
              >
                {loading ? "Uploading..." : "Upload Roster"}
              </button>
              {rosterResult && (
                <p className="font-mono text-xs text-[var(--success)]">{rosterResult}</p>
              )}
            </form>
          </details>

          {/* Exam list */}
          {exams.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] p-12 text-center animate-in delay-2">
              <p className="font-mono text-xs text-[var(--text-soft)]">No exams yet. Create your first exam to get started.</p>
            </div>
          ) : (
            <div className="space-y-2 animate-in delay-2">
              {exams.map((exam) => {
                const now = Date.now();
                const isActive = now >= new Date(exam.startsAt).getTime() && now <= new Date(exam.endsAt).getTime();
                const isEnded = now > new Date(exam.endsAt).getTime();

                return (
                  <div
                    key={exam.examId}
                    className="flex flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-sm font-bold">{exam.title}</h3>
                        {isActive && (
                          <span className="bg-[var(--accent)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--black)]">
                            Live
                          </span>
                        )}
                        {isEnded && (
                          <span className="bg-[var(--bg-deep)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--text-soft)]">
                            Ended
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-[var(--text-soft)]">
                        Code: <span className="font-semibold text-[var(--text)]">{exam.accessCode}</span>
                        {" · "}{exam.candidateCount} students{" · "}{exam.questionCount} questions
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--text-soft)]">
                        {new Date(exam.startsAt).toLocaleString()} — {new Date(exam.endsAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/candidate`;
                          const text = `Exam: ${exam.title}\nAccess Code: ${exam.accessCode}\nLink: ${url}\n\nUse the access code above to sign in.`;
                          navigator.clipboard.writeText(text).then(() => {
                            alert("Exam details copied to clipboard!");
                          });
                        }}
                        className="border border-[var(--border)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
                      >
                        Share
                      </button>
                      <button
                        onClick={() => openMonitoring(exam.examId)}
                        className="border border-[var(--border)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
                      >
                        Monitor
                      </button>
                      <button
                        onClick={() => downloadResults(exam.examId)}
                        className="border border-[var(--border)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
                      >
                        Export
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Create Exam ──
  if (view === "create") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
          <div className="ui-shell flex h-14 items-center gap-3">
            <button
              onClick={() => { setView("dashboard"); setError(""); }}
              className="font-mono text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
            >
              ← Back
            </button>
            <span className="font-display text-sm font-bold tracking-tight">Create Exam</span>
          </div>
        </header>

        <main className="ui-shell max-w-2xl py-8">
          {error && (
            <div className="mb-6 border-l-3 border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
          )}

          <form onSubmit={handleCreateExam} className="space-y-5 animate-in">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="ui-label">Exam Title</label>
                <input type="text" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} className="ui-input" required />
              </div>
              <div>
                <label className="ui-label">Access Code</label>
                <input type="text" value={examCode} onChange={(e) => setExamCode(e.target.value)} placeholder="e.g. MTH101" className="ui-input font-mono" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="ui-label">Starts At</label>
                <input type="datetime-local" value={examStartsAt} onChange={(e) => setExamStartsAt(e.target.value)} className="ui-input" required />
              </div>
              <div>
                <label className="ui-label">Ends At</label>
                <input type="datetime-local" value={examEndsAt} onChange={(e) => setExamEndsAt(e.target.value)} className="ui-input" required />
              </div>
            </div>

            {/* Questions */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="ui-label !mb-0">Questions ({questions.length})</label>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="border border-[var(--border)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
                >
                  + Add
                </button>
              </div>

              <div className="space-y-3">
                {questions.map((q, qi) => (
                  <div key={qi} className="border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-soft)]">Q{qi + 1}</span>
                      <button type="button" onClick={() => removeQuestion(qi)} className="font-mono text-[10px] text-[var(--danger)] hover:underline">
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={q.prompt}
                      onChange={(e) => updateQuestion(qi, "prompt", e.target.value)}
                      placeholder="Question prompt"
                      className="ui-input mb-3"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${qi}`}
                            checked={q.correctOption === opt && opt !== ""}
                            onChange={() => updateQuestion(qi, "correctOption", opt)}
                            className="h-3.5 w-3.5 accent-[var(--black)]"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="ui-input !h-9 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--black)] py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
            >
              {loading ? "Creating..." : "Create Exam"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  // ── Monitoring ──
  if (view === "monitoring" && monitoring) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
          <div className="ui-shell flex h-14 items-center gap-3">
            <button
              onClick={() => {
                setView("dashboard");
                setMonitoring(null);
                if (pollRef.current) clearInterval(pollRef.current);
              }}
              className="font-mono text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
            >
              ← Back
            </button>
            <span className="font-display text-sm font-bold tracking-tight">{monitoring.title}</span>
            <span className="bg-[var(--accent)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--black)]">
              Live
            </span>
          </div>
        </header>

        <main className="ui-shell py-8">
          <div className="mb-6 grid gap-px bg-[var(--border)] sm:grid-cols-4 animate-in">
            <StatCard label="Active" value={monitoring.activeCount} />
            <StatCard label="Flagged" value={monitoring.flaggedCount} accent />
            <StatCard label="Offline" value={monitoring.disconnectedCount} />
            <StatCard label="Submitted" value={monitoring.submittedCount} />
          </div>

          <div className="mb-4 flex items-center justify-between animate-in delay-1">
            <h2 className="font-display text-lg font-bold">Candidates</h2>
            <button
              onClick={() => downloadResults(selectedExamId)}
              className="border border-[var(--border)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto border border-[var(--border)] animate-in delay-2">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--bg-deep)]">
                <tr>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Student</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Matric No.</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Status</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Strikes</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Last Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {monitoring.candidates.map((c) => (
                  <tr key={c.sessionId} className="hover:bg-[var(--bg-deep)] transition-colors">
                    <td className="px-4 py-2.5 text-sm">{c.candidateName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.candidateId}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${c.status === "Active"
                            ? "bg-[var(--accent)] text-[var(--black)]"
                            : c.status === "Flagged"
                              ? "bg-[var(--danger)] text-white"
                              : c.status === "Submitted"
                                ? "bg-[var(--bg-deep)] text-[var(--text)]"
                                : "bg-[var(--bg-deep)] text-[var(--text-soft)]"
                          }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.strikes}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--text-soft)]">{c.lastEventType ?? "—"}</td>
                  </tr>
                ))}
                {monitoring.candidates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center font-mono text-xs text-[var(--text-soft)]">
                      No candidates have joined yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    );
  }

  return null;
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`p-5 ${accent ? "bg-[var(--black)]" : "bg-[var(--surface)]"}`}>
      <p className={`font-mono text-3xl font-bold ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
        {value}
      </p>
      <p className={`mt-1 font-mono text-[10px] uppercase tracking-wider ${accent ? "text-[var(--text-soft)]" : "text-[var(--text-soft)]"}`}>
        {label}
      </p>
    </div>
  );
}
