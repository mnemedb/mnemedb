/**
 * /buy — $MNEME × o1 relaunch holding page.
 *
 * The old-CA Qwerti checkout is retired. This page announces the o1
 * relaunch; the new contract address + buy flow go live at launch.
 */
export function Buy() {
  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased selection:bg-gold-400/30 selection:text-white">
      {/* ────── Top bar ───────────────────────────────────────────────── */}
      <header className="border-b border-ink-900">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <img
              src="/mnemelogo.png"
              alt="Mneme"
              className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <span className="font-semibold tracking-tight text-lg">Mneme</span>
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-gold-300/60 ml-2 pl-2 border-l border-ink-800">
              on Base
            </span>
          </a>
          <a href="/" className="text-xs text-ink-400 hover:text-white transition">
            ← Back to home
          </a>
        </div>
      </header>

      {/* ────── Hero ──────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-16 md:py-20">
        <div className="text-center space-y-6 mb-14">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80">
            mneme × o1
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gold-300">$MNEME</span> Relaunch
            <br />
            Coming Soon
          </h1>
          <p className="text-lg text-ink-300 max-w-xl mx-auto leading-relaxed">
            $MNEME is relaunching through o1. The new contract address and
            buy flow will be announced here the moment we go live.
          </p>
        </div>

        {/* ────── Status card ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-b from-ink-900/80 to-ink-950 border border-ink-800 rounded-2xl p-8 md:p-10 max-w-2xl mx-auto">
          <div className="space-y-3">
            <Row label="Token">
              <span className="text-gold-300 font-semibold">$MNEME</span>
            </Row>
            <Row label="Status">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gold-300 shadow-[0_0_6px_rgba(212,175,55,0.6)] animate-pulse"></span>
                o1 relaunch in progress
              </span>
            </Row>
            <Row label="New contract">
              <span className="font-mono text-[12px] text-ink-300">TBA — announced at launch</span>
            </Row>
            <Row label="Follow along">
              <a
                href="https://x.com/mnemeDB"
                target="_blank" rel="noreferrer"
                className="text-gold-300 hover:text-gold-200 underline underline-offset-2"
              >
                @mnemeDB ↗
              </a>
            </Row>
          </div>
        </div>

        {/* ────── Utility section ──────────────────────────────────────── */}
        <div className="mt-14 max-w-2xl mx-auto space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 text-center">
            what $MNEME unlocks
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <UtilityCard
              title="Storage"
              body="Burn $MNEME → extend your wallet-bound R2 storage quota."
            />
            <UtilityCard
              title="Priority LLM"
              body="Higher-tier model + larger context window for /chat and text-to-SQL."
            />
            <UtilityCard
              title="Coming soon"
              body="Staking, gov, fee discounts on premium agent tools."
            />
          </div>
        </div>

        {/* ────── Footer ──────────────────────────────────────────────── */}
        <div className="text-center text-xs text-ink-500 mt-14 space-y-1">
          <div>
            Not financial advice. Memecoin volatility applies. Read the{" "}
            <a href="/docs" className="text-ink-300 hover:text-white underline underline-offset-2">
              docs
            </a>{" "}
            before transacting.
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-500 shrink-0">{label}</span>
      <span className="text-ink-200 text-right">{children}</span>
    </div>
  );
}

function UtilityCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-ink-900/60 border border-ink-800 rounded-xl p-4 space-y-1.5">
      <div className="text-sm font-semibold text-gold-300/90">{title}</div>
      <div className="text-xs text-ink-400 leading-relaxed">{body}</div>
    </div>
  );
}
