import { useConnect } from "wagmi";

export function Landing() {
  const { connectors, connect, status, error } = useConnect();
  const smart    = connectors.find((c) => c.id === "coinbaseWalletSDK") ?? connectors[0];
  const injected = connectors.find((c) => c.id === "injected");
  const pending  = status === "pending";

  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased">
      {/* ===== Top nav ===== */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img
            src="/mnemelogo.png"
            alt="Mneme"
            className="h-8 w-auto object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="font-semibold tracking-tight text-lg">Mneme</span>
        </div>
        <button
          onClick={() => smart && connect({ connector: smart })}
          disabled={pending}
          className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-marble-100 disabled:opacity-50 transition"
        >
          Sign in
        </button>
      </nav>

      {/* ===== Hero ===== */}
      <section className="relative min-h-[78vh] flex items-center overflow-hidden">
        <div
          className="absolute inset-0 bg-no-repeat bg-cover"
          style={{
            backgroundImage: "url(/hero.png)",
            backgroundPosition: "left center",
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-ink-950/70 to-ink-950"
          aria-hidden
        />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ink-950 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink-950 to-transparent" aria-hidden />

        <div className="relative max-w-7xl mx-auto px-8 py-24 w-full grid md:grid-cols-2 gap-12 items-center">
          <div className="hidden md:block" />
          <div className="space-y-7">
            <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80">
              The agent-native database
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
              The database<br />for agents.<br />
              <span className="text-gold-300">Built in gold.</span>
            </h1>
            <p className="text-lg text-ink-300 leading-relaxed max-w-md">
              Mneme is a Postgres platform named for the goddess of memory. Pick
              a handle, get a dedicated schema with four memory tables ready to
              go, and let your agents spin up whatever else they need at runtime.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => smart && connect({ connector: smart })}
                disabled={pending}
                className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-marble-100 disabled:opacity-50 transition"
              >
                Sign up with email
              </button>
              {injected && (
                <button
                  onClick={() => connect({ connector: injected })}
                  disabled={pending}
                  className="px-6 py-3 rounded-xl bg-ink-900 border border-ink-800 text-white font-medium hover:bg-ink-800 disabled:opacity-50 transition"
                >
                  Connect wallet
                </button>
              )}
            </div>
            <div className="text-xs text-ink-500 pt-2">
              Coinbase Smart Wallet · passkey · no browser extension required.
            </div>
            {error && (
              <div className="text-sm text-red-400">{error.message}</div>
            )}
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            How it works
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-12 max-w-2xl tracking-tight">
            Three steps from wallet to working agent memory.
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step n="1" title="Sign up with email">
              Coinbase Smart Wallet creates a Base wallet for you behind a passkey.
              No extension. No seed phrase to lose.
            </Step>
            <Step n="2" title="Pick a handle">
              <span className="font-mono">alice</span> becomes{" "}
              <span className="font-mono">alice.mneme</span>. We provision a dedicated
              Postgres schema with four agent tables in one transaction.
            </Step>
            <Step n="3" title="Plug into your agent">
              Use <code className="font-mono text-gold-300">mneme-sdk</code> from your code,
              or drop the MCP server into Claude / Cursor. Your agent has memory.
            </Step>
          </div>
        </div>
      </section>

      {/* ===== What every project gets ===== */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            A real Postgres, agent-native
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 max-w-2xl tracking-tight">
            Four memory tables to start.<br />All the ones you need after that.
          </h2>
          <p className="text-ink-400 max-w-2xl mb-12 leading-relaxed">
            Every Mneme project starts with four memory tables so your agent has
            somewhere to write from minute one. Then your agent calls{" "}
            <code className="font-mono text-gold-300">mneme.createTable</code> to
            spin up whatever else it needs — users, tasks, prices, embeddings,
            anything Postgres + pgvector can hold.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <TableCard name="memories"  defaultsLabel="default" desc="Text + 1536-dim vector embedding. Built-in KNN." />
            <TableCard name="documents" defaultsLabel="default" desc="Longer-form content with title, body, embedding." />
            <TableCard name="events"    defaultsLabel="default" desc="Append-only log of agent actions, arbitrary payload." />
            <TableCard name="kvs"       defaultsLabel="default" desc="Per-agent key-value store for everything else." />
            <TableCard name="your_table" defaultsLabel="custom" desc="Whatever shape your agent needs — text, jsonb, vector(N), bigint, uuid, date, …" />
          </div>
        </div>
      </section>

      {/* ===== Why wallet ===== */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-8">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            Why a wallet
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 tracking-tight">
            Because there are no API keys to leak.
          </h2>
          <p className="text-ink-300 leading-relaxed">
            Every request to Mneme is signed by your wallet — EIP-712 typed data,
            verified at the gateway. Sign in once with email (we use a passkey
            under the hood) and Mneme issues a 24-hour session token. Your data
            lives in a Postgres schema isolated by your wallet address.
          </p>
          <p className="text-ink-300 leading-relaxed mt-4">
            <span className="font-semibold text-white">
              We never see passwords. You never see infrastructure.
            </span>
          </p>
        </div>
      </section>

      {/* ===== Etymology / brand voice ===== */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-8 text-center space-y-4">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80">
            Μνήμη
          </div>
          <p className="text-2xl md:text-3xl font-serif italic text-ink-200 leading-snug">
            "Memory is the gold that holds your agent together."
          </p>
          <p className="text-sm text-ink-500">
            Mneme — Greek personification of memory, mother of the Muses.
            The substrate from which inspiration arises.
          </p>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="py-12 border-t border-ink-900 text-center text-ink-500 text-xs">
        <div>Mneme — built on Base. Pre-MVP, stealth.</div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-gold-300 text-2xl font-mono">{n}</span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="text-ink-400 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function TableCard({
  name, desc, defaultsLabel,
}: {
  name:          string;
  desc:          string;
  defaultsLabel: "default" | "custom";
}) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-gold-300 text-lg">{name}</div>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-px rounded border ${
          defaultsLabel === "default"
            ? "text-ink-400 border-ink-700"
            : "text-gold-300/80 border-gold-300/30"
        }`}>
          {defaultsLabel}
        </span>
      </div>
      <p className="text-ink-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
