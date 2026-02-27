"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface QuestionDraft {
  prompt: string;
  options: string[];
  correctOptionIndex: number | null;
}

interface StudentDraft {
  candidateId: string;
  surname: string;
  displayName: string;
}

function toLocalDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function ExamDetailPage() {
  const { status } = useSession();
  const params = useParams<{ examId: string }>();
  const examId = params.examId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"details" | "questions" | "students" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [title, setTitle] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [students, setStudents] = useState<StudentDraft[]>([]);

  const [activeTab, setActiveTab] = useState<"details" | "questions" | "candidates">("details");

  const clearFeedback = () => {
    setError("");
    setNotice("");
  };

  const loadExamDetail = useCallback(async () => {
    if (!examId) {
      return;
    }

    try {
      setLoading(true);
      clearFeedback();

      const res = await fetch(`/api/lecturer/exams/${examId}`);
      const json = await res.json();

      if (!json.ok) {
        setError(json.error?.message || "Could not load exam.");
        return;
      }

      setTitle(json.data.exam.title);
      setAccessCode(json.data.exam.accessCode);
      setStartsAt(toLocalDateInput(json.data.exam.startsAt));
      setEndsAt(toLocalDateInput(json.data.exam.endsAt));

      setQuestions(
        json.data.questions.map((question: { prompt: string; options: string[]; correctOption: string }) => ({
          prompt: question.prompt,
          options: question.options.length > 0 ? question.options : ["", ""],
          correctOptionIndex: question.options.findIndex((option) => option === question.correctOption),
        })),
      );

      setStudents(json.data.students);
    } catch {
      setError("Could not load exam.");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadExamDetail();
    }
  }, [status, loadExamDetail]);

  const candidatePath = useMemo(() => `/exam/${encodeURIComponent(accessCode || "EXAM-CODE")}`, [accessCode]);

  const copyCandidateLink = async () => {
    const fullUrl = `${window.location.origin}${candidatePath}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setNotice(`Candidate link copied: ${candidatePath}`);
      setError("");
    } catch {
      setError("Could not copy link.");
    }
  };

  const handleSaveDetails = async () => {
    if (!examId) {
      return;
    }

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

    try {
      setSaving("details");
      clearFeedback();

      const res = await fetch(`/api/lecturer/exams/${examId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          accessCode,
          startsAt: parsedStart.toISOString(),
          endsAt: parsedEnd.toISOString(),
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Could not save details.");
        return;
      }

      setNotice("Exam details saved.");
    } catch {
      setError("Could not save details.");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveQuestions = async () => {
    if (!examId) {
      return;
    }

    try {
      setSaving("questions");
      clearFeedback();

      const payloadQuestions = questions.map((question) => ({
        prompt: question.prompt,
        options: question.options,
        correctOption: question.correctOptionIndex === null ? "" : (question.options[question.correctOptionIndex] ?? ""),
      }));

      const res = await fetch(`/api/lecturer/exams/${examId}/questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: payloadQuestions }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Could not save questions.");
        return;
      }

      setNotice(`Questions saved: ${json.data.questionCount}`);
    } catch {
      setError("Could not save questions.");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveStudents = async () => {
    if (!examId) {
      return;
    }

    try {
      setSaving("students");
      clearFeedback();

      const res = await fetch(`/api/lecturer/exams/${examId}/students`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Could not save students.");
        return;
      }

      setNotice(`Students saved: ${json.data.studentCount}`);
    } catch {
      setError("Could not save students.");
    } finally {
      setSaving(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="page justify-center items-center">
        <div className="animate-pulse flex items-center gap-2 text-zinc-400 font-medium">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div> Loading editor...
        </div>
      </div>
    );
  }

  return (
    <div className="page bg-zinc-50/50">
      <main className="shell stack gap-6 py-6 md:py-8 max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 stagger-1 fade-in">
          <div className="flex gap-4">
            <Link href="/admin" className="w-10 h-10 bg-white border border-zinc-200 rounded-xl flex items-center justify-center shadow-sm text-zinc-500 hover:text-zinc-900 transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </Link>
            <div className="stack gap-1">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-max">Exam Configuration</p>
              <h1 className="text-3xl tracking-tight font-medium text-zinc-950 mt-1">{title || "Untitled Exam"}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-secondary text-sm" onClick={() => void copyCandidateLink()}>
              Copy Link
            </button>
            <button className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors ml-4" onClick={() => signOut({ callbackUrl: "/admin" })}>
              Log out
            </button>
          </div>
        </header>

        {error ? <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium shadow-sm">{error}</div> : null}
        {notice ? <div className="p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium shadow-sm">{notice}</div> : null}

        {/* Tab Navigation */}
        <div className="flex bg-zinc-200/50 p-1.5 rounded-2xl w-full md:w-max stagger-2 fade-in mt-4">
          <button
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'details' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            onClick={() => setActiveTab('details')}
          >
            Basic Details
          </button>
          <button
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'questions' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            onClick={() => setActiveTab('questions')}
          >
            Questions ({questions.length})
          </button>
          <button
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'candidates' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            onClick={() => setActiveTab('candidates')}
          >
            Candidates ({students.length})
          </button>
        </div>

        {/* DETAILS TAB */}
        <div className={`transition-opacity duration-300 ${activeTab === 'details' ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
          <section className="bg-white border border-zinc-200 rounded-[2rem] p-8 md:p-10 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.05)] stagger-3 fade-in mt-2 gap-8 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-6">
              <div>
                <h2 className="text-xl tracking-tight font-medium text-zinc-950">Basic Details</h2>
                <p className="text-zinc-500 text-sm mt-1">Configure title, code, and active schedule.</p>
              </div>
              <button className="btn btn-primary" onClick={() => void handleSaveDetails()} disabled={saving !== null}>
                {saving === "details" ? "Saving..." : "Save Details"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 stack gap-1.5">
                <label className="label">Exam Title</label>
                <input className="field border-zinc-200 shadow-sm focus:border-zinc-400 focus:ring-0 rounded-xl" placeholder="e.g. Midterm Physics" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>

              <div className="stack gap-1.5">
                <label className="label text-zinc-700">Access Code</label>
                <div className="relative">
                  <input className="field font-mono uppercase rounded-xl border-zinc-200 bg-zinc-50 pr-12 text-blue-600 font-medium tracking-wide" value={accessCode} onChange={(event) => setAccessCode(event.target.value.toUpperCase())} />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700" onClick={copyCandidateLink} title="Copy link">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                  </button>
                </div>
                <p className="helper text-[0.7rem] font-mono mt-2 bg-zinc-100 p-2 rounded-lg break-all">Path: {candidatePath}</p>
              </div>

              <div className="hidden md:block"></div> {/* Spacer */}

              <div className="stack gap-1.5">
                <label className="label text-zinc-700">Starts At</label>
                <input className="field text-sm rounded-xl border-zinc-200" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              </div>

              <div className="stack gap-1.5">
                <label className="label text-zinc-700">Ends At</label>
                <input className="field text-sm rounded-xl border-zinc-200" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </div>
            </div>
          </section>
        </div>


        {/* QUESTIONS TAB */}
        <div className={`transition-opacity duration-300 ${activeTab === 'questions' ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
          <section className="bg-white border border-zinc-200 rounded-[2rem] p-8 md:p-10 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.05)] stagger-3 fade-in mt-2 gap-8 flex flex-col max-w-4xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-6">
              <div>
                <h2 className="text-xl tracking-tight font-medium text-zinc-950">Question Bank</h2>
                <p className="text-zinc-500 text-sm mt-1">Add multiple choice questions and define exact correct options.</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  onClick={() => setQuestions((prev) => [...prev, { prompt: "", options: ["", ""], correctOptionIndex: null }])}
                >
                  + Add Question
                </button>
                <button className="btn btn-primary" onClick={() => void handleSaveQuestions()} disabled={saving !== null}>
                  {saving === "questions" ? "Saving..." : "Save Questions"}
                </button>
              </div>
            </div>

            {questions.length === 0 ? <div className="empty-state">No questions formulated yet. Add your first testing parameter.</div> : null}

            <div className="stack gap-8">
              {questions.map((question, questionIndex) => (
                <article className="border border-zinc-200 rounded-[1.5rem] bg-zinc-50/50 p-6 md:p-8 flex flex-col gap-6 relative group" key={`question-${questionIndex}`}>

                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-xs font-semibold text-rose-500 uppercase tracking-wider hover:text-rose-700 transition"
                      onClick={() => setQuestions((prev) => prev.filter((_, index) => index !== questionIndex))}>
                      Delete
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-full bg-zinc-950 text-white flex items-center justify-center font-mono text-sm font-medium">{questionIndex + 1}</span>
                  </div>

                  <div className="stack gap-2">
                    <label className="label text-zinc-700">Question Prompt</label>
                    <textarea
                      className="field min-h-[100px] resize-none rounded-[1rem] bg-white border-zinc-200 shadow-sm"
                      placeholder="Type the question content here..."
                      value={question.prompt}
                      onChange={(event) =>
                        setQuestions((prev) =>
                          prev.map((item, index) => (index === questionIndex ? { ...item, prompt: event.target.value } : item)),
                        )
                      }
                    />
                  </div>

                  <div className="stack gap-4 mt-2">
                    <label className="label text-zinc-700 mb-0">Multiple Options</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {question.options.map((option, optionIndex) => (
                        <div className={`relative border ${question.correctOptionIndex === optionIndex ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_0_2px_rgba(16,185,129,0.1)]' : 'border-zinc-200 bg-white shadow-sm'} rounded-[1rem] p-4 flex flex-col gap-3 transition-colors`} key={`question-${questionIndex}-option-${optionIndex}`}>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-400 font-mono tracking-widest uppercase">Opt {String.fromCharCode(65 + optionIndex)}</span>
                            {question.options.length > 2 ? (
                              <button
                                className="text-zinc-300 hover:text-rose-500 transition-colors"
                                title="Remove Option"
                                onClick={() =>
                                  setQuestions((prev) =>
                                    prev.map((item, index) => {
                                      if (index !== questionIndex) return item;
                                      const nextOptions = item.options.filter((_, idx) => idx !== optionIndex);
                                      let nextCorrect = item.correctOptionIndex;
                                      if (nextCorrect === optionIndex) nextCorrect = null;
                                      else if (typeof nextCorrect === "number" && nextCorrect > optionIndex) nextCorrect -= 1;
                                      return { ...item, options: nextOptions, correctOptionIndex: nextCorrect };
                                    })
                                  )
                                }
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                            ) : <div></div>}
                          </div>

                          <input
                            className="w-full bg-transparent border-none text-zinc-900 placeholder:text-zinc-300 font-medium focus:ring-0 outline-none p-0 text-sm"
                            placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                            value={option}
                            onChange={(event) =>
                              setQuestions((prev) =>
                                prev.map((item, index) => {
                                  if (index !== questionIndex) return item;
                                  const nextOptions = [...item.options];
                                  nextOptions[optionIndex] = event.target.value;
                                  return { ...item, options: nextOptions };
                                }),
                              )
                            }
                          />

                          <button
                            className={`text-[0.65rem] font-bold uppercase tracking-widest py-1.5 rounded-md transition-colors w-max px-3 border mt-1 ${question.correctOptionIndex === optionIndex ? 'bg-emerald-500 text-white border-emerald-500 cursor-default' : 'bg-transparent text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
                            onClick={() =>
                              setQuestions((prev) =>
                                prev.map((item, index) =>
                                  index === questionIndex
                                    ? { ...item, correctOptionIndex: optionIndex }
                                    : item,
                                ),
                              )
                            }
                          >
                            {question.correctOptionIndex === optionIndex ? "Correct Answer" : "Mark Correct"}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2">
                      <button
                        className="text-[0.75rem] font-semibold text-zinc-500 border border-dashed border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:text-zinc-700 transition"
                        onClick={() =>
                          setQuestions((prev) =>
                            prev.map((item, index) =>
                              index === questionIndex ? { ...item, options: [...item.options, ""] } : item,
                            ),
                          )
                        }
                      >
                        + Add Option
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>


        {/* CANDIDATES TAB */}
        <div className={`transition-opacity duration-300 ${activeTab === 'candidates' ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
          <section className="bg-white border border-zinc-200 rounded-[2rem] p-8 md:p-10 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.05)] stagger-3 fade-in mt-2 gap-8 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-6">
              <div>
                <h2 className="text-xl tracking-tight font-medium text-zinc-950">Approved Candidates</h2>
                <p className="text-zinc-500 text-sm mt-1">Whitelist candidates and define their exact login credentials.</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  onClick={() => setStudents((prev) => [{ candidateId: "", surname: "", displayName: "" }, ...prev])}
                >
                  + Add Student
                </button>
                <button className="btn btn-primary" onClick={() => void handleSaveStudents()} disabled={saving !== null}>
                  {saving === "students" ? "Saving..." : "Save List"}
                </button>
              </div>
            </div>

            <div className="table-wrap rounded-[1.5rem] overflow-hidden border border-zinc-200">
              <table className="w-full">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="font-semibold text-zinc-900 border-b border-zinc-200 uppercase tracking-widest text-[0.65rem] px-5 py-4">Identification</th>
                    <th className="font-semibold text-zinc-900 border-b border-zinc-200 uppercase tracking-widest text-[0.65rem] px-5 py-4">Surname (Password)</th>
                    <th className="font-semibold text-zinc-900 border-b border-zinc-200 uppercase tracking-widest text-[0.65rem] px-5 py-4">Display Name</th>
                    <th className="font-semibold text-zinc-900 border-b border-zinc-200 uppercase tracking-widest text-[0.65rem] px-5 py-4 w-16 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {students.map((student, studentIndex) => (
                    <tr key={`student-${studentIndex}`} className="group hover:bg-zinc-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <input
                          className="w-full bg-transparent border border-transparent focus:border-blue-500 rounded-md px-2 py-1.5 text-sm font-mono text-zinc-900 transition-all focus:bg-white outline-none"
                          placeholder="ID-001"
                          value={student.candidateId}
                          onChange={(event) =>
                            setStudents((prev) =>
                              prev.map((item, index) =>
                                index === studentIndex ? { ...item, candidateId: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <input
                          className="w-full bg-transparent border border-transparent focus:border-blue-500 rounded-md px-2 py-1.5 text-sm text-zinc-900 font-medium transition-all focus:bg-white outline-none"
                          placeholder="Adebayo"
                          value={student.surname}
                          onChange={(event) =>
                            setStudents((prev) =>
                              prev.map((item, index) =>
                                index === studentIndex ? { ...item, surname: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <input
                          className="w-full bg-transparent border border-transparent focus:border-blue-500 rounded-md px-2 py-1.5 text-sm text-zinc-900 transition-all focus:bg-white outline-none"
                          placeholder="John Adebayo"
                          value={student.displayName}
                          onChange={(event) =>
                            setStudents((prev) =>
                              prev.map((item, index) =>
                                index === studentIndex ? { ...item, displayName: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-zinc-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                          onClick={() => setStudents((prev) => prev.filter((_, index) => index !== studentIndex))}
                          title="Remove candidate"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="text-center p-8 text-sm text-zinc-400">No candidates whitelisted yet.</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>


      </main>
    </div>
  );
}
