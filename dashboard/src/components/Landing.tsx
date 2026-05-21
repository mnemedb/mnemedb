import { useConnect } from "wagmi";
import { StatusBadge } from "./StatusBadge";

export function Landing() {
  const { connectors, connect, status, error } = useConnect();
  const smart    = connectors.find((c) => c.id === "coinbaseWalletSDK") ?? connectors[0];
  const injected = connectors.find((c) => c.id === "injected");
  const pending  = status === "pending";

  const startCreate  = () => smart    && connect({ connector: smart });
  const startSignIn  = () => smart    && connect({ connector: smart });
  const startInject  = () => injected && connect({ connector: injected });

  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased selection:bg-gold-400/30 selection:text-white">
      {/* ════ Nav ═══════════════════════════════════════════════════════════ */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-5 max-w-7xl mx-auto">
        <a href="#top" className="flex items-center gap-2.5">
          <img
            src="/mnemelogo.png"
            alt="Mneme"
            className="h-7 w-auto object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="font-semibold tracking-tight text-lg">Mneme</span>
        </a>
        <div className="flex items-center gap-5 text-sm">
          <span className="hidden lg:inline-flex"><StatusBadge /></span>
          <a href="#code"          className="hidden md:inline text-ink-400 hover:text-white transition">Code</a>
          <a href="#compare"       className="hidden md:inline text-ink-400 hover:text-white transition">Why Mneme</a>
          <a href="#faq"           className="hidden md:inline text-ink-400 hover:text-white transition">FAQ</a>
          <a
            href="https://github.com/mnemedb/mnemedb"
            target="_blank" rel="noreferrer"
            className="hidden md:inline text-ink-400 hover:text-white transition"
          >
            GitHub
          </a>
          <button
            onClick={startSignIn}
            disabled={pending}
            className="text-ink-300 hover:text-white text-sm transition"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* ════ Hero ══════════════════════════════════════════════════════════ */}
      <section id="top" className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-no-repeat bg-cover opacity-90"
          style={{ backgroundImage: "url(/hero.png)", backgroundPosition: "left center" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-ink-950/75 to-ink-950" aria-hidden />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink-950 to-transparent" aria-hidden />

        <div className="relative max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
          <div className="hidden md:block" />
          <div className="space-y-6">
            <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80">
              the agent-native database
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
              The database<br />for agents.<br />
              <span className="text-gold-300">Built in gold.</span>
            </h1>
            <p className="text-lg text-ink-300 leading-relaxed max-w-md">
              Real Postgres. Per-project schemas. Vector search built-in. Your
              agents create the tables they need at runtime. Authenticated by
              their wallet — no API keys to leak.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={startCreate}
                disabled={pending}
                className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-marble-100 disabled:opacity-50 transition"
              >
                Create your project
              </button>
              <button
                onClick={startSignIn}
                disabled={pending}
                className="px-6 py-3 rounded-xl bg-ink-900 border border-ink-800 text-white font-medium hover:bg-ink-800 disabled:opacity-50 transition"
              >
                Sign in
              </button>
            </div>
            <div className="text-xs text-ink-500 pt-2 leading-relaxed">
              Email + passkey via Coinbase Smart Wallet (no extension), or{" "}
              {injected ? (
                <button onClick={startInject} className="text-ink-300 underline hover:text-white">
                  connect MetaMask / Rabby
                </button>
              ) : "connect any injected wallet"}
              .
              <br />
              We only ever ask for a signature — never an onchain transaction. No gas, no funds moved.
            </div>
            {error && <div className="text-sm text-red-400">{error.message}</div>}
          </div>
        </div>
      </section>

      {/* ════ Live code ═════════════════════════════════════════════════════ */}
      <section id="code" className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            three calls
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight">
            Create a table. Insert a row. Vector-search it.
          </h2>
          <p className="text-ink-400 max-w-2xl mb-10 leading-relaxed">
            No DB credentials, no migrations folder, no infra. Your agent's
            wallet is the credential; the schema is provisioned on demand.
          </p>

          <CodeBlock title="agent.ts">
{`// npm i mneme-sdk viem
import { privateKeyToAccount } from "viem/accounts";
import { Mneme } from "mneme-sdk";

const m = new Mneme({
  account:    privateKeyToAccount(process.env.AGENT_PRIVATE_KEY!),
  gatewayUrl: "https://gateway.mnemedb.dev",
});

// 1. Spin up whatever table your agent needs
await m.createTable({
  name: "tweets",
  columns: [
    { name: "author",    type: "text", nullable: false },
    { name: "content",   type: "text" },
    { name: "likes",     type: "int"  },
    { name: "embedding", type: "vector", dim: 1536 },
  ],
});

// 2. Write into it
await m.from("tweets").insert({
  author: "alice", content: "gm", likes: 42, embedding: vec,
});

// 3. Vector-search across any column on any table
const { matches } = await m.vectorSearch({
  table: "tweets", column: "embedding", embedding: query, k: 5,
});`}
          </CodeBlock>

          <div className="mt-4 text-xs text-ink-500">
            Same surface from Claude/Cursor via MCP:{" "}
            <code className="font-mono text-gold-300/80">npm i -g mneme-mcp</code>
            {" "}— five tools, zero glue code.
          </div>
        </div>
      </section>

      {/* ════ What you can build ════════════════════════════════════════════ */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            what you can build
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-12 max-w-2xl tracking-tight">
            One stack. Whatever your agent has to remember.
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <UseCase
              title="Agents that remember"
              desc="Use the built-in memories + documents tables. Pgvector KNN out of the box. Your chatbot keeps state across sessions, your RAG pipeline has a real backing store."
            />
            <UseCase
              title="Agents that trade"
              desc="Create tables for orders, signals, prices. Append-only events log every decision. Query with full Postgres power — JSONB for unstructured payloads, vector(N) for similarity matching."
            />
            <UseCase
              title="Agents that coordinate"
              desc="Multi-agent systems share state through a Mneme schema. Each agent has its own wallet identity; Phase 2 ships onchain permissions so one project can grant other agents read/write on specific tables."
            />
          </div>
        </div>
      </section>

      {/* ════ Comparison ════════════════════════════════════════════════════ */}
      <section id="compare" className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            why mneme
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-12 max-w-2xl tracking-tight">
            Real database. Not a memory wrapper.
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink-800 text-ink-400">
                  <th className="text-left font-medium px-4 py-3"></th>
                  <th className="text-left font-medium px-4 py-3 text-gold-300">Mneme</th>
                  <th className="text-left font-medium px-4 py-3">Mem0 / Pinecone</th>
                  <th className="text-left font-medium px-4 py-3">Raw Supabase / Neon</th>
                </tr>
              </thead>
              <tbody className="text-ink-300">
                <Row label="Custom tables at runtime" mneme="✓ via createTable()" others="✗ fixed shape"             raw="✓ but you write the migrations" />
                <Row label="Vector search any column" mneme="✓ pgvector built-in"   others="partial — vector only"     raw="✓ but you configure pgvector" />
                <Row label="text / int / jsonb / uuid / date" mneme="✓ all"          others="✗ memory schema only"      raw="✓"                              />
                <Row label="Auth"                       mneme="wallet (EIP-712, ERC-1271)" others="API key"            raw="email + JWT or API key"          />
                <Row label="MCP server for Claude/Cursor" mneme="✓ npm i -g mneme-mcp" others="growing"                 raw="✗ build it yourself"             />
                <Row label="Per-tenant schema isolation" mneme="✓ automatic"          others="per-API-key"             raw="manual RLS setup"                />
                <Row label="Onchain identity (Phase 2)" mneme="✓ via wallet"          others="✗"                        raw="✗"                              />
                <Row label="Infra to manage"            mneme="zero"                  others="zero"                    raw="postgres + auth + RLS + DDL"     />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ════ Defaults + custom ═════════════════════════════════════════════ */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            what every project gets
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 max-w-2xl tracking-tight">
            Four memory tables to start.<br />All the ones you need after that.
          </h2>
          <p className="text-ink-400 max-w-2xl mb-12 leading-relaxed">
            Every Mneme project starts with four memory tables provisioned at
            create-time so your agent has somewhere to write from minute one.
            Your agent calls{" "}
            <code className="font-mono text-gold-300">mneme.createTable</code>{" "}
            to spin up whatever else it needs — text, jsonb, vector(N), bigint,
            uuid, date.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <TableCard name="memories"   defaultsLabel="default" desc="Text + 1536-dim vector embedding. Built-in KNN." />
            <TableCard name="documents"  defaultsLabel="default" desc="Longer-form content with title, body, embedding." />
            <TableCard name="events"     defaultsLabel="default" desc="Append-only log of agent actions, arbitrary payload." />
            <TableCard name="kvs"        defaultsLabel="default" desc="Per-agent key-value store for everything else." />
            <TableCard name="your_table" defaultsLabel="custom"  desc="Whatever shape your agent needs — text, int, jsonb, vector(N), bigint, uuid, date." />
          </div>
        </div>
      </section>

      {/* ════ Wallet ════════════════════════════════════════════════════════ */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            why a wallet
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 tracking-tight">
            Because there are no API keys to leak.
          </h2>
          <p className="text-ink-300 leading-relaxed">
            Every request to Mneme is signed by your wallet — EIP-712 typed data,
            verified at the gateway. EOA sigs are checked with ECDSA;
            smart-contract wallets (Coinbase Smart Wallet, Safe) verify via
            ERC-1271 / 6492 against Base.
          </p>
          <p className="text-ink-300 leading-relaxed mt-3">
            Sign in once with email — we use a passkey under the hood, via
            Coinbase Smart Wallet — and Mneme issues a 24-hour session token
            stored in your browser. No gas, no transactions, no funds moved.
            Your data lives in a Postgres schema isolated by your wallet
            address.
          </p>
          <p className="text-ink-200 leading-relaxed mt-4">
            <strong>We never see passwords. You never see infrastructure.</strong>
          </p>
        </div>
      </section>

      {/* ════ Pricing ═══════════════════════════════════════════════════════ */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 tracking-tight">
            Free during MVP. Then <span className="text-gold-300">$MNEME</span>.
          </h2>
          <p className="text-ink-400 leading-relaxed">
            All endpoints are free during the MVP — create projects, insert,
            query, vector-search to your heart's content. When the public
            launch ships, $MNEME (Clanker / Flaunch on Base) introduces
            pay-per-query metering and a stake-for-rate-limit-discount mechanic.
            Free tier remains generous for hobby agents.
          </p>
        </div>
      </section>

      {/* ════ FAQ ═══════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-24 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            faq
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-10 tracking-tight">
            Things you'll probably ask.
          </h2>
          <div className="space-y-6">
            <Faq q="Is this just a memory wrapper like Mem0?">
              No. Mneme is a real Postgres platform. Mem0 / Pinecone give you a
              fixed memory store; Mneme gives you a schema you control. Create
              any tables you want at runtime, query with full SQL power
              (Phase 2 brings JOIN/WHERE; right now it's LIST + vector search).
            </Faq>
            <Faq q="Do I have to know crypto / web3?">
              No. Sign up with email — Coinbase Smart Wallet creates a wallet
              for you behind a passkey, no extension required, no seed phrase.
              You never see "crypto" UI unless you want to. The wallet is just
              how Mneme authenticates you instead of an API key.
            </Faq>
            <Faq q="Will Mneme ever ask me to sign an onchain transaction?">
              Not in the MVP. Every interaction is a message signature
              (EIP-712), off-chain, no gas, no funds moved. Phase 2 introduces
              an optional onchain handle registry (so your handle is
              transferable and portable) — that's the only place we'd ever
              ask for a real transaction, and it's opt-in.
            </Faq>
            <Faq q="Where is my data?">
              On a Postgres + pgvector instance we manage (Neon, Frankfurt). Every
              project is a fully isolated schema (<code className="font-mono text-gold-300/80">agent_&lt;handle&gt;</code>) — no shared rows, no cross-tenant access.
            </Faq>
            <Faq q="Can I self-host?">
              Yes — the gateway is Bun + Hono, ~700 lines of TypeScript, fully
              open source ({" "}
              <a className="underline text-white" target="_blank" rel="noreferrer" href="https://github.com/mnemedb/mnemedb">github.com/mnemedb/mnemedb</a>
              {" "}). Bring your own Postgres with pgvector and you're 5 minutes
              from running the whole stack yourself. See{" "}
              <code className="font-mono text-gold-300/80">DEPLOY.md</code>.
            </Faq>
            <Faq q="What about agents that aren't mine?">
              Today each agent needs its own EOA + its own Mneme project. Phase
              2 ships <em>agent keys</em> — link many agent wallets to one owner
              project so a single human's project can be written to by many
              cooperating agents.
            </Faq>
          </div>
        </div>
      </section>

      {/* ════ Etymology / brand voice ═══════════════════════════════════════ */}
      <section className="py-24 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-6 md:px-10 text-center space-y-4">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80">Μνήμη</div>
          <p className="text-2xl md:text-3xl font-serif italic text-ink-200 leading-snug">
            "Memory is the gold that holds your agent together."
          </p>
          <p className="text-sm text-ink-500">
            Mneme — Greek personification of memory, mother of the Muses.
            The substrate from which inspiration arises.
          </p>
        </div>
      </section>

      {/* ════ Bottom CTA ════════════════════════════════════════════════════ */}
      <section className="py-20 border-t border-ink-900">
        <div className="max-w-3xl mx-auto px-6 md:px-10 text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Give your agent a mind.
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={startCreate}
              disabled={pending}
              className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-marble-100 disabled:opacity-50 transition"
            >
              Create your project
            </button>
            <a
              href="https://github.com/mnemedb/mnemedb"
              target="_blank" rel="noreferrer"
              className="px-6 py-3 rounded-xl bg-ink-900 border border-ink-800 text-white font-medium hover:bg-ink-800 transition"
            >
              Read on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ════ Footer ════════════════════════════════════════════════════════ */}
      <footer className="py-12 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-ink-500">
          <div className="flex items-center gap-4">
            <span>Mneme — built on Base.</span>
            <StatusBadge />
          </div>
          <div className="flex gap-5 flex-wrap justify-center">
            <a className="hover:text-white transition" href="https://www.npmjs.com/package/mneme-sdk" target="_blank" rel="noreferrer">mneme-sdk</a>
            <a className="hover:text-white transition" href="https://www.npmjs.com/package/mneme-mcp" target="_blank" rel="noreferrer">mneme-mcp</a>
            <a className="hover:text-white transition" href="https://github.com/mnemedb/mnemedb" target="_blank" rel="noreferrer">GitHub</a>
            <a className="hover:text-white transition" href="#code">Code</a>
            <a className="hover:text-white transition" href="#compare">Compare</a>
            <a className="hover:text-white transition" href="#faq">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Small components ────────────────────────────────────────────────────────

function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-ink-800 flex items-center gap-2 text-xs text-ink-500 font-mono">
        <span className="w-2 h-2 rounded-full bg-ink-700" />
        <span className="w-2 h-2 rounded-full bg-ink-700" />
        <span className="w-2 h-2 rounded-full bg-ink-700" />
        <span className="ml-2">{title}</span>
      </div>
      <pre className="px-5 py-5 text-sm font-mono text-ink-200 overflow-x-auto leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function UseCase({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-ink-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function Row({ label, mneme, others, raw }: { label: string; mneme: string; others: string; raw: string }) {
  return (
    <tr className="border-b border-ink-900/60">
      <td className="px-4 py-3 text-ink-200">{label}</td>
      <td className="px-4 py-3 text-gold-300/90">{mneme}</td>
      <td className="px-4 py-3 text-ink-400">{others}</td>
      <td className="px-4 py-3 text-ink-400">{raw}</td>
    </tr>
  );
}

function TableCard({ name, desc, defaultsLabel }: { name: string; desc: string; defaultsLabel: "default" | "custom" }) {
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

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group bg-ink-900 border border-ink-800 rounded-xl px-5 py-4 open:pb-5 transition">
      <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
        <span className="text-base font-medium">{q}</span>
        <span className="text-ink-500 group-open:rotate-45 transition-transform shrink-0">+</span>
      </summary>
      <div className="mt-3 text-sm text-ink-300 leading-relaxed">{children}</div>
    </details>
  );
}
