import Link from "next/link";

const features = [
  {
    icon: "🔒",
    title: "Single-Session Integrity",
    description:
      "Duplicate sessions are automatically blocked or revoked. Every request is validated against active tokens — no shortcuts, no workarounds.",
  },
  {
    icon: "💾",
    title: "Reliable Autosave",
    description:
      "Student answers save every few seconds. Race-safe submission logic prevents duplicate finals so nothing is ever lost.",
  },
  {
    icon: "📡",
    title: "Live Monitoring",
    description:
      "See which students are active, disconnected, or flagged in real time. Export results to CSV the moment the exam ends.",
  },
  {
    icon: "🛡️",
    title: "Anti-Cheat Detection",
    description:
      "Tab-switches, disconnects, and suspicious behavior are logged automatically with a configurable strike escalation system.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your exam",
    description:
      "Sign up, set your access window, configure strike thresholds, and add your questions — all from one dashboard.",
  },
  {
    number: "02",
    title: "Share with students",
    description:
      "Upload your class roster via CSV, then share the exam access code. Students sign in with their ID and surname.",
  },
  {
    number: "03",
    title: "Monitor & export",
    description:
      "Watch activity live during the exam. When it ends, download results as a CSV with one click.",
  },
];

const stats = [
  { value: "< 1s", label: "Autosave interval" },
  { value: "100%", label: "Browser-based" },
  { value: "0", label: "Installations required" },
  { value: "CSV", label: "Result export format" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
        <div className="ui-shell flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-[var(--black)] font-mono text-[10px] font-bold tracking-wider text-[var(--accent)]">
              TK
            </div>
            <span className="font-display text-sm font-bold tracking-tight">
              TestKOKO
            </span>
          </div>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a href="#features" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/admin" className="hidden text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors md:inline-flex">
              Lecturer Sign In
            </Link>
            <Link href="/admin" className="ui-btn-primary inline-flex">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="ui-shell py-20 md:py-32">
          <div className="max-w-3xl animate-in">
            <div className="mb-5 inline-block bg-[var(--bg-deep)] px-3 py-1">
              <span className="font-mono text-[11px] font-medium text-[var(--text-muted)]">
                Secure exam platform for universities
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-extrabold leading-[1.08] tracking-[-0.04em]">
              Run exams your students
              <br className="hidden sm:block" />
              can&apos;t cheat on.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--text-muted)] md:text-lg md:leading-8">
              TestKOKO gives lecturers a simple, browser-based platform to create exams, monitor students in real time, and export results. Students only access exams through links and codes shared by their lecturer.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4 animate-in delay-1">
            <Link href="/admin" className="inline-flex bg-[var(--black)] px-7 py-3.5 text-[13px] font-bold uppercase tracking-wide text-[var(--accent)] hover:bg-[#1a1a1a] transition-colors">
              Create Your First Exam
            </Link>
            <Link href="/admin" className="inline-flex border-2 border-[var(--border-strong)] px-7 py-3.5 text-[13px] font-bold uppercase tracking-wide text-[var(--text)] hover:border-[var(--black)] transition-colors">
              Lecturer Sign In
            </Link>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-2 gap-px bg-[var(--border)] md:grid-cols-4 animate-in delay-2">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-[var(--surface)] p-5">
                <p className="font-display text-2xl font-bold">{stat.value}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-soft)]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="border-t border-[var(--border)] bg-[var(--surface)]">
          <div className="ui-shell py-20 md:py-28">
            <div className="mb-12">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-soft)]">
                Features
              </span>
              <h2 className="font-display mt-3 max-w-lg text-3xl font-bold tracking-tight md:text-4xl">
                Everything you need. Nothing you don&apos;t.
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="border border-[var(--border)] p-6 md:p-8 transition-colors hover:border-[var(--border-strong)]"
                >
                  <span className="text-2xl">{feature.icon}</span>
                  <h3 className="font-display mt-4 text-lg font-bold">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="border-t border-[var(--border)]">
          <div className="ui-shell py-20 md:py-28">
            <div className="mb-12">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-soft)]">
                How it works
              </span>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                Three steps to a secure exam.
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number}>
                  <span className="font-mono text-[48px] font-bold leading-none text-[var(--bg-deep)]">
                    {step.number}
                  </span>
                  <h3 className="font-display mt-2 text-lg font-bold">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-[var(--border)]">
          <div className="ui-shell py-20 md:py-28">
            <div className="bg-[var(--black)] p-10 md:p-16">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl font-bold text-white md:text-4xl">
                  Ready to run your
                  <br />
                  first secure exam?
                </h2>
                <p className="mt-4 text-sm leading-6 text-[var(--text-soft)]">
                  Create a free account, build your exam, upload your roster, and go live — it takes less than 10 minutes.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/admin"
                    className="inline-flex bg-[var(--accent)] px-7 py-3.5 text-[13px] font-bold uppercase tracking-wide text-[var(--black)] hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    Get Started Free
                  </Link>
                  <Link
                    href="/admin"
                    className="inline-flex border-2 border-[var(--border-strong)] px-7 py-3.5 text-[13px] font-bold uppercase tracking-wide text-white hover:border-white transition-colors"
                  >
                    Lecturer Sign In
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="ui-shell py-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center bg-[var(--black)] font-mono text-[8px] font-bold text-[var(--accent)]">
                  TK
                </div>
                <span className="font-display text-sm font-bold tracking-tight">TestKOKO</span>
              </div>
              <p className="mt-3 max-w-xs text-sm text-[var(--text-muted)]">
                Browser-based exam platform with anti-cheat detection, live monitoring, and instant result export.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                  Platform
                </p>
                <ul className="mt-3 space-y-2">
                  <li><a href="#features" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Features</a></li>
                  <li><a href="#how-it-works" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">How it works</a></li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                  Access
                </p>
                <ul className="mt-3 space-y-2">
                  <li><Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Lecturer Dashboard</Link></li>
                  <li><Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Lecturer Sign In</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-[var(--border)] pt-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="font-mono text-[11px] text-[var(--text-soft)]">
              © {new Date().getFullYear()} TestKOKO. All rights reserved.
            </p>
            <p className="font-mono text-[11px] text-[var(--text-soft)]">
              Built for institutions that demand integrity.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
