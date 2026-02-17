import Link from "next/link";

const decisions = [
  "Login with candidateId + surname only",
  "candidateId accepts matric number or exam number",
  "Default single-session mode is BlockNew",
  "Admin candidate edits allowed before exam start only",
  "Autosave every 4 seconds with idempotent upsert",
  "Server is source of truth for timer and strike logic",
];

const edgeCases = [
  "Network drop and reconnect reconciliation",
  "Double-submit race at timeout boundary",
  "Tab hide false positives and strike thresholds",
  "Session takeover behavior for BlockNew and KickOld",
  "Question order audit trail for dispute resolution",
  "Rate-limited auth failures without account leakage",
];

export default function Home() {
  return (
    <div className="texture min-h-screen px-5 py-10 md:px-10">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)]/85 p-6 shadow-sm backdrop-blur md:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            TestKOKO build kickoff
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
            Planning is locked. Foundation is now scaffolded.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 md:text-base">
            We start with a mobile-first Next.js app and formalize anti-cheat,
            session, and submission behavior before feature coding.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-white transition-opacity hover:opacity-90"
              href="/docs/mvp-implementation-plan"
            >
              Open MVP Plan
            </Link>
            <span className="rounded-full border border-[var(--stroke)] px-5 py-2 font-mono text-xs uppercase tracking-[0.12em]">
              Session default: BlockNew
            </span>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
            <h2 className="text-xl font-semibold">Confirmed Decisions</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6">
              {decisions.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
            <h2 className="text-xl font-semibold">Resolved Edge Cases</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6">
              {edgeCases.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">Next Module Targets</h2>
          <p className="mt-3 text-sm leading-7">
            Implement auth/session APIs, exam runtime autosave pipeline, and
            event-strike processing against the contracts in
            `src/lib/exam` and `src/lib/auth`.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.1em] text-[var(--accent)]">
            Build with pnpm only
          </p>
        </section>
      </main>
    </div>
  );
}
