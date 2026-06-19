import { useState } from "react";

const SKILL_PACK_URL = "https://github.com/mnemedb/metamask-skill-pack-mneme";
const APPLY_URL      = "https://link.metamask.io/card-onboarding";

/**
 * Public landing at /metamask — positions Mneme as the memory + intent
 * layer for MetaMask Agentic Wallet. No auth required.
 */
export function MetaMaskLanding() {
  const [copied, setCopied] = useState(false);
  const codeBlock = `// 1. write the mandate
const m = await mneme.mandates.create({
  kind:  "swap",
  title: "auto-DCA into MNEME on a 5% dip",
  intent:     { from_token: "USDC", to_token: "MNEME", amount_usdc: 100 },
  conditions: { when: "on_event", spec: { table: "mneme_prices", op: "lt", value: 0.10 } },
  spend_cap_usdc: 1000,
  risk_profile:   { max_slippage: 0.01, allowed_protocols: ["uniswap-v3"] },
  wallet_provider: "metamask",
});

// 2. compile to ERC-7715 wallet_requestExecutionPermissions
const { jsonrpc } = await mneme.mandates.toErc7715(m.id);

// 3. ship it to the wallet
const response = await window.ethereum.request(jsonrpc);

// 4. persist the granted delegation context for ERC-7710 redemption
await mneme.mandates.grant(m.id, {
  context:           response.context,
  delegationManager: response.delegationManager,
});`;

  const copy = () => {
    navigator.clipboard.writeText(codeBlock).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased selection:bg-gold-400/30 selection:text-white">

      {/* ────── nav ───────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 max-w-7xl mx-auto">
        <a href="/" className="flex items-center gap-2.5 group">
          <img src="/mnemelogo.png" alt="Mneme" className="h-8 w-auto object-contain transition-transform group-hover:scale-105" />
          <span className="font-semibold tracking-tight text-lg">Mneme</span>
          <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-gold-300/60 ml-2 pl-2 border-l border-ink-800">on Base</span>
        </a>
        <div className="flex items-center gap-5 text-sm">
          <a href="/docs" className="hidden md:inline text-ink-400 hover:text-white transition">Docs</a>
          <a href="/buy"  className="hidden sm:inline px-3 py-1.5 rounded-lg border border-gold-300/40 text-gold-300 hover:bg-gold-300/10 hover:border-gold-300/70 transition text-sm font-medium">
            Buy $MNEME
          </a>
          <a href="/"     className="px-4 py-1.5 rounded-lg bg-white text-black hover:bg-marble-100 transition text-sm font-medium">
            Sign in
          </a>
        </div>
      </nav>

      {/* ────── hero ──────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-24 text-center">
        <div className="inline-flex flex-wrap items-center gap-2 mb-6 justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-300/10 border border-gold-300/30 text-[11px] uppercase tracking-[0.2em] text-gold-300">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-300 shadow-[0_0_8px_rgba(212,175,55,0.7)]"></span>
            MetaMask Agentic Wallet ready
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-ink-950 border border-ink-800 text-[11px] uppercase tracking-[0.2em] text-ink-300">
            ERC-7715 ·
            <a href="https://eips.ethereum.org/EIPS/eip-7715" target="_blank" rel="noreferrer" className="hover:text-marble-100 normal-case lowercase">eip ↗</a>
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-ink-950 border border-ink-800 text-[11px] uppercase tracking-[0.2em] text-ink-300">
            ERC-7710 ·
            <a href="https://eips.ethereum.org/EIPS/eip-7710" target="_blank" rel="noreferrer" className="hover:text-marble-100 normal-case lowercase">eip ↗</a>
          </span>
        </div>
        <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight max-w-4xl mx-auto">
          The <span className="text-gold-300">memory + intent layer</span><br />
          for MetaMask Agentic Wallet.
        </h1>
        <p className="text-lg text-ink-300 leading-relaxed max-w-2xl mx-auto mt-6">
          Set rules in Mneme. Execute through MetaMask. Remember everything
          afterward. Two layers, one agent, complete stack.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <a
            href={APPLY_URL}
            target="_blank" rel="noreferrer"
            className="px-6 py-3 rounded-xl bg-gold-300 text-black font-semibold hover:bg-gold-200 transition"
          >
            Apply for MetaMask early access ↗
          </a>
          <a
            href={SKILL_PACK_URL}
            target="_blank" rel="noreferrer"
            className="px-6 py-3 rounded-xl border border-ink-700 text-marble-100 hover:bg-ink-900 transition"
          >
            View skill pack on GitHub ↗
          </a>
        </div>
      </section>

      {/* ────── architecture diagram ──────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pb-16">
        <div className="text-center text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">how it composes</div>
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-12">Memory writes the rule. MetaMask enforces it.</h2>

        <div className="space-y-4">
          <Layer
            number="01"
            title="Mneme — Memory + Intent"
            color="gold"
            body="Your agent's brain. A real Postgres schema with seven primitives: memory (pgvector), graph (entities + relations), streams (live Base events), chat (schema-aware Claude), dreams (async LLM reflection), beam (real-time SSE), mesh (agent-to-agent marketplace). Now plus mandate: declarative intents with guardrails."
            pills={["pgvector", "Postgres", "Base", "SSE", "LISTEN/NOTIFY"]}
          />
          <Arrow label="sync via MetaMask Agentic Wallet API" />
          <Layer
            number="02"
            title="MetaMask Agentic Wallet — Execution"
            color="purple"
            body="Onchain-enforced guardrails via ERC-7715 wallet_requestExecutionPermissions + ERC-7710 redeemDelegations. Spend limits, allowlisted protocols, risk profile, all standards-shaped. Transaction Shield (Blockaid) + MEV protection + simulation. Swaps, perps, prediction markets, LP, staking — 25+ EVM chains and HyperLiquid."
            pills={["ERC-7715", "ERC-7710", "Transaction Shield", "guardrails", "25+ chains", "Blockaid"]}
          />
          <Arrow label="write-back: every tx logged as an event row" />
          <Layer
            number="03"
            title="Mneme — Memory of every action"
            color="gold"
            body="Every executed mandate writes back to your schema. Beam ticks live. /chat is now action-aware. /find can hybrid-search across past trades. Your agent remembers what it did, with whom, and why."
            pills={["auto-INSERT", "event log", "schema-aware /chat", "BaseScan deeplink"]}
          />
        </div>
      </section>

      {/* ────── code block — the actual intent ────────────────── */}
      <section className="max-w-5xl mx-auto px-6 md:px-10 pb-16">
        <div className="bg-ink-900/60 border border-ink-800 rounded-2xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 mb-1">in your agent</div>
              <h3 className="text-xl font-semibold">Write the intent once.</h3>
            </div>
            <button
              onClick={copy}
              className="text-xs px-3 py-1.5 rounded-lg border border-ink-800 text-ink-400 hover:text-marble-100 hover:border-ink-700 transition"
            >
              {copied ? "✓ copied" : "copy"}
            </button>
          </div>
          <pre className="bg-ink-950 border border-ink-800 rounded-xl p-4 overflow-x-auto text-[12.5px] leading-relaxed text-marble-100 font-mono">
{codeBlock}
          </pre>
          <div className="mt-4 text-xs text-ink-400 leading-relaxed">
            The mandate's <span className="font-mono text-gold-300">risk_profile</span> + <span className="font-mono text-gold-300">spend_cap_usdc</span> compile to a spec-shaped <a href="https://eips.ethereum.org/EIPS/eip-7715" target="_blank" rel="noreferrer" className="text-gold-300 hover:text-gold-200 underline underline-offset-2">ERC-7715</a> <span className="font-mono text-gold-300">wallet_requestExecutionPermissions</span> request. MetaMask grants a delegation; Mneme stores its <span className="font-mono text-gold-300">context</span> + <span className="font-mono text-gold-300">delegationManager</span> address. When Mneme Streams trips the condition, the worker calls <a href="https://eips.ethereum.org/EIPS/eip-7710" target="_blank" rel="noreferrer" className="text-gold-300 hover:text-gold-200 underline underline-offset-2">ERC-7710</a> <span className="font-mono text-gold-300">redeemDelegations</span> with that context — MetaMask enforces guardrails onchain, writes the tx hash back as an executed mandate row.
          </div>
        </div>
      </section>

      {/* ────── feature triple ────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pb-20">
        <h2 className="text-center text-2xl md:text-3xl font-semibold mb-12">What you get on day one</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <FeatureCard
            title="Mneme Mandate"
            body="Declarative intent storage. Eight intent kinds: swap, send, stake, lp, perp, predict, mint, vote. Spend caps, slippage, allowed protocols, blocked addresses. Status lifecycle from pending → armed → triggered → executed. Cancellable at any non-terminal state."
            href="/mandates"
            linkLabel="open Mandates →"
          />
          <FeatureCard
            title="Skill pack"
            body="MIT-licensed open-source skills that plug any agent CLI (OpenClaw, Codex, Cursor) into Mneme's memory layer. Pre-trade context, post-trade logging, mandate evaluation, condition watchers via Mneme Streams. Ready for the MetaMask CLI on day one of public launch."
            href={SKILL_PACK_URL}
            linkLabel="view repo →"
            external
          />
          <FeatureCard
            title="Write-back logging"
            body="Every executed mandate auto-INSERTs as an event row. Queryable via /chat (schema-aware Claude), traversable via /find (hybrid vector + graph), live via /beam (SSE). Your agent's trade history becomes a first-class memory citizen, not an opaque audit log."
            href="/docs"
            linkLabel="docs →"
          />
        </div>
      </section>

      {/* ────── footer CTA ────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pb-16 text-center">
        <div className="border-t border-ink-900 pt-12">
          <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 mb-3">apply together</div>
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">Use Mneme today. Plug MetaMask in when access lands.</h2>
          <p className="text-ink-400 max-w-2xl mx-auto mb-6">
            Mneme Mandate works right now with Coinbase Smart Wallet or Privy as the execution rail.
            The moment your MetaMask Agentic Wallet early access ships, change one field
            (<span className="font-mono text-gold-300">wallet_provider: "metamask"</span>)
            and the same mandate routes through MetaMask's guardrails.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={APPLY_URL} target="_blank" rel="noreferrer"
              className="px-6 py-3 rounded-xl bg-gold-300 text-black font-semibold hover:bg-gold-200 transition">
              Apply for MetaMask early access ↗
            </a>
            <a href="/" className="px-6 py-3 rounded-xl border border-ink-700 text-marble-100 hover:bg-ink-900 transition">
              Open Mneme dashboard →
            </a>
          </div>
        </div>
        <div className="text-xs text-ink-600 mt-12 pb-8">
          Mneme is independent infrastructure. Not affiliated with or endorsed by ConsenSys / MetaMask.
        </div>
      </section>
    </div>
  );
}

function Layer({
  number, title, color, body, pills,
}: {
  number: string;
  title:  string;
  color:  "gold" | "purple";
  body:   string;
  pills:  string[];
}) {
  const ringColor = color === "gold" ? "from-gold-300/30 to-gold-300/0" : "from-violet-400/30 to-violet-400/0";
  const numColor  = color === "gold" ? "text-gold-300"  : "text-violet-400";
  return (
    <div className="relative">
      <div className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${ringColor} pointer-events-none`} />
      <div className="relative bg-ink-900/40 border border-ink-800 rounded-2xl p-6 flex gap-5">
        <div className={`text-3xl font-bold ${numColor} shrink-0 w-12`}>{number}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-marble-100 text-lg font-semibold mb-1">{title}</h3>
          <p className="text-ink-300 text-sm leading-relaxed mb-3">{body}</p>
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p) => (
              <span key={p} className="text-[10px] text-ink-400 bg-ink-950 border border-ink-800 px-2 py-0.5 rounded-full">{p}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2 gap-3">
      <div className="h-px flex-1 max-w-32 bg-gradient-to-r from-transparent to-ink-700" />
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">{label}</div>
      <div className="h-px flex-1 max-w-32 bg-gradient-to-l from-transparent to-ink-700" />
    </div>
  );
}

function FeatureCard({
  title, body, href, linkLabel, external,
}: {
  title: string; body: string; href: string; linkLabel: string; external?: boolean;
}) {
  return (
    <div className="bg-ink-900/40 border border-ink-800 hover:border-ink-700 rounded-2xl p-6 transition flex flex-col">
      <h3 className="text-marble-100 text-lg font-semibold mb-2">{title}</h3>
      <p className="text-ink-400 text-sm leading-relaxed mb-4 flex-1">{body}</p>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="text-gold-300 hover:text-gold-200 text-sm font-medium"
      >
        {linkLabel}
      </a>
    </div>
  );
}
