"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

interface ExamSummary {
  examId: string;
  accessCode: string;
  title: string;
  startsAt: string;
  endsAt: string;
  candidateCount: number;
  questionCount: number;
}

interface ExamDetailData {
  exam: ExamSummary;
  questions: Array<{
    questionId: string;
    prompt: string;
    options: string[];
    correctOption: string;
  }>;
  students: Array<{
    candidateId: string;
    surname: string;
    displayName: string;
  }>;
}

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

export default function ExamDetailPage() {
  const { status } = useSession();
  const params = useParams<{ examId: string }>();
  const examId = params.examId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"details" | "questions" | "students" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [title, setTitle] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [students, setStudents] = useState<StudentDraft[]>([]);

  const loadExamDetail = useCallback(async () => {
    if (!examId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/lecturer/exams/${examId}`);
      const json: ApiResult<ExamDetailData> = await res.json();

      if (!json.ok) {
        setError(json.error?.message || "Failed to load exam.");
        return;
      }

      setExam(json.data.exam);
      setTitle(json.data.exam.title);
      setAccessCode(json.data.exam.accessCode);
      setStartsAt(json.data.exam.startsAt.slice(0, 16));
      setEndsAt(json.data.exam.endsAt.slice(0, 16));
      setQuestions(
        json.data.questions.map((question) => ({
          prompt: question.prompt,
          options: question.options.length > 0 ? question.options : ["", "", "", ""],
          correctOptionIndex: question.options.findIndex((option) => option === question.correctOption),
        })),
      );
      setStudents(json.data.students);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadExamDetail();
    }
  }, [status, loadExamDetail]);

  function addQuestion() {
    setQuestions((current) => [...current, { prompt: "", options: ["", "", "", ""], correctOptionIndex: null }]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  function updateQuestionPrompt(index: number, value: string) {
    setQuestions((current) => current.map((item, i) => (i === index ? { ...item, prompt: value } : item)));
  }

  function updateQuestionOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) =>
      current.map((item, i) => {
        if (i !== questionIndex) return item;
        const options = [...item.options];
        options[optionIndex] = value;

        let correctOptionIndex = item.correctOptionIndex;
        if (correctOptionIndex === optionIndex && value.trim().length === 0) {
          correctOptionIndex = null;
        }

        return { ...item, options, correctOptionIndex };
      }),
    );
  }

  function addQuestionOption(questionIndex: number) {
    setQuestions((current) =>
      current.map((item, i) => (i === questionIndex ? { ...item, options: [...item.options, ""] } : item)),
    );
  }

  function removeQuestionOption(questionIndex: number, optionIndex: number) {
    setQuestions((current) =>
      current.map((item, i) => {
        if (i !== questionIndex) return item;
        if (item.options.length <= 2) return item;

        const options = item.options.filter((_, idx) => idx !== optionIndex);
        let correctOptionIndex = item.correctOptionIndex;

        if (correctOptionIndex === optionIndex) {
          correctOptionIndex = null;
        } else if (correctOptionIndex !== null && correctOptionIndex > optionIndex) {
          correctOptionIndex -= 1;
        }

        return { ...item, options, correctOptionIndex };
      }),
    );
  }

  function setCorrectOption(questionIndex: number, optionIndex: number) {
    setQuestions((current) =>
      current.map((item, i) => (i === questionIndex ? { ...item, correctOptionIndex: optionIndex } : item)),
    );
  }

  function addStudent() {
    setStudents((current) => [...current, { candidateId: "", surname: "", displayName: "" }]);
  }

  function removeStudent(index: number) {
    setStudents((current) => current.filter((_, i) => i !== index));
  }

  function updateStudent(index: number, field: keyof StudentDraft, value: string) {
    setStudents((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  async function saveDetails() {
    if (!examId) {
      return;
    }

    setSaving("details");
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/lecturer/exams/${examId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          accessCode,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      });
      const json: ApiResult<{ exam: ExamSummary }> = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Failed to save exam details.");
        return;
      }

      setExam(json.data.exam);
      setNotice("Exam details updated.");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(null);
    }
  }

  async function saveQuestions() {
    if (!examId) {
      return;
    }

    setSaving("questions");
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/lecturer/exams/${examId}/questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: questions.map((question) => ({
            prompt: question.prompt,
            options: question.options,
            correctOption:
              question.correctOptionIndex === null
                ? ""
                : (question.options[question.correctOptionIndex] ?? ""),
          })),
        }),
      });

      const json: ApiResult<{ questionCount: number }> = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Failed to save questions.");
        return;
      }

      setNotice(`Questions updated (${json.data.questionCount}).`);
      await loadExamDetail();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(null);
    }
  }

  async function saveStudents() {
    if (!examId) {
      return;
    }

    setSaving("students");
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/lecturer/exams/${examId}/students`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students }),
      });

      const json: ApiResult<{ studentCount: number }> = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Failed to save students.");
        return;
      }

      setNotice(`Students updated (${json.data.studentCount}).`);
      await loadExamDetail();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="font-mono text-sm text-[var(--text-soft)]">Loading...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
        <p className="font-mono text-sm text-[var(--text-soft)]">You need to sign in.</p>
        <Link href="/admin" className="mt-4 font-mono text-xs text-[var(--text)] underline underline-offset-2">
          Go to admin sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
        <div className="ui-shell flex h-14 items-center gap-3">
          <Link href="/admin" className="font-mono text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors">
            ← Back
          </Link>
          <span className="font-display text-sm font-bold tracking-tight">{exam?.title ?? "Exam"}</span>
        </div>
      </header>

      <main className="ui-shell py-8">
        {error && <div className="mb-5 border-l-3 border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}
        {notice && <div className="mb-5 border-l-3 border-[var(--success)] bg-green-50 px-4 py-3 text-sm text-[var(--success)]">{notice}</div>}

        <section className="mb-8 border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-display text-lg font-bold">Exam Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="ui-label">Title</label>
              <input className="ui-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div>
              <label className="ui-label">Access Code</label>
              <input className="ui-input font-mono" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} />
            </div>
            <div>
              <label className="ui-label">Starts At</label>
              <input type="datetime-local" className="ui-input" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </div>
            <div>
              <label className="ui-label">Ends At</label>
              <input type="datetime-local" className="ui-input" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </div>
          </div>
          <button
            type="button"
            disabled={Boolean(saving)}
            onClick={() => void saveDetails()}
            className="mt-4 bg-[var(--black)] px-5 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
          >
            {saving === "details" ? "Saving..." : "Save Details"}
          </button>
        </section>

        <section className="mb-8 border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Questions ({questions.length})</h2>
            <button
              type="button"
              onClick={addQuestion}
              className="border border-[var(--border)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
            >
              + Add Question
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((question, questionIndex) => (
              <div key={questionIndex} className="border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-soft)]">Q{questionIndex + 1}</span>
                  <button type="button" onClick={() => removeQuestion(questionIndex)} className="font-mono text-[10px] text-[var(--danger)] hover:underline">
                    Remove
                  </button>
                </div>

                <input
                  className="ui-input mb-3"
                  value={question.prompt}
                  onChange={(event) => updateQuestionPrompt(questionIndex, event.target.value)}
                  placeholder="Question prompt"
                />

                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <div key={`${questionIndex}-${optionIndex}`} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${questionIndex}`}
                        checked={question.correctOptionIndex === optionIndex}
                        onChange={() => setCorrectOption(questionIndex, optionIndex)}
                        className="h-3.5 w-3.5 accent-[var(--black)]"
                      />
                      <input
                        className="ui-input !h-9 text-xs"
                        value={option}
                        onChange={(event) => updateQuestionOption(questionIndex, optionIndex, event.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeQuestionOption(questionIndex, optionIndex)}
                        className="font-mono text-[10px] text-[var(--danger)] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addQuestionOption(questionIndex)}
                  className="mt-2 border border-[var(--border)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
                >
                  + Add Option
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={Boolean(saving)}
            onClick={() => void saveQuestions()}
            className="mt-4 bg-[var(--black)] px-5 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
          >
            {saving === "questions" ? "Saving..." : "Save Questions"}
          </button>
        </section>

        <section className="border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Students ({students.length})</h2>
            <button
              type="button"
              onClick={addStudent}
              className="border border-[var(--border)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--black)] transition-colors"
            >
              + Add Student
            </button>
          </div>

          <div className="space-y-2">
            {students.map((student, index) => (
              <div key={index} className="grid gap-2 border border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input
                  className="ui-input !h-9 text-xs"
                  value={student.candidateId}
                  onChange={(event) => updateStudent(index, "candidateId", event.target.value)}
                  placeholder="Candidate ID"
                />
                <input
                  className="ui-input !h-9 text-xs"
                  value={student.surname}
                  onChange={(event) => updateStudent(index, "surname", event.target.value)}
                  placeholder="Surname"
                />
                <input
                  className="ui-input !h-9 text-xs"
                  value={student.displayName}
                  onChange={(event) => updateStudent(index, "displayName", event.target.value)}
                  placeholder="Display Name"
                />
                <button type="button" onClick={() => removeStudent(index)} className="font-mono text-[10px] text-[var(--danger)] hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={Boolean(saving)}
            onClick={() => void saveStudents()}
            className="mt-4 bg-[var(--black)] px-5 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--accent)] hover:bg-[#1a1a1a] disabled:opacity-40 transition-colors"
          >
            {saving === "students" ? "Saving..." : "Save Students"}
          </button>
        </section>
      </main>
    </div>
  );
}
