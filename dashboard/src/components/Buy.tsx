import { useState } from "react";

const MNEME_CA = "0x3FcDbEBD5e7BaB79477cFDcA2CDCF6e904C27b07";
const BASE_CHAIN_ID = 8453;
const QWERTI_MAGIC_LINK = `https://app.qwerti.ai/buy/${MNEME_CA.toLowerCase()}/${BASE_CHAIN_ID}?campaign=mneme`;

/**
 * /buy — dedicated checkout page. The Qwerti widget auto-opens via the
 * data-auto-open="true" attribute on the script tag in buy/index.html.
 * If for any reason it doesn't appear (popup blocked, JS failed, etc.),
 * the manual magic-link below always works.
 */
export function Buy() {
  const [copied, setCopied] = useState(false);

  const copyCa = () => {
    navigator.clipboard.writeText(MNEME_CA).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

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
            mneme × qwerti
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            Buy <span className="text-gold-300">$MNEME</span>
          </h1>
          <p className="text-lg text-ink-300 max-w-xl mx-auto leading-relaxed">
            The Qwerti checkout widget should open automatically.
            If it doesn't, use the direct link below.
          </p>
        </div>

        {/* ────── Manual fallback CTA ─────────────────────────────────── */}
        <div className="bg-gradient-to-b from-ink-900/80 to-ink-950 border border-ink-800 rounded-2xl p-8 md:p-10 max-w-2xl mx-auto">
          <div className="space-y-6">
            <div className="text-center">
              <a
                href={QWERTI_MAGIC_LINK}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gold-300 text-black font-semibold hover:bg-gold-200 transition text-base"
              >
                Open Qwerti checkout
                <span className="opacity-60">→</span>
              </a>
              <div className="text-xs text-ink-500 mt-3">
                Opens app.qwerti.ai in a new tab
              </div>
            </div>

            <div className="border-t border-ink-800 pt-6 space-y-3">
              <Row label="Token">
                <span className="text-gold-300 font-semibold">$MNEME</span>
              </Row>
              <Row label="Network">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"></span>
                  Base mainnet · chain id 8453
                </span>
              </Row>
              <Row label="Contract">
                <button
                  onClick={copyCa}
                  className="font-mono text-[12px] hover:text-gold-200 transition inline-flex items-center gap-2 group"
                  title={copied ? "Copied!" : "Click to copy"}
                >
                  <span>{MNEME_CA}</span>
                  <span className="text-ink-500 group-hover:text-gold-300">
                    {copied ? "✓" : "⧉"}
                  </span>
                </button>
              </Row>
              <Row label="Launchpad">
                <a
                  href={`https://clanker.world/clanker/${MNEME_CA}`}
                  target="_blank" rel="noreferrer"
                  className="text-gold-300 hover:text-gold-200 underline underline-offset-2"
                >
                  clanker.world ↗
                </a>
              </Row>
              <Row label="Chart">
                <a
                  href={`https://dexscreener.com/base/${MNEME_CA.toLowerCase()}`}
                  target="_blank" rel="noreferrer"
                  className="text-gold-300 hover:text-gold-200 underline underline-offset-2"
                >
                  dexscreener ↗
                </a>
              </Row>
              <Row label="Explorer">
                <a
                  href={`https://basescan.org/token/${MNEME_CA}`}
                  target="_blank" rel="noreferrer"
                  className="text-gold-300 hover:text-gold-200 underline underline-offset-2"
                >
                  basescan ↗
                </a>
              </Row>
            </div>
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
          <div className="text-ink-600">
            Checkout powered by{" "}
            <a href="https://qwerti.ai" target="_blank" rel="noreferrer" className="text-ink-400 hover:text-white transition">
              Qwerti
            </a>
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
