"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AdminProfile = {
  id: string;
  email: string;
  displayName: string;
  role: "SUPER_ADMIN" | "PROCTOR";
  expiresAt: string;
};

type MonitoringData = {
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
    lastEventAt: string | null;
    submittedAt: string | null;
    expiresAt: string;
    extendedUntil: string | null;
  }>;
};

type TimelineEntry = {
  id: string;
  kind: "event" | "admin_action";
  createdAt: string;
  label: string;
  detail: string;
  strikeDelta?: number;
  strikeTotalAfter?: number;
  actor?: string;
};

type TimelineData = {
  examId: string;
  sessionId: string;
  candidateId: string;
  candidateName: string;
  entries: TimelineEntry[];
};

type ExamSummary = {
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
};

type SimilaritySnapshot = {
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

type AnalyticsSnapshot = {
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

type ApiFailure = { ok: false; error: { message: string } };
type ApiSuccess<T> = { ok: true; data: T };

export default function AdminPage() {
  const [email, setEmail] = useState("admin@testkoko.local");
  const [password, setPassword] = useState("admin12345");
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  const [examId, setExamId] = useState("exam-mth101");
  const [snapshot, setSnapshot] = useState<MonitoringData | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [streamOn, setStreamOn] = useState(true);

  const [examCatalog, setExamCatalog] = useState<ExamSummary[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);
  const [isRunningSimilarity, setIsRunningSimilarity] = useState(false);
  const [isRefreshingInsights, setIsRefreshingInsights] = useState(false);

  const [examAccessCode, setExamAccessCode] = useState("NEW-EXAM-001");
  const [examTitle, setExamTitleInput] = useState("New Institutional Exam");
  const [examStartAt, setExamStartAt] = useState(() => {
    const when = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return when.toISOString().slice(0, 16);
  });
  const [examEndAt, setExamEndAt] = useState(() => {
    const when = new Date(Date.now() + 26 * 60 * 60 * 1000);
    return when.toISOString().slice(0, 16);
  });

  const [rosterExamId, setRosterExamId] = useState("exam-mth101");
  const [rosterCsv, setRosterCsv] = useState(
    ["candidateId,surname,displayName", "MAT-00991,Okeke,Okeke L.", "MAT-00992,Audu,Audu K."].join("\n"),
  );

  const [similarity, setSimilarity] = useState<SimilaritySnapshot | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);

  const sourceRef = useRef<EventSource | null>(null);

  const statusPalette = useMemo(
    () => ({
      Active: "border-neutral-300 bg-white text-black",
      Disconnected: "border-neutral-300 bg-neutral-100 text-neutral-700",
      Flagged: "border-black bg-black text-white",
      Submitted: "border-neutral-400 bg-neutral-200 text-neutral-800",
    }),
    [],
  );

  const fetchMe = useCallback(async () => {
    const response = await fetch("/api/admin/auth/me");
    const data = (await response.json()) as ApiSuccess<AdminProfile> | ApiFailure;
    if (!response.ok || !data.ok) {
      setProfile(null);
      return;
    }

    setProfile(data.data);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchMe();
    }, 0);

    return () => clearTimeout(handle);
  }, [fetchMe]);

  const loadSnapshot = useCallback(async () => {
    if (!examId.trim()) {
      setError("Exam ID is required.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const response = await fetch(`/api/admin/monitoring?examId=${encodeURIComponent(examId.trim())}`);
    const data = (await response.json()) as ApiSuccess<MonitoringData> | ApiFailure;
    if (!response.ok || !data.ok) {
      setError(data.ok ? "Monitoring fetch failed." : data.error.message);
      setIsLoading(false);
      return;
    }

    setSnapshot(data.data);
    setSelectedSessionId((current) => current ?? data.data.candidates[0]?.sessionId ?? null);
    setIsLoading(false);
  }, [examId]);

  const loadTimeline = useCallback(async () => {
    if (!examId.trim() || !selectedSessionId) {
      setTimeline(null);
      return;
    }

    const response = await fetch(
      `/api/admin/timeline?examId=${encodeURIComponent(examId.trim())}&sessionId=${encodeURIComponent(selectedSessionId)}`,
    );
    const data = (await response.json()) as ApiSuccess<TimelineData> | ApiFailure;
    if (!response.ok || !data.ok) {
      setTimeline(null);
      return;
    }

    setTimeline(data.data);
  }, [examId, selectedSessionId]);

  const loadExamCatalog = useCallback(async () => {
    if (!profile) {
      return;
    }

    setIsCatalogLoading(true);
    const response = await fetch("/api/admin/exams");
    const data = (await response.json()) as ApiSuccess<{ exams: ExamSummary[] }> | ApiFailure;
    if (!response.ok || !data.ok) {
      setIsCatalogLoading(false);
      return;
    }

    setExamCatalog(data.data.exams);
    setIsCatalogLoading(false);
  }, [profile]);

  const loadInsights = useCallback(async () => {
    const targetExamId = examId.trim();
    if (!profile || !targetExamId) {
      return;
    }

    setIsRefreshingInsights(true);

    const [similarityResponse, analyticsResponse] = await Promise.all([
      fetch(`/api/admin/similarity?examId=${encodeURIComponent(targetExamId)}`),
      fetch(`/api/admin/analytics?examId=${encodeURIComponent(targetExamId)}`),
    ]);

    const similarityData = (await similarityResponse.json()) as ApiSuccess<SimilaritySnapshot> | ApiFailure;
    if (similarityResponse.ok && similarityData.ok) {
      setSimilarity(similarityData.data);
    }

    const analyticsData = (await analyticsResponse.json()) as ApiSuccess<AnalyticsSnapshot> | ApiFailure;
    if (analyticsResponse.ok && analyticsData.ok) {
      setAnalytics(analyticsData.data);
    }

    setIsRefreshingInsights(false);
  }, [examId, profile]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadTimeline();
    }, 0);

    return () => clearTimeout(handle);
  }, [loadTimeline]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadExamCatalog();
    }, 0);

    return () => clearTimeout(handle);
  }, [loadExamCatalog]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadInsights();
    }, 0);

    return () => clearTimeout(handle);
  }, [loadInsights]);

  useEffect(() => {
    if (!profile || !streamOn || !examId.trim()) {
      sourceRef.current?.close();
      sourceRef.current = null;
      return;
    }

    const source = new EventSource(`/api/admin/monitoring/stream?examId=${encodeURIComponent(examId.trim())}`);
    sourceRef.current = source;

    const onSnapshot = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as MonitoringData;
        setSnapshot(data);
        setSelectedSessionId((current) => current ?? data.candidates[0]?.sessionId ?? null);
        setError(null);
      } catch {
        setError("Could not parse stream payload.");
      }
    };

    const onError = () => {
      setError("Realtime stream disconnected. You can still refresh manually.");
      source.close();
      sourceRef.current = null;
    };

    source.addEventListener("snapshot", onSnapshot as EventListener);
    source.addEventListener("error", onError as EventListener);

    return () => {
      source.removeEventListener("snapshot", onSnapshot as EventListener);
      source.removeEventListener("error", onError as EventListener);
      source.close();
      sourceRef.current = null;
    };
  }, [examId, profile, streamOn]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNote(null);
    setIsSigningIn(true);

    const response = await fetch("/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json()) as ApiSuccess<AdminProfile> | ApiFailure;
    if (!response.ok || !data.ok) {
      setError(data.ok ? "Login failed." : data.error.message);
      setIsSigningIn(false);
      return;
    }

    setProfile(data.data);
    setIsSigningIn(false);
    setNote("Signed in. Monitoring stream is active.");
    await loadSnapshot();
  };

  const signOut = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    setProfile(null);
    setSnapshot(null);
    setTimeline(null);
    setSelectedSessionId(null);
    setExamCatalog([]);
    setSimilarity(null);
    setAnalytics(null);
    setNote("Signed out.");
  };

  const runAction = async (
    sessionId: string,
    actionType: "force_submit" | "extend_time" | "reset_session",
    extraMinutes?: number,
  ) => {
    setNote(null);
    setError(null);

    const response = await fetch("/api/admin/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        examId: examId.trim(),
        sessionId,
        actionType,
        extraMinutes,
      }),
    });

    const data = (await response.json()) as ApiSuccess<{ message: string }> | ApiFailure;
    if (!response.ok || !data.ok) {
      setError(data.ok ? "Admin action failed." : data.error.message);
      return;
    }

    setNote(data.data.message);
    await loadSnapshot();
    await loadTimeline();
  };

  const createExam = async () => {
    setError(null);
    setNote(null);
    setIsCreatingExam(true);

    const response = await fetch("/api/admin/exams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accessCode: examAccessCode,
        title: examTitle,
        startsAt: new Date(examStartAt).toISOString(),
        endsAt: new Date(examEndAt).toISOString(),
      }),
    });

    const data = (await response.json()) as ApiSuccess<{ exam: ExamSummary }> | ApiFailure;
    if (!response.ok || !data.ok) {
      setError(data.ok ? "Exam creation failed." : data.error.message);
      setIsCreatingExam(false);
      return;
    }

    setNote(`Exam created: ${data.data.exam.title} (${data.data.exam.accessCode}).`);
    setExamId(data.data.exam.examId);
    setRosterExamId(data.data.exam.examId);
    await loadExamCatalog();
    setIsCreatingExam(false);
  };

  const uploadRoster = async () => {
    const targetExamId = rosterExamId.trim();
    if (!targetExamId) {
      setError("Roster exam ID is required.");
      return;
    }

    setError(null);
    setNote(null);
    setIsUploadingRoster(true);

    const response = await fetch(`/api/admin/exams/${encodeURIComponent(targetExamId)}/roster`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ csv: rosterCsv }),
    });

    const data = (await response.json()) as
      | ApiSuccess<{
          examId: string;
          createdCount: number;
          updatedCount: number;
          skippedCount: number;
          totalProcessed: number;
          issues: Array<{ row: number; message: string }>;
        }>
      | ApiFailure;

    if (!response.ok || !data.ok) {
      setError(data.ok ? "Roster upload failed." : data.error.message);
      setIsUploadingRoster(false);
      return;
    }

    const issueNote = data.data.issues.length > 0 ? ` (${data.data.issues.length} row issue(s))` : "";
    setNote(
      `Roster uploaded. created=${data.data.createdCount}, updated=${data.data.updatedCount}, skipped=${data.data.skippedCount}${issueNote}.`,
    );

    await loadExamCatalog();
    await loadSnapshot();
    setIsUploadingRoster(false);
  };

  const runSimilarity = async () => {
    const targetExamId = examId.trim();
    if (!targetExamId) {
      setError("Exam ID is required.");
      return;
    }

    setError(null);
    setNote(null);
    setIsRunningSimilarity(true);

    const response = await fetch("/api/admin/similarity/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        examId: targetExamId,
        scoreThreshold: 0.75,
        minCommonAnswers: 3,
      }),
    });

    const data = (await response.json()) as ApiSuccess<{ runId: string; generatedPairs: number }> | ApiFailure;

    if (!response.ok || !data.ok) {
      setError(data.ok ? "Similarity run failed." : data.error.message);
      setIsRunningSimilarity(false);
      return;
    }

    setNote(`Similarity run complete. ${data.data.generatedPairs} flagged pair(s).`);
    await loadInsights();
    setIsRunningSimilarity(false);
  };

  const downloadAudit = async () => {
    const targetExamId = examId.trim();
    if (!targetExamId) {
      setError("Exam ID is required.");
      return;
    }

    setError(null);
    setNote(null);

    const response = await fetch(`/api/admin/reports/audit?examId=${encodeURIComponent(targetExamId)}`);
    const data = (await response.json()) as ApiSuccess<unknown> | ApiFailure;
    if (!response.ok || !data.ok) {
      setError(data.ok ? "Audit export failed." : data.error.message);
      return;
    }

    const content = JSON.stringify(data.data, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-${targetExamId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNote(`Audit report downloaded for ${targetExamId}.`);
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-6 md:py-10">
      <main className="ui-shell max-w-7xl space-y-6">
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <Link href="/" className="hover:text-black">
            Back to home
          </Link>
          <span className="ui-kicker">Admin Console</span>
        </div>

        <section className="ui-card overflow-hidden">
          <div className="border-b border-neutral-200 px-5 py-4 md:px-7">
            <p className="ui-kicker">Monitoring and intervention</p>
            <h1 className="font-heading mt-1 text-2xl font-semibold md:text-3xl">Live Exam Operations</h1>
            <p className="mt-1 text-sm text-neutral-600">Clear status, direct interventions, and evidence timelines.</p>
          </div>

          {!profile ? (
            <form className="grid gap-4 p-5 md:grid-cols-2 md:p-7" onSubmit={signIn}>
              <label>
                <span className="ui-label">Admin Email</span>
                <input className="ui-input" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>

              <label>
                <span className="ui-label">Password</span>
                <input
                  className="ui-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              <button className="ui-btn-primary md:col-span-2" disabled={isSigningIn} type="submit">
                {isSigningIn ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <div className="space-y-5 p-5 md:p-7">
              <div className="ui-muted-card flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-heading font-semibold">{profile.displayName}</p>
                  <p className="text-xs text-neutral-600">
                    {profile.role} | session expires {new Date(profile.expiresAt).toLocaleTimeString()}
                  </p>
                </div>
                <button className="ui-btn-secondary" onClick={() => void signOut()} type="button">
                  Logout
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  className="ui-input"
                  placeholder="Exam ID"
                  value={examId}
                  onChange={(event) => setExamId(event.target.value)}
                />
                <button className="ui-btn-secondary" type="button" onClick={() => void loadSnapshot()}>
                  {isLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button className={streamOn ? "ui-btn-primary" : "ui-btn-secondary"} type="button" onClick={() => setStreamOn((current) => !current)}>
                  {streamOn ? "Realtime On" : "Realtime Off"}
                </button>
              </div>

              {snapshot ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Active" value={snapshot.activeCount} tone="light" />
                    <StatCard label="Disconnected" value={snapshot.disconnectedCount} tone="muted" />
                    <StatCard label="Flagged" value={snapshot.flaggedCount} tone="dark" />
                    <StatCard label="Submitted" value={snapshot.submittedCount} tone="muted" />
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[1.65fr_1fr]">
                    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                      <div className="overflow-x-auto">
                        <table className="ui-table min-w-[820px] text-sm">
                          <thead>
                            <tr>
                              <th>Candidate</th>
                              <th>Status</th>
                              <th>Strikes</th>
                              <th>Last Event</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.candidates.map((row) => (
                              <tr className={selectedSessionId === row.sessionId ? "bg-neutral-100" : undefined} key={row.sessionId}>
                                <td>
                                  <button className="text-left" onClick={() => setSelectedSessionId(row.sessionId)} type="button">
                                    <p className="font-heading text-sm font-semibold">{row.candidateName}</p>
                                    <p className="text-xs text-neutral-600">{row.candidateId}</p>
                                  </button>
                                </td>
                                <td>
                                  <span className={`ui-badge ${statusPalette[row.status]}`}>{row.status}</span>
                                </td>
                                <td className="text-xs">{row.strikes}</td>
                                <td className="text-xs text-neutral-700">
                                  {row.lastEventType
                                    ? `${row.lastEventType} @ ${new Date(row.lastEventAt || "").toLocaleTimeString()}`
                                    : "No events"}
                                </td>
                                <td>
                                  <div className="flex flex-wrap gap-2">
                                    <button className="ui-btn-secondary !px-2 !py-1 !text-xs" onClick={() => void runAction(row.sessionId, "force_submit")} type="button">
                                      Force Submit
                                    </button>
                                    <button className="ui-btn-secondary !px-2 !py-1 !text-xs" onClick={() => void runAction(row.sessionId, "extend_time", 10)} type="button">
                                      +10 min
                                    </button>
                                    {profile.role === "SUPER_ADMIN" ? (
                                      <button className="ui-btn-secondary !px-2 !py-1 !text-xs" onClick={() => void runAction(row.sessionId, "reset_session")} type="button">
                                        Reset
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <section className="ui-muted-card p-4">
                      <p className="ui-kicker">Candidate Timeline</p>
                      {timeline ? (
                        <>
                          <h3 className="font-heading mt-2 text-lg font-semibold">{timeline.candidateName}</h3>
                          <p className="text-xs text-neutral-600">{timeline.candidateId}</p>
                          <ul className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                            {timeline.entries.map((entry) => (
                              <li className="rounded-xl border border-neutral-200 bg-white p-3" key={entry.id}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.08em]">{entry.label}</p>
                                  <p className="text-[11px] text-neutral-600">{new Date(entry.createdAt).toLocaleTimeString()}</p>
                                </div>
                                <p className="mt-1 text-xs text-neutral-700">{entry.detail}</p>
                                {entry.strikeDelta !== undefined ? (
                                  <p className="mt-1 text-[11px] text-neutral-700">
                                    strike +{entry.strikeDelta} to {entry.strikeTotalAfter}
                                  </p>
                                ) : null}
                                {entry.actor ? <p className="mt-1 text-[11px] text-neutral-700">actor: {entry.actor}</p> : null}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-neutral-600">Select a candidate row to load timeline events.</p>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <p className="text-sm text-neutral-600">No snapshot yet. Click refresh or wait for stream.</p>
              )}
            </div>
          )}

          {note ? <p className="px-5 pb-4 text-sm text-neutral-700 md:px-7">{note}</p> : null}
          {error ? <p className="px-5 pb-4 text-sm text-black md:px-7">{error}</p> : null}
        </section>

        {profile ? (
          <section className="ui-card overflow-hidden">
            <div className="border-b border-neutral-200 px-5 py-4 md:px-7">
              <p className="ui-kicker">Admin setup and insights</p>
              <h2 className="font-heading mt-1 text-2xl font-semibold md:text-3xl">Onboarding, Similarity, and Audit</h2>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-2 md:p-7">
              <article className="ui-muted-card p-4">
                <p className="ui-kicker">Create Exam</p>
                <div className="mt-3 grid gap-3">
                  <input className="ui-input" placeholder="Access Code" value={examAccessCode} onChange={(event) => setExamAccessCode(event.target.value)} />
                  <input className="ui-input" placeholder="Exam Title" value={examTitle} onChange={(event) => setExamTitleInput(event.target.value)} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="ui-input" type="datetime-local" value={examStartAt} onChange={(event) => setExamStartAt(event.target.value)} />
                    <input className="ui-input" type="datetime-local" value={examEndAt} onChange={(event) => setExamEndAt(event.target.value)} />
                  </div>
                  <button className="ui-btn-primary" type="button" onClick={() => void createExam()} disabled={isCreatingExam}>
                    {isCreatingExam ? "Creating..." : "Create Exam"}
                  </button>
                </div>
              </article>

              <article className="ui-muted-card p-4">
                <p className="ui-kicker">Roster Upload (CSV)</p>
                <div className="mt-3 grid gap-3">
                  <input className="ui-input" placeholder="Exam ID" value={rosterExamId} onChange={(event) => setRosterExamId(event.target.value)} />
                  <textarea className="ui-textarea" value={rosterCsv} onChange={(event) => setRosterCsv(event.target.value)} />
                  <button className="ui-btn-primary" type="button" onClick={() => void uploadRoster()} disabled={isUploadingRoster}>
                    {isUploadingRoster ? "Uploading..." : "Upload Roster"}
                  </button>
                </div>
              </article>

              <article className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="ui-kicker">Exam Catalog</p>
                  <button className="ui-btn-secondary" type="button" onClick={() => void loadExamCatalog()} disabled={isCatalogLoading}>
                    {isCatalogLoading ? "Refreshing..." : "Refresh Catalog"}
                  </button>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
                  <table className="ui-table min-w-[640px] text-xs">
                    <thead>
                      <tr>
                        <th>Exam</th>
                        <th>Access</th>
                        <th>Candidates</th>
                        <th>Questions</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examCatalog.map((exam) => (
                        <tr key={exam.examId}>
                          <td>
                            <p className="font-heading text-sm font-semibold">{exam.title}</p>
                            <p className="text-[11px] text-neutral-600">{exam.examId}</p>
                          </td>
                          <td>{exam.accessCode}</td>
                          <td>{exam.candidateCount}</td>
                          <td>{exam.questionCount}</td>
                          <td>
                            <button
                              className="ui-btn-secondary !px-2 !py-1 !text-xs"
                              type="button"
                              onClick={() => {
                                setExamId(exam.examId);
                                setRosterExamId(exam.examId);
                              }}
                            >
                              Use
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="md:col-span-2">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button className="ui-btn-primary" type="button" onClick={() => void runSimilarity()} disabled={isRunningSimilarity}>
                    {isRunningSimilarity ? "Running Similarity..." : "Run Similarity"}
                  </button>
                  <button className="ui-btn-secondary" type="button" onClick={() => void loadInsights()} disabled={isRefreshingInsights}>
                    {isRefreshingInsights ? "Refreshing Insights..." : "Refresh Insights"}
                  </button>
                  <button className="ui-btn-secondary" type="button" onClick={() => void downloadAudit()}>
                    Export Audit JSON
                  </button>
                </div>

                {analytics ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Registered" value={analytics.totals.registeredCandidates} tone="light" />
                    <StatCard label="Submitted" value={analytics.totals.submittedCandidates} tone="muted" />
                    <StatCard label="Flagged" value={analytics.totals.flaggedCandidates} tone="dark" />
                    <StatCard label="Active" value={analytics.totals.activeSessions} tone="muted" />
                  </div>
                ) : null}

                {analytics ? (
                  <p className="mt-3 text-xs text-neutral-700">
                    submission success {analytics.rates.submissionSuccessRate}% | flagged rate {analytics.rates.flaggedRate}% | strike events {" "}
                    {analytics.integrity.strikeEvents} | autosave cadence p95 {analytics.reliability.autosaveCadenceP95Seconds ?? "n/a"}s
                  </p>
                ) : null}

                <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
                  <table className="ui-table min-w-[700px] text-xs">
                    <thead>
                      <tr>
                        <th>Left Candidate</th>
                        <th>Right Candidate</th>
                        <th>Common</th>
                        <th>Answer Sim.</th>
                        <th>Timing Sim.</th>
                        <th>Combined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(similarity?.pairs ?? []).map((pair) => (
                        <tr key={pair.id}>
                          <td>
                            {pair.leftCandidateName}
                            <span className="ml-1 text-[11px] text-neutral-600">{pair.leftCandidateId}</span>
                          </td>
                          <td>
                            {pair.rightCandidateName}
                            <span className="ml-1 text-[11px] text-neutral-600">{pair.rightCandidateId}</span>
                          </td>
                          <td>{pair.commonAnswered}</td>
                          <td>{pair.answerSimilarity}</td>
                          <td>{pair.timingSimilarity}</td>
                          <td className="font-semibold">{pair.combinedScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "light" | "muted" | "dark";
}) {
  const tones: Record<typeof tone, string> = {
    light: "border-neutral-200 bg-white text-black",
    muted: "border-neutral-200 bg-neutral-100 text-black",
    dark: "border-black bg-black text-white",
  };

  return (
    <article className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="ui-kicker">{label}</p>
      <p className="font-heading mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}
