import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page justify-center fade-in">
      <main className="shell flex items-center justify-center min-h-[70vh]">
        <section className="flex flex-col items-center text-center max-w-md stagger-1">
          <div className="w-20 h-20 bg-zinc-50 border border-zinc-200 rounded-3xl flex items-center justify-center mb-8 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
            <span className="text-zinc-400 font-mono text-2xl font-medium">404</span>
          </div>

          <h1 className="text-4xl tracking-tight font-medium text-zinc-950 mb-4">
            Page not found
          </h1>

          <p className="text-zinc-500 text-base mb-10 leading-relaxed">
            The page you are looking for doesn't exist or has been moved to another coordinate.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link className="btn btn-secondary w-full sm:w-auto px-8" href="/">
              Return Home
            </Link>
            <Link className="btn btn-primary w-full sm:w-auto px-8" href="/admin">
              Lecturer Portal
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
