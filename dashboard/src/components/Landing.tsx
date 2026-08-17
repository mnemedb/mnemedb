import { useState } from "react";
import { useLogin } from "@privy-io/react-auth";
import { StatusBadge } from "./StatusBadge";

export function Landing() {
  const { login } = useLogin();

  // Single login call — Privy modal handles all the auth UX (email, google,
  // twitter, apple, or connect existing wallet). After login Privy creates an
  // embedded wallet if needed, then App.tsx auto-signs a Mneme session.
  const signIn = () => login();

  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased selection:bg-gold-400/30 selection:text-white">
      {/* ════ Top announcement banner ════════════════════════════════════════ */}
      <AnnouncementBar />

      {/* ════ Nav ═══════════════════════════════════════════════════════════ */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 max-w-7xl mx-auto">
        <a href="#top" className="flex items-center gap-2.5 group">
          <img
            src="/mnemelogo.png"
            alt="Mneme"
            className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="font-semibold tracking-tight text-lg">Mneme</span>
          <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-gold-300/60 ml-2 pl-2 border-l border-ink-800">on Base</span>
        </a>
        <div className="flex items-center gap-5 text-sm">
          <span className="hidden lg:inline-flex"><StatusBadge /></span>
          <a href="#features"      className="hidden md:inline text-ink-400 hover:text-white transition">Stack</a>
          <a href="#code"          className="hidden md:inline text-ink-400 hover:text-white transition">Code</a>
          <a href="#compare"       className="hidden lg:inline text-ink-400 hover:text-white transition">Compare</a>
          <a href="/docs"          className="hidden md:inline text-ink-400 hover:text-white transition">Docs</a>
          <a
            href="https://github.com/mnemedb/mnemedb"
            target="_blank" rel="noreferrer"
            className="hidden md:inline text-ink-400 hover:text-white transition"
          >
            GitHub
          </a>
          <a
            href="/buy"
            className="hidden sm:inline px-3 py-1.5 rounded-lg border border-gold-300/40 text-gold-300 hover:bg-gold-300/10 hover:border-gold-300/70 transition text-sm font-medium"
          >
            Buy $MNEME
          </a>
          <button
            onClick={signIn}
            className="px-4 py-1.5 rounded-lg bg-white text-black hover:bg-marble-100 transition text-sm font-medium"
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
              Real Postgres. Per-project schemas. Vector search built-in.
              Wallet-bound storage on a global CDN. Your agents create
              tables and upload files at runtime — authenticated by their
              wallet, no API keys to leak.
            </p>
            <div className="pt-2">
              <button
                onClick={signIn}
                className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-marble-100 transition"
              >
                Sign in to Mneme
              </button>
            </div>
            <div className="text-xs text-ink-500 pt-2 leading-relaxed max-w-md">
              Continue with email, Google, X, Apple — or connect your own
              wallet. No browser extension required, no seed phrase to lose.
              We never ask for an onchain transaction, only message signatures.
            </div>
          </div>
        </div>

        {/* ─── Trust strip ───────────────────────────────────────────── */}
        <div className="relative max-w-7xl mx-auto px-6 md:px-10 pb-12">
          <div className="border-t border-ink-900 pt-6 flex flex-wrap items-center gap-x-8 gap-y-3 justify-between text-xs text-ink-500">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
              <span>Live on <span className="text-ink-300">Base mainnet</span></span>
            </span>
            <span><span className="text-gold-300/80 font-mono">$MNEME</span> live · <span className="font-mono text-ink-300">0x3FcD…7b07</span></span>
            <span>15 MCP tools · <span className="text-ink-300">npm i mneme-sdk</span></span>
            <span>100 MB free storage · <span className="text-ink-300">cdn.mnemedb.dev</span></span>
            <span>4-second wallet onboarding</span>
          </div>
        </div>
      </section>

      {/* ════ Feature grid (Supabase-style) ═════════════════════════════════ */}
      <section id="features" className="py-24 border-t border-ink-900">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            the stack
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold mb-3 max-w-3xl tracking-tight">
            Ship in a day.<br />
            <span className="text-gold-300">Scale to a million wallets.</span>
          </h2>
          <p className="text-ink-400 max-w-2xl mb-12 leading-relaxed">
            Mneme is the agent-native development platform on Base. Start your
            project with a real Postgres schema, wallet auth, instant REST,
            vector search, wallet-bound storage, MCP-native agent tools, and
            scoped API keys for B2B2C distribution.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {/* ── Postgres ── */}
            <FeatureCard
              icon={<DbIcon />}
              title="Postgres Database"
              desc="Every wallet gets a fully isolated Postgres schema with four memory tables ready to go and runtime DDL for whatever else you need."
              accents={["100% portable", "Built-in auth", "Easy to extend"]}
              visual={
                <div className="space-y-1 font-mono text-[11px] text-ink-400">
                  <SchemaLine name="memories"  hl />
                  <SchemaLine name="documents" />
                  <SchemaLine name="events"    />
                  <SchemaLine name="kvs"       />
                  <SchemaLine name="todos"     custom />
                  <SchemaLine name="orders"    custom />
                </div>
              }
            />

            {/* ── Wallet auth ── */}
            <FeatureCard
              icon={<KeyIcon />}
              title="Wallet Auth"
              desc="EIP-712 typed-data on every request. Smart wallets via ERC-1271/6492. No API keys to leak, no passwords to phish."
              accents={["EOA + Smart wallet", "Privy embedded", "Session JWTs"]}
              visual={
                <div className="space-y-1.5">
                  <AuthRow icon="✉" label="alice@email.com" />
                  <AuthRow icon="G" label="google sign-in" />
                  <AuthRow icon="𝕏" label="@alice" />
                  <AuthRow icon="◈" label="0xa11ce…42" />
                </div>
              }
            />

            {/* ── Instant API ── */}
            <FeatureCard
              icon={<ApiIcon />}
              title="Instant REST + SDK"
              desc="PostgREST-style queries via the REST gateway, fully typed in TypeScript. No backend code, no edge functions to deploy."
              accents={["GET / POST / PATCH / DELETE", "WHERE filters", "Cursor pagination"]}
              visual={
                <div className="space-y-1 font-mono text-[11px]">
                  <RestLine method="GET"    path="/v1/rows/todos?where=done.eq.false" />
                  <RestLine method="POST"   path="/v1/rows/todos" />
                  <RestLine method="PATCH"  path="/v1/rows/todos/42" />
                  <RestLine method="DELETE" path="/v1/rows/todos/42" />
                </div>
              }
            />

            {/* ── Vector ── */}
            <FeatureCard
              icon={<VecIcon />}
              title="Vector Search"
              desc="pgvector built into every schema. KNN over any vector column on any table. Compatible with OpenAI, Cohere, HuggingFace embeddings."
              accents={["1536-dim + custom", "HNSW indexing", "L2 / cosine / inner"]}
              visual={
                <div className="space-y-1.5 font-mono text-[11px]">
                  <VecRow label="memory #42" score="0.12" />
                  <VecRow label="memory #7"  score="0.31" />
                  <VecRow label="memory #18" score="0.58" />
                  <VecRow label="memory #3"  score="0.74" />
                </div>
              }
            />

            {/* ── Storage ── */}
            <FeatureCard
              icon={<StorageIcon />}
              title="Wallet-bound Storage"
              desc="100 MB free per wallet on Cloudflare R2 (served from cdn.mnemedb.dev, zero egress). Extend by burning $MNEME on Base — verified on-chain."
              accents={["public + private", "Presigned URLs", "$MNEME burn → GB"]}
              visual={
                <div className="space-y-2">
                  <QuotaBar used={32} total={100} />
                  <div className="font-mono text-[10px] text-ink-500">
                    cdn.mnemedb.dev/<span className="text-gold-300/80">handle</span>/public/<span className="text-gold-300/80">file</span>
                  </div>
                </div>
              }
            />

            {/* ── MCP ── */}
            <FeatureCard
              icon={<McpIcon />}
              title="MCP-native"
              desc="15 tools exposed to Claude, Cursor, Cline, OpenClaude. Your agent gets CRUD + WHERE + vector + storage + raw SQL out of the box."
              accents={["Claude / Cursor", "OpenClaude plugin", "npm i -g mneme-mcp"]}
              visual={
                <div className="grid grid-cols-3 gap-1 font-mono text-[9px] text-ink-400">
                  {["create_table","list_tables","insert","list","update","delete","delete_where","vector_search","sql","storage_upload","storage_list","storage_delete","storage_url","storage_quota","storage_burn"].map((t) => (
                    <div key={t} className="bg-ink-950 border border-ink-800 rounded px-1.5 py-1 text-center truncate" title={`mneme_${t}`}>{t}</div>
                  ))}
                </div>
              }
            />

            {/* ── Service Accounts ── */}
            <FeatureCard
              icon={<TeamIcon />}
              title="Service Accounts"
              desc="For B2B2C platforms — mint scoped API keys from your master wallet, distribute to apps without giving up your wallet. Each key is rate-limited and namespace-isolated."
              accents={["Scope per key", "Per-key rate limits", "One-tap revoke"]}
              visual={
                <div className="space-y-1 font-mono text-[10px]">
                  <KeyRow prefix="mneme_sk_abc123" scope="app_xyz" />
                  <KeyRow prefix="mneme_sk_def456" scope="app_pdq" />
                  <KeyRow prefix="mneme_sk_ghi789" scope="app_ops" revoked />
                </div>
              }
            />

            {/* ── SQL editor ── */}
            <FeatureCard
              icon={<SqlIcon />}
              title="SQL Editor"
              desc="Full Postgres in your browser, scoped to your schema. JOIN, aggregate, CTEs, EXPLAIN — anything that doesn't escape your tenant. 5s timeout, 1000-row cap."
              accents={["Single statement", "Schema-scoped", "Query history"]}
              visual={
                <div className="bg-ink-950 border border-ink-800 rounded p-2 font-mono text-[10px] text-ink-300 leading-relaxed">
                  <div><span className="text-gold-300">SELECT</span> author, count(*)</div>
                  <div><span className="text-gold-300">FROM</span>   books</div>
                  <div><span className="text-gold-300">GROUP BY</span> author</div>
                  <div><span className="text-gold-300">ORDER BY</span> 2 <span className="text-gold-300">DESC</span></div>
                </div>
              }
            />

            {/* ── Phase 2 ── */}
            <FeatureCard
              icon={<RealtimeIcon />}
              title="Realtime + onchain"
              desc="Coming: Postgres LISTEN/NOTIFY subscriptions over WebSocket, and the onchain handle registry (AgentRegistry.sol already deployed on Base)."
              accents={["Phase 2 · 4-8 weeks", "WebSocket pushes", "Onchain handles"]}
              visual={
                <div className="space-y-1.5 text-[10px]">
                  <PulseRow label="new_message in chat_1234" />
                  <PulseRow label="updated todo #88" />
                  <PulseRow label="row inserted: orders" />
                </div>
              }
            />
          </div>

          <p className="text-center text-xs text-ink-500 mt-12">
            Use one or all. Best of breed primitives. Integrated as a platform.
          </p>
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
});

// 4. Wallet-bound storage — public files served on cdn.mnemedb.dev
const { public_url } = await m.storage.upload({
  key:        "avatars/alice.png",
  file:       avatarBytes,
  visibility: "public",
  contentType: "image/png",
});
// → https://cdn.mnemedb.dev/<your-handle>/public/avatars/alice.png`}
          </CodeBlock>

          <div className="mt-4 text-xs text-ink-500">
            Same surface from Claude/Cursor via MCP:{" "}
            <code className="font-mono text-gold-300/80">npm i -g mneme-mcp</code>
            {" "}— fifteen tools, zero glue code.
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
                <Row label="Auth"                       mneme="email / google / X / wallet" others="API key"            raw="email + JWT or API key"          />
                <Row label="MCP server for Claude/Cursor" mneme="✓ npm i -g mneme-mcp" others="growing"                 raw="✗ build it yourself"             />
                <Row label="Per-tenant schema isolation" mneme="✓ automatic"          others="per-API-key"             raw="manual RLS setup"                />
                <Row label="Wallet-bound file storage"  mneme="✓ R2 + cdn.mnemedb.dev" others="✗"                       raw="separate S3 + IAM setup"         />
                <Row label="Pay with token burn"        mneme="✓ $MNEME → quota"      others="✗ credit card only"      raw="✗ credit card only"              />
                <Row label="Onchain identity (Phase 2)" mneme="✓ via wallet"          others="✗"                        raw="✗"                              />
                <Row label="Infra to manage"            mneme="zero"                  others="zero"                    raw="postgres + auth + RLS + DDL + S3" />
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
            You sign in with email, Google, X, Apple, or your own wallet. If you
            don't already have a wallet, one is created for you behind a passkey
            — you never see crypto UI unless you want to. The wallet just
            authenticates your requests in place of an API key.
          </p>
          <p className="text-ink-300 leading-relaxed mt-3">
            Every request to the gateway is signed by your wallet (EIP-712).
            EOA sigs are verified with ECDSA; smart-contract wallets verify via
            ERC-1271 / 6492 against Base. Your data lives in a Postgres schema
            isolated by your wallet address. No gas, no transactions, no funds
            moved — Mneme only ever asks for message signatures.
          </p>
          <p className="text-ink-200 leading-relaxed mt-4">
            <strong>We never see passwords. You never see infrastructure.</strong>
          </p>
        </div>
      </section>

      {/* ════ Storage spotlight ═════════════════════════════════════════════ */}
      <section id="storage" className="py-24 border-t border-ink-900">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">
            wallet-bound storage
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 max-w-2xl tracking-tight">
            Files, in the same schema as your data.
          </h2>
          <p className="text-ink-400 max-w-2xl mb-10 leading-relaxed">
            Every wallet gets <strong className="text-gold-300">100 MB free</strong> of
            object storage backed by Cloudflare R2. Public files serve from{" "}
            <code className="font-mono text-gold-300/80">cdn.mnemedb.dev</code>{" "}
            on Cloudflare's global anycast — zero egress fees. Private files use
            presigned URLs. Quota extends by burning <span className="text-gold-300">$MNEME</span>:
          </p>

          <div className="grid sm:grid-cols-3 gap-3">
            <BurnTier tokens="100,000"    label="1 GB"   days="30" />
            <BurnTier tokens="1,000,000"  label="10 GB"  days="30" />
            <BurnTier tokens="10,000,000" label="100 GB" days="30" />
          </div>

          <p className="text-xs text-ink-500 mt-6 leading-relaxed max-w-2xl">
            Every burn permanently retires $MNEME from circulation. Real demand
            from real builders → real deflation. Burns are verified on-chain
            against the Base mainnet receipt — no off-chain trust required.
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
            Free to start. Then <span className="text-gold-300">$MNEME</span>.
          </h2>
          <p className="text-ink-400 leading-relaxed">
            Postgres, vector search, MCP, and the SDK are free during the MVP.
            Storage ships with a 100 MB free tier and a $MNEME burn mechanic
            for additional capacity (live today). Phase 2 introduces gateway
            query metering: hold $MNEME for higher API tiers, stake for
            reserved compute.
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
              No. Sign in with email, Google, X, or Apple — we create a wallet
              for you behind a passkey, you never see crypto UI. The wallet is
              just how Mneme authenticates you instead of an API key.
            </Faq>
            <Faq q="Will Mneme ever ask me to sign an onchain transaction?">
              Not in the MVP. Every interaction is a message signature
              (EIP-712), off-chain, no gas, no funds moved. Phase 2 introduces
              an optional onchain handle registry (so your handle is
              transferable and portable) — that's the only place we'd ever
              ask for a real transaction, and it's opt-in.
            </Faq>
            <Faq q="Where is my data?">
              On a Postgres + pgvector instance we manage (Neon, Frankfurt).
              Every project is a fully isolated schema
              (<code className="font-mono text-gold-300/80">agent_&lt;handle&gt;</code>) —
              no shared rows, no cross-tenant access.
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
            <Faq q="How does storage actually work?">
              Every wallet gets 100 MB free on Cloudflare R2. Files are keyed
              under <code className="font-mono text-gold-300/80">{`<handle>/<public|private>/<key>`}</code>;
              public files are served on <code className="font-mono text-gold-300/80">cdn.mnemedb.dev</code>{" "}
              with zero egress fees (Cloudflare anycast). Private files use
              presigned URLs that expire in 15 minutes by default. To extend,
              burn $MNEME on Base — 100k = 1 GB, 1M = 10 GB, 10M = 100 GB,
              each for 30 days. Every burn is verified on-chain against the
              Base receipt; nothing off-chain.
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
              onClick={signIn}
              className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-marble-100 transition"
            >
              Sign in to Mneme
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

/* ─── Top announcement banner — slim, dismissible ──────────────────────── */
const MNEME_CA = "0x3FcDbEBD5e7BaB79477cFDcA2CDCF6e904C27b07";

function AnnouncementBar() {
  const KEY = "mneme.banner.dismissed.v1";
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(KEY) === "1"
  );
  const [copied, setCopied] = useState(false);
  if (dismissed) return null;

  const copyCa = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(MNEME_CA).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative bg-gradient-to-r from-gold-300/10 via-gold-300/15 to-gold-300/10 border-b border-gold-300/20">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-2 flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-gold-300 shrink-0">✦</span>
          <span className="text-ink-200 truncate">
            <span className="font-semibold">Storage just shipped.</span>{" "}
            <span className="text-ink-400 hidden sm:inline">100 MB free · burn $MNEME for more</span>
          </span>
          <a href="/docs#storage-overview" className="hidden lg:inline text-gold-300 hover:text-gold-200 underline underline-offset-2 shrink-0">
            Read more →
          </a>

          {/* CA chip — clickable to clanker.world, copy icon next to it */}
          <span className="hidden md:inline-flex items-center gap-1 bg-ink-950/70 border border-ink-800 rounded-full pl-2 pr-1 py-0.5 ml-auto shrink-0">
            <a
              href={`https://clanker.world/clanker/${MNEME_CA}`}
              target="_blank" rel="noreferrer"
              className="text-gold-300 hover:text-gold-200 font-mono text-[10.5px] tracking-tight transition"
              title="View on clanker.world"
            >
              $MNEME · 0x3FcD…7b07
            </a>
            <button
              onClick={copyCa}
              className="p-0.5 rounded hover:bg-ink-800 transition text-ink-400 hover:text-gold-300"
              aria-label="Copy CA"
              title={copied ? "Copied!" : "Copy contract address"}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </span>

          {/* Buy link — Qwerti-powered checkout (auto-opens widget on /buy) */}
          <a
            href="/buy"
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gold-300/15 hover:bg-gold-300/25 border border-gold-300/30 hover:border-gold-300/60 text-gold-300 text-[11px] font-medium transition shrink-0"
          >
            Buy →
          </a>
        </div>
        <button
          onClick={() => { localStorage.setItem(KEY, "1"); setDismissed(true); }}
          className="text-ink-500 hover:text-white px-2 shrink-0"
          aria-label="Dismiss banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

/* ─── Feature card (Supabase-style) ─────────────────────────────────────── */
function FeatureCard({
  icon, title, desc, accents, visual,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accents: string[];
  visual: React.ReactNode;
}) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-6 flex flex-col gap-4 hover:border-gold-300/30 transition group">
      <div className="flex items-start justify-between gap-3">
        <div className="text-gold-300">{icon}</div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-1.5">{title}</h3>
        <p className="text-ink-400 text-sm leading-relaxed">{desc}</p>
      </div>

      <div className="bg-ink-950/60 border border-ink-800 rounded-lg p-3 min-h-[110px] flex flex-col justify-center">
        {visual}
      </div>

      <ul className="space-y-1 text-xs text-ink-400">
        {accents.map((a) => (
          <li key={a} className="flex items-center gap-2">
            <span className="text-gold-300/70">✓</span> {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Small visual atoms ───────────────────────────────────────────────── */
function SchemaLine({ name, hl, custom }: { name: string; hl?: boolean; custom?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-2 py-0.5 rounded ${hl ? "bg-gold-300/10 text-gold-300" : ""}`}>
      <span className={custom ? "text-gold-300/70" : ""}>{name}</span>
      <span className="text-[10px] text-ink-600">{custom ? "custom" : "default"}</span>
    </div>
  );
}
function AuthRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-300">
      <div className="w-5 h-5 rounded bg-ink-800 flex items-center justify-center text-gold-300/80 font-mono text-[10px]">{icon}</div>
      <span className="font-mono">{label}</span>
    </div>
  );
}
function RestLine({ method, path }: { method: string; path: string }) {
  const colors: Record<string, string> = { GET: "text-emerald-400", POST: "text-sky-400", PATCH: "text-amber-400", DELETE: "text-red-400" };
  return (
    <div className="flex gap-2 text-[10px]">
      <span className={`${colors[method] ?? "text-ink-400"} w-12 shrink-0`}>{method}</span>
      <span className="text-ink-400 truncate">{path}</span>
    </div>
  );
}
function VecRow({ label, score }: { label: string; score: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-ink-300">{label}</span>
      <span className="text-gold-300/80">{score}</span>
    </div>
  );
}
function QuotaBar({ used, total }: { used: number; total: number }) {
  const pct = Math.round((used / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-ink-400">
        <span>{used} MB used</span><span>{total} MB free</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
function KeyRow({ prefix, scope, revoked }: { prefix: string; scope: string; revoked?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-[10px] py-0.5 ${revoked ? "opacity-40 line-through" : ""}`}>
      <span className="text-ink-300 truncate">{prefix}…</span>
      <span className="text-gold-300/80 shrink-0">{scope}</span>
    </div>
  );
}
function PulseRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
      </span>
      <span className="font-mono text-[10px]">{label}</span>
    </div>
  );
}

/* ─── Icons (inline SVG, brand gold accents) ──────────────────────────── */
const I = ({ children, ...p }: React.SVGProps<SVGSVGElement>) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
const DbIcon       = () => <I><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></I>;
const KeyIcon      = () => <I><circle cx="15.5" cy="8.5" r="5.5"/><path d="M11 13l-7 7v3h3l1-1v-2h2v-2h2l1-1"/></I>;
const ApiIcon      = () => <I><path d="M3 12h4"/><path d="M17 12h4"/><circle cx="12" cy="12" r="4"/><path d="M12 3v4"/><path d="M12 17v4"/></I>;
const VecIcon      = () => <I><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 8v8M18 8v8M8 6h8M8 18h8"/></I>;
const StorageIcon  = () => <I><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/></I>;
const McpIcon      = () => <I><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></I>;
const TeamIcon     = () => <I><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M14 19c0-2 2-3.5 4-3.5"/></I>;
const SqlIcon      = () => <I><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></I>;
const RealtimeIcon = () => <I><circle cx="12" cy="12" r="2"/><path d="M16 8a6 6 0 010 8M8 8a6 6 0 000 8M19 5a10 10 0 010 14M5 5a10 10 0 000 14"/></I>;

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

function BurnTier({ tokens, label, days }: { tokens: string; label: string; days: string }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 text-center hover:border-gold-300/40 transition">
      <div className="font-mono text-2xl text-gold-300 mb-1">{label}</div>
      <div className="text-xs text-ink-500 uppercase tracking-wider mb-3">{days} days</div>
      <div className="font-mono text-sm text-ink-300">
        burn <span className="text-gold-300">{tokens}</span> $MNEME
      </div>
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
