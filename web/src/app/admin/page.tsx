"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ExamSummary {
  examId: string;
  accessCode: string;
  title: string;
  startsAt: string;
  endsAt: string;
  candidateCount: number;
  questionCount: number;
}

interface MonitoringCandidate {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  status: "Active" | "Disconnected" | "Flagged" | "Submitted";
  strikes: number;
  lastEventType: string | null;
  submittedAt: string | null;
}

interface MonitoringData {
  examId: string;
  title: string;
  activeCount: number;
  disconnectedCount: number;
  flaggedCount: number;
  submittedCount: number;
  candidates: MonitoringCandidate[];
}

type View = "auth" | "dashboard" | "create" | "monitoring";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: MonitoringCandidate["status"]): string {
  if (status === "Flagged") return "status-chip border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Disconnected") return "status-chip border-rose-200 bg-rose-50 text-rose-800";
  if (status === "Submitted") return "status-chip border-emerald-200 bg-emerald-50 text-emerald-800";
  return "status-chip border-blue-200 bg-blue-50 text-blue-800";
}

export default function AdminPage() {
  const { data: session, status } = useSession();

  const [view, setView] = useState<View>("auth");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [monitoring, setMonitoring] = useState<MonitoringData | null>(null);

  const [newExamTitle, setNewExamTitle] = useState("");
  const [newExamCode, setNewExamCode] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearFeedback = () => {
    setError("");
    setNotice("");
  };

  const loadExams = useCallback(async () => {
    try {
      setLoading(true);
      clearFeedback();
      const res = await fetch("/api/lecturer/exams");
      const json = await res.json();

      if (json.ok) {
        setExams(json.data.exams);
        return;
      }

      if (res.status === 401) {
        await signOut({ redirect: false });
        setView("auth");
        return;
      }

      setError(json.error?.message || "Could not load exams.");
    } catch {
      setError("Could not load exams.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMonitoring = useCallback(async (examId: string) => {
    try {
      const res = await fetch(`/api/lecturer/exams/${examId}/monitoring`);
      const json = await res.json();
      if (json.ok) {
        setMonitoring(json.data);
      } else {
        setError(json.error?.message || "Could not load monitoring data.");
      }
    } catch {
      setError("Could not load monitoring data.");
    }
  }, []);

  const openMonitoring = async (examId: string) => {
    clearFeedback();
    setSelectedExamId(examId);
    setView("monitoring");
    await fetchMonitoring(examId);

    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(() => {
      void fetchMonitoring(examId);
    }, 4000);
  };

  const copyCandidateLink = async (accessCode: string) => {
    const path = `/exam/${encodeURIComponent(accessCode)}`;
    const fullUrl = `${window.location.origin}${path}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setNotice(`Candidate link copied: ${path}`);
      setError("");
    } catch {
      setError("Could not copy link.");
    }
  };

  const downloadResults = async (examId: string) => {
    try {
      const res = await fetch(`/api/lecturer/exams/${examId}/results`);
      if (!res.ok) {
        setError("Could not download results.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `results-${examId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download results.");
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      setView("dashboard");
      void loadExams();
      return;
    }

    if (status === "unauthenticated") {
      setView("auth");
    }
  }, [status, loadExams]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    setLoading(true);

    const result = await signIn("credentials", {
      email: authEmail,
      password: authPassword,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
    }
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    setLoading(true);

    try {
      const res = await fetch("/api/lecturer/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: authName,
          email: authEmail,
          password: authPassword,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        setError(json.error?.message || "Could not create account.");
        return;
      }

      const signInResult = await signIn("credentials", {
        email: authEmail,
        password: authPassword,
        redirect: false,
      });

      if (signInResult?.error) {
        setError("Account created, but sign in failed.");
      }
    } catch {
      setError("Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();

    if (!startsAt || !endsAt) {
      setError("Set start and end time.");
      return;
    }

    const parsedStart = new Date(startsAt);
    const parsedEnd = new Date(endsAt);

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      setError("Invalid date values.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/lecturer/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newExamTitle,
          accessCode: newExamCode,
          startsAt: parsedStart.toISOString(),
          endsAt: parsedEnd.toISOString(),
          questions: [],
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Could not create exam.");
        return;
      }

      setNotice("Exam created.");
      setNewExamTitle("");
      setNewExamCode("");
      setStartsAt("");
      setEndsAt("");
      setView("dashboard");
      await loadExams();
    } catch {
      setError("Could not create exam.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (status === "loading") {
    return (
      <div className="page justify-center items-center">
        <div className="animate-pulse flex items-center gap-2 text-zinc-400 font-medium">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div> System booting...
        </div>
      </div>
    );
  }

  if (view === "auth") {
    return (
      <div className="page justify-center">
        <main className="shell relative z-10">
          <section className="bg-white border border-zinc-200 p-8 md:p-12 rounded-[2rem] max-w-[460px] mx-auto shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] stagger-1 fade-in">
            <div className="stack gap-8">
              <div className="text-center stack gap-2 items-center">
                <div className="w-10 h-10 bg-zinc-950 rounded-xl flex items-center justify-center shadow-lg mb-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                </div>
                <h1 className="text-2xl tracking-tight font-semibold text-zinc-950">Lecturer Portal</h1>
                <p className="muted text-sm">Sign in to manage your exams and candidates.</p>
              </div>

              <div className="bg-zinc-100 p-1 flex rounded-xl">
                <button
                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${authMode === "signin" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}
                  onClick={() => setAuthMode("signin")}
                >
                  Sign In
                </button>
                <button
                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${authMode === "signup" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}
                  onClick={() => setAuthMode("signup")}
                >
                  Create Account
                </button>
              </div>

              {error ? <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium">{error}</div> : null}

              <form onSubmit={authMode === "signin" ? handleSignIn : handleSignUp} className="stack gap-5">
                {authMode === "signup" ? (
                  <div className="stack gap-1.5">
                    <label className="label">Name</label>
                    <input className="field" placeholder="Dr. Jane Doe" value={authName} onChange={(event) => setAuthName(event.target.value)} required />
                  </div>
                ) : null}

                <div className="stack gap-1.5">
                  <label className="label">Email Address</label>
                  <input className="field" type="email" placeholder="lecturer@university.edu" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
                </div>

                <div className="stack gap-1.5">
                  <label className="label">Password</label>
                  <input className="field" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required />
                </div>

                <button className="btn btn-primary w-full mt-2" disabled={loading} type="submit">
                  {loading ? "Authenticating..." : authMode === "signin" ? "Access Portal" : "Create Account"}
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page bg-zinc-50/50">
      <main className="shell stack gap-8 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 stagger-1 fade-in">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-zinc-950 rounded-[10px] flex items-center justify-center shadow-sm">
              <div className="w-2.5 h-2.5 bg-blue-600 rounded-full"></div>
            </div>
            <div>
              <h1 className="text-xl tracking-tight font-semibold text-zinc-950">Lecturer Control</h1>
              <p className="muted text-[0.85rem]">{session?.user?.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {view === "dashboard" ? (
              <button className="btn btn-primary" onClick={() => setView("create")}>
                + New Exam
              </button>
            ) : null}
            <button className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors" onClick={() => signOut({ callbackUrl: "/admin" })}>
              Log out
            </button>
          </div>
        </header>

        {error ? <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium shadow-sm">{error}</div> : null}
        {notice ? <div className="p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium shadow-sm">{notice}</div> : null}

        {/* Create View */}
        {view === "create" ? (
          <section className="bg-white border border-zinc-200 rounded-[2rem] p-8 md:p-10 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.05)] stagger-2 fade-in max-w-3xl">
            <div className="mb-8">
              <h2 className="text-2xl tracking-tight font-medium text-zinc-950">Draft New Exam</h2>
              <p className="text-zinc-500 text-sm mt-1">Configure the core details before adding questions.</p>
            </div>

            <form onSubmit={handleCreateExam} className="stack gap-6">
              <div className="stack gap-1.5">
                <label className="label">Exam Title</label>
                <input className="field" placeholder="e.g. Advanced Mathematics 101" value={newExamTitle} onChange={(event) => setNewExamTitle(event.target.value)} required />
              </div>

              <div className="stack gap-1.5">
                <label className="label">Candidate Access Code</label>
                <div className="relative">
                  <input
                    className="field uppercase pr-24 font-mono font-medium"
                    placeholder="e.g. MATH-MIDTERM"
                    value={newExamCode}
                    onChange={(event) => setNewExamCode(event.target.value.toUpperCase())}
                    required
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.65rem] font-bold tracking-wider text-zinc-400 uppercase pointer-events-none">Must be unique</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-zinc-100">
                <div className="stack gap-1.5">
                  <label className="label">Opening Time</label>
                  <input className="field text-sm" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
                </div>
                <div className="stack gap-1.5">
                  <label className="label">Closing Time</label>
                  <input className="field text-sm" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Generating..." : "Create Exam"}
                </button>
                <button className="btn btn-secondary px-6" type="button" onClick={() => setView("dashboard")}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {/* Dashboard View */}
        {view === "dashboard" ? (
          <section className="stack gap-6 w-full stagger-2 fade-in">
            {loading ? <div className="animate-pulse h-64 bg-zinc-100 rounded-[2rem]"></div> : null}

            {exams.length === 0 && !loading ? (
              <div className="empty-state">
                <div className="w-16 h-16 bg-white border border-zinc-200 rounded-2xl flex items-center justify-center shadow-sm mx-auto mb-4">
                  <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <h3 className="text-zinc-900 font-medium mb-1">No active exams</h3>
                <p className="text-zinc-500 text-sm mb-6">Create your first examination to get started.</p>
                <button className="btn btn-primary" onClick={() => setView("create")}>+ New Exam</button>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6">
              {exams.map((exam) => (
                <article className="surface p-0 flex flex-col md:flex-row overflow-hidden group hover:border-zinc-300 transition-colors" key={exam.examId}>

                  {/* Main Info */}
                  <div className="p-6 md:p-8 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[0.65rem] font-bold tracking-widest uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{exam.accessCode}</span>
                        <span className="text-[0.75rem] font-medium text-zinc-400">{formatDate(exam.startsAt)}</span>
                      </div>
                      <h2 className="text-2xl tracking-tight font-medium text-zinc-950 mb-2">{exam.title}</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-8">
                      <Link className="btn btn-primary" href={`/admin/exams/${exam.examId}`}>Edit Questions</Link>
                      <button className="btn btn-secondary" onClick={() => void openMonitoring(exam.examId)}>Live Monitoring</button>
                      <button className="btn btn-secondary" onClick={() => void copyCandidateLink(exam.accessCode)}>Copy Link</button>
                      <button className="btn btn-secondary text-zinc-500 hover:text-zinc-900" onClick={() => void downloadResults(exam.examId)}>
                        CSV Export
                      </button>
                    </div>
                  </div>

                  {/* KPIs Sidebar */}
                  <div className="bg-zinc-50 border-t md:border-t-0 md:border-l border-zinc-200 p-6 md:p-8 flex md:flex-col justify-center gap-8 md:w-[220px]">
                    <div>
                      <p className="text-3xl font-medium tracking-tight text-zinc-950">{exam.candidateCount}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mt-1">Candidates</p>
                    </div>
                    <div>
                      <p className="text-3xl font-medium tracking-tight text-zinc-950">{exam.questionCount}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mt-1">Questions</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* Monitoring View */}
        {view === "monitoring" ? (
          <section className="stack gap-6 stagger-2 fade-in">
            {/* Monitoring Header */}
            <div className="surface flex flex-col md:flex-row items-start md:items-center justify-between p-6 md:p-8 gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <p className="text-[0.7rem] font-bold uppercase tracking-widest text-red-500">Live Session</p>
                </div>
                <h2 className="text-2xl tracking-tight font-medium text-zinc-950">{monitoring?.title ?? "Loading..."}</h2>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <button className="btn btn-secondary w-full md:w-auto" onClick={() => selectedExamId && void fetchMonitoring(selectedExamId)}>
                  Refresh Pulse
                </button>
                <button
                  className="btn btn-secondary text-zinc-500 w-full md:w-auto"
                  onClick={() => {
                    if (pollRef.current) {
                      clearInterval(pollRef.current);
                      pollRef.current = null;
                    }
                    setView("dashboard");
                  }}
                >
                  Exit Monitor
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="surface p-6 flex flex-col justify-center items-center text-center">
                <p className="text-4xl font-light tracking-tighter text-blue-600">{monitoring?.activeCount ?? 0}</p>
                <p className="text-[0.75rem] font-bold uppercase tracking-wider text-zinc-500 mt-2">Active</p>
              </div>
              <div className="surface p-6 flex flex-col justify-center items-center text-center">
                <p className="text-4xl font-light tracking-tighter text-zinc-950">{monitoring?.submittedCount ?? 0}</p>
                <p className="text-[0.75rem] font-bold uppercase tracking-wider text-zinc-500 mt-2">Submitted</p>
              </div>
              <div className="surface p-6 flex flex-col justify-center items-center text-center">
                <p className="text-4xl font-light tracking-tighter text-rose-600">{monitoring?.disconnectedCount ?? 0}</p>
                <p className="text-[0.75rem] font-bold uppercase tracking-wider text-zinc-500 mt-2">Offline</p>
              </div>
              <div className="surface p-6 flex flex-col justify-center items-center text-center">
                <p className="text-4xl font-light tracking-tighter text-amber-500">{monitoring?.flaggedCount ?? 0}</p>
                <p className="text-[0.75rem] font-bold uppercase tracking-wider text-zinc-500 mt-2">Flagged</p>
              </div>
            </div>

            <div className="table-wrap border-none shadow-[0_10px_30px_-15px_rgba(0,0,0,0.05)] rounded-[1.5rem] bg-white overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-zinc-50/80 border-b border-zinc-200">
                  <tr>
                    <th className="py-4 px-6 font-semibold text-zinc-900 border-none">Candidate</th>
                    <th className="py-4 px-6 font-semibold text-zinc-900 border-none">Status</th>
                    <th className="py-4 px-6 font-semibold text-zinc-900 border-none text-center">Strikes</th>
                    <th className="py-4 px-6 font-semibold text-zinc-900 border-none">Last Event</th>
                    <th className="py-4 px-6 font-semibold text-zinc-900 border-none text-right">Completion Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(monitoring?.candidates ?? []).map((candidate) => (
                    <tr key={candidate.sessionId} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="py-4 px-6 border-none">
                        <div className="font-medium text-zinc-900">{candidate.candidateName}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5">{candidate.candidateId}</div>
                      </td>
                      <td className="py-4 px-6 border-none">
                        <span className={statusClass(candidate.status)}>{candidate.status}</span>
                      </td>
                      <td className="py-4 px-6 border-none text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold ${candidate.strikes > 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-500'}`}>
                          {candidate.strikes}
                        </span>
                      </td>
                      <td className="py-4 px-6 border-none text-sm text-zinc-600 font-mono text-[0.8rem] bg-zinc-50/50 rounded-md">
                        {candidate.lastEventType ?? "-"}
                      </td>
                      <td className="py-4 px-6 border-none text-sm text-zinc-500 text-right">
                        {candidate.submittedAt ? formatDate(candidate.submittedAt) : "-"}
                      </td>
                    </tr>
                  ))}
                  {(monitoring?.candidates.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 border-none">
                        <div className="text-center text-sm text-zinc-400">Waiting for candidates to join...</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
