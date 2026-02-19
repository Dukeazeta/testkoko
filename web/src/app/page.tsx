import Link from "next/link";

const capabilities = [
  {
    title: "Single-session exam integrity",
    description: "Block or revoke duplicate sessions automatically with active-token validation on every request.",
  },
  {
    title: "Reliable autosave and submission",
    description: "Answers save every few seconds with race-safe submission logic to prevent duplicate finals.",
  },
  {
    title: "Live admin monitoring",
    description: "Track candidate activity in real time and apply actions instantly when intervention is needed.",
  },
  {
    title: "Evidence-first anti-cheat",
    description: "Visibility, disconnect, and suspicious behavior events are logged into auditable candidate timelines.",
  },
  {
    title: "Similarity review",
    description: "Run answer and timing similarity checks to surface suspicious pairs for human review.",
  },
  {
    title: "Operational analytics and export",
    description: "Monitor core KPIs and export audit packages for institutional dispute handling.",
  },
];

const metrics = [
  { label: "Submission Reliability", value: "99.7%+" },
  { label: "Autosave Target", value: "4s" },
  { label: "Dashboard Refresh", value: "<2s" },
  { label: "Duplicate Submissions", value: "0" },
];

const workflow = [
  {
    title: "Create and schedule exam",
    description: "Set access window, strike thresholds, and question set from the admin console.",
  },
  {
    title: "Upload roster and start session",
    description: "Import candidates by CSV and allow secure candidate sign-in for the scheduled exam.",
  },
  {
    title: "Monitor, review, and export",
    description: "Use monitoring, similarity insights, and audit export to complete the exam lifecycle.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="ui-shell flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-black text-xs font-semibold text-white">TK</div>
            <span className="font-heading text-base font-semibold">TestKOKO</span>
          </div>

          <nav className="hidden items-center gap-7 text-sm text-neutral-600 md:flex">
            <a href="#capabilities" className="hover:text-black">
              Capabilities
            </a>
            <a href="#workflow" className="hover:text-black">
              Workflow
            </a>
            <Link href="/docs/mvp-implementation-plan" className="hover:text-black">
              Docs
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/admin" className="ui-btn-secondary hidden md:inline-flex">
              Admin
            </Link>
            <Link href="/candidate" className="ui-btn-primary inline-flex">
              Candidate
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="ui-shell py-16 md:py-24">
          <p className="ui-kicker">Secure examination platform</p>
          <h1 className="font-heading mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            Clean, reliable CBT infrastructure for institutions.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 md:text-lg">
            TestKOKO provides candidate runtime, anti-cheat evidence, live monitoring, similarity review, and audit-ready outputs in one
            minimal workflow.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/candidate" className="ui-btn-primary inline-flex">
              Open Candidate Console
            </Link>
            <Link href="/admin" className="ui-btn-secondary inline-flex">
              Open Admin Console
            </Link>
          </div>
        </section>

        <section className="border-y border-neutral-200 bg-neutral-50 py-8">
          <div className="ui-shell grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((item) => (
              <article key={item.label} className="ui-card p-4">
                <p className="font-heading text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-sm text-neutral-600">{item.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="capabilities" className="ui-shell py-14 md:py-20">
          <div className="mb-8">
            <p className="ui-kicker">Capabilities</p>
            <h2 className="font-heading mt-2 text-2xl font-semibold md:text-3xl">Everything needed for controlled exam delivery.</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => (
              <article key={item.title} className="ui-card p-5">
                <h3 className="font-heading text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="ui-shell pb-14 md:pb-20">
          <div className="mb-8">
            <p className="ui-kicker">Workflow</p>
            <h2 className="font-heading mt-2 text-2xl font-semibold md:text-3xl">Simple three-step operations.</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {workflow.map((item, index) => (
              <article key={item.title} className="ui-muted-card p-5">
                <p className="ui-kicker">Step {index + 1}</p>
                <h3 className="font-heading mt-2 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ui-shell pb-14 md:pb-20">
          <div className="ui-card flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center md:p-8">
            <div>
              <p className="ui-kicker">Start now</p>
              <p className="font-heading mt-2 text-xl font-semibold">Run the full candidate and admin flow in your sandbox.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/candidate" className="ui-btn-primary inline-flex">
                Candidate
              </Link>
              <Link href="/admin" className="ui-btn-secondary inline-flex">
                Admin
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 py-6">
        <div className="ui-shell flex flex-col gap-3 text-sm text-neutral-600 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} TestKOKO</p>
          <div className="flex items-center gap-4">
            <Link href="/candidate" className="hover:text-black">
              Candidate
            </Link>
            <Link href="/admin" className="hover:text-black">
              Admin
            </Link>
            <Link href="/docs/mvp-implementation-plan" className="hover:text-black">
              Docs
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
