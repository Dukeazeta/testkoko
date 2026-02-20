import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
            <div className="animate-in">
                <p className="font-mono text-[120px] font-bold leading-none text-[var(--bg-deep)]">
                    404
                </p>
                <h1 className="font-display mt-2 text-2xl font-bold tracking-tight">
                    Page not found
                </h1>
                <p className="mt-3 max-w-sm text-sm text-[var(--text-muted)]">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <div className="mt-8 flex justify-center gap-3">
                    <Link
                        href="/"
                        className="inline-flex bg-[var(--black)] px-6 py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--accent)] hover:bg-[#1a1a1a] transition-colors"
                    >
                        Go Home
                    </Link>
                    <Link
                        href="/admin"
                        className="inline-flex border-2 border-[var(--border-strong)] px-6 py-3 text-[13px] font-bold uppercase tracking-wide text-[var(--text)] hover:border-[var(--black)] transition-colors"
                    >
                        Lecturer Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}
