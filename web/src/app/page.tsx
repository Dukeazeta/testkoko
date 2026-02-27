import Link from "next/link";

function TopNav() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center mt-6 fade-in px-4">
      <nav className="bg-white/70 backdrop-blur-xl border border-zinc-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-full px-6 py-3 flex items-center justify-between w-full max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-950 rounded-[8px] flex items-center justify-center shadow-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
          </div>
          <span className="font-bold text-zinc-900 tracking-tight">TestKOKO</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-500">
          <Link href="#features" className="hover:text-zinc-900 transition-colors">Features</Link>
          <Link href="#platform" className="hover:text-zinc-900 transition-colors">Platform</Link>
          <Link href="#security" className="hover:text-zinc-900 transition-colors">Security</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors hidden sm:block">
            Sign In
          </Link>
          <Link href="/admin" className="bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-medium px-5 py-2 rounded-full transition-all hover:scale-105 shadow-md">
            Get Started
          </Link>
        </div>
      </nav>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative pt-40 pb-20 md:pt-52 md:pb-32 overflow-hidden flex flex-col items-center text-center px-4">
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/10 blur-[120px] rounded-[100%] pointer-events-none -z-10"></div>

      <div className="stagger-1 fade-in flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200/50 bg-blue-50/50 text-blue-700 text-xs font-semibold uppercase tracking-widest mb-8 shadow-[inset_0_1px_4px_rgba(255,255,255,0.5)] backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Next Gen Assessment
        </div>

        <h1 className="text-6xl md:text-8xl font-medium tracking-tighter text-zinc-950 max-w-5xl leading-[0.95] mb-8">
          Evaluation. <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400">Engineered to Perfection.</span>
        </h1>

        <p className="text-lg md:text-xl text-zinc-500 max-w-2xl font-medium leading-relaxed mb-10">
          A vastly superior examination protocol. Eliminate academic friction with a platform designed for both absolute secure control and unparalleled ease of use.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link href="/admin" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-base md:text-lg font-medium px-8 py-4 rounded-full transition-all shadow-[0_8px_30px_rgba(37,99,235,0.3)] hover:shadow-[0_8px_40px_rgba(37,99,235,0.4)] hover:-translate-y-1 flex items-center justify-center gap-2">
            Launch Platform
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </Link>
          <a href="#platform" className="w-full sm:w-auto bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 text-base md:text-lg font-medium px-8 py-4 rounded-full transition-all shadow-sm hover:shadow-md flex items-center justify-center">
            Explore Features
          </a>
        </div>
      </div>
    </section>
  );
}

function PlatformPreview() {
  return (
    <section className="px-4 pb-32 max-w-7xl mx-auto stagger-2 fade-in" id="platform">
      <div className="w-full relative rounded-[2rem] md:rounded-[3rem] border border-zinc-200/80 bg-white/40 backdrop-blur-3xl p-2 md:p-4 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.1)] overflow-hidden">
        {/* Decorative inner gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/80 to-transparent pointer-events-none"></div>

        <div className="w-full border border-zinc-200/50 bg-zinc-50 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl relative">

          {/* Header Bar */}
          <div className="h-14 border-b border-zinc-200/60 bg-white/80 backdrop-blur flex items-center px-6 justify-between flex-shrink-0">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-zinc-200"></div>
              <div className="w-3 h-3 rounded-full bg-zinc-200"></div>
              <div className="w-3 h-3 rounded-full bg-zinc-200"></div>
            </div>
            <div className="w-48 h-6 bg-zinc-100 rounded-md"></div>
            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            </div>
          </div>

          {/* Dashboard Body */}
          <div className="p-6 md:p-10 flex flex-col lg:flex-row gap-6 bg-zinc-50 h-[400px] md:h-[600px] overflow-hidden">
            {/* Sidebar */}
            <div className="w-full lg:w-64 flex flex-col gap-4 hidden lg:flex">
              <div className="h-10 bg-white border border-zinc-200 rounded-xl"></div>
              <div className="h-10 bg-zinc-200/50 rounded-xl"></div>
              <div className="h-10 bg-zinc-200/50 rounded-xl"></div>
              <div className="mt-auto h-32 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50 rounded-xl p-4">
                <div className="w-10 h-10 bg-blue-500 rounded-lg mb-4"></div>
                <div className="h-4 w-3/4 bg-blue-200 rounded-md mb-2"></div>
                <div className="h-4 w-1/2 bg-blue-200 rounded-md"></div>
              </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col gap-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm text-center lg:text-left">
                  <div className="h-4 w-24 bg-zinc-200 rounded-md mb-4 mx-auto lg:mx-0"></div>
                  <div className="h-10 w-16 bg-zinc-900 rounded-lg mb-2 mx-auto lg:mx-0"></div>
                </div>
                <div className="flex-1 bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm filter blur-[1px]"></div>
                <div className="flex-1 bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm filter blur-[2px]"></div>
              </div>

              <div className="flex-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 overflow-hidden relative">
                {/* Graph Mockup */}
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-blue-50 to-transparent"></div>
                <svg className="absolute inset-x-0 bottom-10 w-full h-32 text-blue-500" preserveAspectRatio="none" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 100 Q 15 50 30 70 T 70 30 T 100 80 V 100 Z" fill="currentColor" fillOpacity="0.1" />
                  <path d="M0 100 Q 15 50 30 70 T 70 30 T 100 80" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

                <div className="flex justify-between items-center border-[0.5px] border-zinc-100 p-4 mb-3 rounded-xl bg-zinc-50 relative z-10 w-full lg:w-3/4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-zinc-200 rounded-full"></div>
                    <div className="flex flex-col gap-1.5"><div className="w-20 h-3 bg-zinc-300 rounded-sm"></div><div className="w-12 h-2 bg-zinc-200 rounded-sm"></div></div>
                  </div>
                  <div className="w-24 h-6 border border-emerald-200 bg-emerald-50 rounded-full"></div>
                </div>
                <div className="flex justify-between items-center border-[0.5px] border-zinc-100 p-4 rounded-xl bg-zinc-50 relative z-10 w-full lg:w-3/4 translate-x-4 opacity-70">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-zinc-200 rounded-full"></div>
                    <div className="flex flex-col gap-1.5"><div className="w-20 h-3 bg-zinc-300 rounded-sm"></div><div className="w-12 h-2 bg-zinc-200 rounded-sm"></div></div>
                  </div>
                  <div className="w-24 h-6 border border-rose-200 bg-rose-50 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GridFeatures() {
  return (
    <section className="px-4 py-20 bg-zinc-950 text-zinc-50" id="features">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">

        <div className="text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-8 stagger-3 fade-in">
          <div>
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight max-w-lg leading-tight text-white">
              An ecosystem built for absolute control.
            </h2>
          </div>
          <p className="text-zinc-400 max-w-md font-medium text-lg">
            We discarded legacy clunkiness. Every pixel exists to make examination creation, delivery, and analysis flawless.
          </p>
        </div>

        {/* Bento Grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-4 fade-in">

          {/* Large Card */}
          <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 md:p-12 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity">
              <svg className="w-32 h-32 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-blue-500/20">Real-time</span>
              </div>
              <h3 className="text-3xl font-medium tracking-tight mb-4 text-white">Live Monitoring Matrix</h3>
              <p className="text-zinc-400 text-lg leading-relaxed max-w-md mb-8">
                Watch your candidates take the examination live. Detect tab switching, disconnection events, and unexpected behavior the precise millisecond it happens.
              </p>

              <div className="mt-auto h-40 bg-zinc-950/50 border border-zinc-800 rounded-xl p-6 flex flex-col justify-end gap-3 w-full max-w-lg mb-2 group-hover:-translate-y-2 transition-transform duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><div className="w-16 h-3 bg-zinc-800 rounded"></div></div>
                  <div className="text-xs font-mono text-zinc-500">Active</div>
                </div>
                <div className="flex items-center justify-between bg-zinc-900 -mx-2 px-2 py-1 rounded-lg border border-zinc-800 shadow-lg">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div><div className="w-20 h-3 bg-zinc-700 rounded"></div></div>
                  <div className="text-xs font-mono text-amber-500">Focus Lost · 2s ago</div>
                </div>
              </div>
            </div>
          </div>

          {/* Small Card 1 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 md:p-10 flex flex-col group hover:bg-zinc-800/80 transition-colors">
            <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-center mb-6 text-zinc-300 shadow-inner">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
            </div>
            <h3 className="text-2xl font-medium tracking-tight mb-3 text-white">Streamlined Editor</h3>
            <p className="text-zinc-400 leading-relaxed mb-6 flex-1">
              A pristine, three-tab interface. Define parameters, curate questions, and whitelist candidate IDs without losing context.
            </p>
          </div>

          {/* Small Card 2 */}
          <div className="bg-[#09090b] border border-blue-900/40 rounded-[2rem] p-8 md:p-10 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent"></div>
            <div className="w-14 h-14 bg-blue-950 border border-blue-900 rounded-2xl flex items-center justify-center mb-6 text-blue-400 relative z-10">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            </div>
            <h3 className="text-2xl font-medium tracking-tight mb-3 text-white relative z-10">Total Security</h3>
            <p className="text-zinc-400 leading-relaxed mb-6 flex-1 relative z-10">
              State-of-the-art automated submission enforcement. Local storage recovery, and strict focus verification mapping.
            </p>
          </div>

          {/* Wide Feature */}
          <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 text-center flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden group">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CgkJPGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzZjNmNDYiLz4KPC9zdmc+')] opacity-20"></div>

            <h2 className="text-3xl font-medium tracking-tight text-white mb-2 relative z-10">Zero Distraction Environment</h2>
            <p className="text-zinc-500 font-medium relative z-10 max-w-md mx-auto">
              Candidate interfaces strip away all UI noise, leaving only what's necessary to excel. Pure semantic clarity.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-32 px-4 flex flex-col items-center text-center relative overflow-hidden bg-white">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-50/50 rounded-full blur-[100px] pointer-events-none -z-10 translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-zinc-100 rounded-full blur-[100px] pointer-events-none -z-10 -translate-x-1/2 translate-y-1/2"></div>

      <h2 className="text-5xl md:text-6xl font-medium tracking-tighter text-zinc-950 mb-6">
        Ready to upgrade?
      </h2>
      <p className="text-xl text-zinc-500 max-w-2xl font-medium mb-10">
        Deploy secure, scalable examinations in minutes, not days.
      </p>
      <Link href="/admin" className="bg-zinc-950 hover:bg-zinc-800 text-white text-lg font-medium px-10 py-4 rounded-full transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1">
        Start using TestKOKO
      </Link>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 py-12 px-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-zinc-950 rounded-[4px] flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
          </div>
          <span className="font-bold text-zinc-900 tracking-tight text-sm">TestKOKO</span>
          <span className="text-zinc-400 text-sm ml-2">© {new Date().getFullYear()}</span>
        </div>

        <div className="flex items-center gap-6 text-sm font-medium text-zinc-500">
          <Link href="/admin" className="hover:text-zinc-900 transition-colors">Lecturer Portal</Link>
          <a href="#" className="hover:text-zinc-900 transition-colors">Documentation</a>
          <a href="#" className="hover:text-zinc-900 transition-colors">Privacy</a>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-white overflow-hidden text-zinc-900 selection:bg-blue-200 selection:text-blue-900">
      <TopNav />
      <Hero />
      <PlatformPreview />
      <GridFeatures />
      <FinalCTA />
      <Footer />
    </div>
  );
}
