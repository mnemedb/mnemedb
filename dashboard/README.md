# mneme-dashboard

Vite + React + TS + Tailwind dashboard for Mneme. Connect a wallet, list your
tables, browse rows. Apple-smooth dark theme by default.

## Run

```bash
cp .env.example .env.local
bun install
bun run dev
# → http://localhost:5173
```

## Stack

- React 19 + TypeScript
- Vite 5
- Tailwind 3 (custom `ink-*` palette, system-font stack)
- wagmi 2 + viem (injected + Coinbase Wallet connectors, Base mainnet)
- @tanstack/react-query
- mneme-sdk (workspace)

## Pages (v1)

- **Header** — connect/disconnect wallet
- **Sidebar** — list of tables in your agent namespace
- **Main** — selected table's rows (paginated, first 50)

## Phase 2

SQL editor · vector search playground · schema designer · MCP config exporter ·
onchain permissions UI (grant/revoke cross-agent reads).
