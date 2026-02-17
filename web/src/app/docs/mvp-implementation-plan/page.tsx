import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MVP Implementation Plan | TestKOKO",
  description: "Locked architecture and edge-case decisions for MVP",
};

const phases = [
  "Phase 1: Data model and contracts",
  "Phase 2: Candidate login and one-session control",
  "Phase 3: Exam runtime and autosave",
  "Phase 4: Event logging and strike escalation",
  "Phase 5: Admin monitoring and intervention actions",
  "Phase 6: Reliability and load verification",
];

const defaults = [
  "Authentication: candidateId + surname",
  "candidateId supports matric number or exam number",
  "Session policy default: BlockNew",
  "Candidate roster edits: before exam start only",
  "Autosave interval: 4 seconds",
  "Rate limit: 5 failed logins per 15 minutes",
];

const risks = [
  "Intermittent network during autosave and submit",
  "Duplicate final submission due to timeout race",
  "False-positive hidden-tab detection",
  "Session hijack or token replay attempts",
  "Admin misuse of force submit or time extension",
];

export default function MvpImplementationPlanPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-12 md:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
        TestKOKO planning
      </p>
      <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
        MVP Implementation Plan
      </h1>
      <p className="mt-4 text-sm leading-7">
        This plan converts the PRD into a build sequence with locked behavior
        for identity, anti-cheat events, session policy, and submission
        finalization.
      </p>

      <section className="mt-10 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold">Phases</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {phases.map((phase) => (
            <li key={phase}>{phase}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold">Locked Defaults</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {defaults.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold">Edge-Case Coverage</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
