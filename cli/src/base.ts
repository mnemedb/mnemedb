/**
 * Base ecosystem commands for mneme-cli — token prices, gas, TVL, trending,
 * fresh launches, wallet + address scan. All via public APIs (Dexscreener,
 * DefiLlama, CoinGecko, Base RPC) — no auth needed.
 *
 * Styled with Mneme's gold/marble palette (not the cyan/violet ClawdOS uses).
 */
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import { renderTable } from "./render";
import { gold, goldSoft, ink, inkDim, marble, ok, err, dim } from "./theme";

const basePublic = createPublicClient({ chain: base, transport: http() });

// ─── Number formatting ─────────────────────────────────────────────────
export function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs < 0.0001) {
    const exp = Math.floor(Math.log10(abs));
    const mantissa = abs / Math.pow(10, exp);
    return (n < 0 ? "-$" : "$") + mantissa.toFixed(3) + "e" + exp;
  }
  if (abs < 1) return (n < 0 ? "-$" : "$") + abs.toFixed(6);
  if (abs < 100) return (n < 0 ? "-$" : "$") + abs.toFixed(4);
  if (abs < 1_000) return (n < 0 ? "-$" : "$") + abs.toFixed(2);
  if (abs < 1_000_000) return (n < 0 ? "-$" : "$") + (abs / 1_000).toFixed(2) + "K";
  if (abs < 1_000_000_000) return (n < 0 ? "-$" : "$") + (abs / 1_000_000).toFixed(2) + "M";
  return (n < 0 ? "-$" : "$") + (abs / 1_000_000_000).toFixed(2) + "B";
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

const upStr = (s: string) => gold(s);            // gold for "up" — on-brand
const downStr = (s: string) => err(s);
export function fmtPctColored(n: number): string {
  const s = fmtPct(n);
  return n > 0 ? upStr(s) : n < 0 ? downStr(s) : marble(s);
}

export function fmtAddr(a: string): string {
  if (!a) return "—";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => SPARK[Math.min(7, Math.floor(((v - min) / range) * 8))]).join("");
}

function sectionTitle(title: string): string {
  return `  ${gold("▸")} ${goldSoft(title)}`;
}

// ─── Dexscreener helper ────────────────────────────────────────────────
interface DexPair {
  chainId:    string;
  baseToken?: { address: string; name: string; symbol: string };
  priceUsd?:  string;
  priceChange?: { h24?: number };
  liquidity?:  { usd?: number };
  marketCap?:  number;
  fdv?:        number;
  volume?:     { h24?: number };
}

function pairRow(p: DexPair) {
  const sym = p.baseToken?.symbol ?? "?";
  const name = p.baseToken?.name?.slice(0, 18) ?? "?";
  const price = p.priceUsd ? parseFloat(p.priceUsd) : 0;
  const ch24 = p.priceChange?.h24 ?? 0;
  const mcap = p.marketCap ?? p.fdv ?? 0;
  const liq = p.liquidity?.usd ?? 0;
  const v24 = p.volume?.h24 ?? 0;
  return {
    symbol:  sym,
    name,
    price:   fmtUsd(price),
    "24h":   ch24,                 // raw number → render colorizes
    mcap:    fmtUsd(mcap),
    liq:     fmtUsd(liq),
    vol_24h: fmtUsd(v24),
    address: fmtAddr(p.baseToken?.address ?? ""),
  };
}

// ─── /price ────────────────────────────────────────────────────────────
export async function cmdPrice(query: string): Promise<string> {
  if (!query.trim()) return `  ${err("✗")} usage: /price <token-symbol-or-address>`;
  const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query.trim())}`);
  if (!r.ok) return `  ${err("✗")} dexscreener error: ${r.status}`;
  const data = await r.json() as { pairs?: DexPair[] };
  const pairs = (data.pairs ?? [])
    .filter((p) => p.chainId === "base")
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .slice(0, 5);
  if (pairs.length === 0) {
    return `  ${err("✗")} no Base pair found for "${query}"`;
  }
  return "\n" + sectionTitle(`Base · "${query}" — top by liquidity`) + "\n\n" +
    renderTable(pairs.map((p) => pairRow(p)), ["symbol", "name", "price", "24h", "mcap", "liq", "vol_24h", "address"]);
}

// ─── /gas ──────────────────────────────────────────────────────────────
async function fetchEthPriceUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const d = await r.json() as { ethereum?: { usd?: number } };
    return d.ethereum?.usd ?? 3500;
  } catch {
    return 3500;
  }
}

export async function cmdGas(): Promise<string> {
  const [gasPrice, blockNumber, ethPrice] = await Promise.all([
    basePublic.getGasPrice(),
    basePublic.getBlockNumber(),
    fetchEthPriceUsd(),
  ]);
  const gwei = Number(gasPrice) / 1e9;
  const verdict =
    gwei < 0.05 ? `${ok("calm")} — basically free` :
    gwei < 0.5  ? `${ok("normal")} — comfortable`   :
    gwei < 2    ? `${goldSoft("busy")} — pay attention` :
                  `${err("congested")} — wait a few minutes`;

  const transferEth = Number(gasPrice) * 21_000 / 1e18;
  const swapEth     = Number(gasPrice) * 150_000 / 1e18;
  const deployEth   = Number(gasPrice) * 1_500_000 / 1e18;

  return [
    "",
    sectionTitle("Base · gas"),
    `  ${ink("gas price   ")} ${marble(gwei.toFixed(6))} ${goldSoft("gwei")}`,
    `  ${ink("verdict     ")} ${verdict}`,
    `  ${ink("block       ")} ${marble("#" + blockNumber.toString())}`,
    `  ${ink("eth price   ")} ${marble(fmtUsd(ethPrice))}`,
    "",
    `  ${ink("cost estimates")}`,
    `    ${inkDim("ETH transfer  (21k gas)    ")} ${marble(transferEth.toFixed(8) + " ETH")} ${inkDim("≈")} ${goldSoft(fmtUsd(transferEth * ethPrice))}`,
    `    ${inkDim("Uniswap swap  (150k gas)   ")} ${marble(swapEth.toFixed(8) + " ETH")} ${inkDim("≈")} ${goldSoft(fmtUsd(swapEth * ethPrice))}`,
    `    ${inkDim("Contract deploy (1.5M gas) ")} ${marble(deployEth.toFixed(8) + " ETH")} ${inkDim("≈")} ${goldSoft(fmtUsd(deployEth * ethPrice))}`,
    "",
  ].join("\n");
}

// ─── /trending ─────────────────────────────────────────────────────────
export async function cmdTrending(): Promise<string> {
  const r = await fetch("https://api.dexscreener.com/token-boosts/top/v1");
  if (!r.ok) return `  ${err("✗")} dexscreener boosts error: ${r.status}`;
  const data = await r.json() as Array<{ tokenAddress?: string; chainId?: string }>;
  const baseBoosts = data.filter((b) => b.chainId === "base").slice(0, 10);
  if (baseBoosts.length === 0) return `  ${err("✗")} no boosted Base tokens right now`;
  const enriched = await Promise.all(baseBoosts.map(async (b) => {
    try {
      const r2 = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${b.tokenAddress}`);
      const d2 = await r2.json() as { pairs?: DexPair[] };
      const p = (d2.pairs ?? [])
        .filter((p) => p.chainId === "base")
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      return p ? pairRow(p) : null;
    } catch { return null; }
  }));
  const rows = enriched.filter((x): x is NonNullable<typeof x> => !!x);
  if (rows.length === 0) return `  ${err("✗")} no enriched data`;
  return "\n" + sectionTitle("Base · trending (dexscreener boosts)") + "\n\n" +
    renderTable(rows, ["symbol", "name", "price", "24h", "mcap", "liq", "vol_24h"]);
}

// ─── /new ──────────────────────────────────────────────────────────────
export async function cmdNew(): Promise<string> {
  const r = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
  if (!r.ok) return `  ${err("✗")} dexscreener latest error: ${r.status}`;
  const data = await r.json() as Array<{ tokenAddress?: string; chainId?: string }>;
  const baseLatest = data.filter((t) => t.chainId === "base").slice(0, 10);
  if (baseLatest.length === 0) return `  ${err("✗")} no recent Base profiles`;
  const rows = await Promise.all(baseLatest.map(async (t) => {
    try {
      const r2 = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${t.tokenAddress}`);
      const d2 = await r2.json() as { pairs?: DexPair[] };
      const p = (d2.pairs ?? []).filter((p) => p.chainId === "base")
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      return p ? pairRow(p) : null;
    } catch { return null; }
  }));
  const filtered = rows.filter((x): x is NonNullable<typeof x> => !!x);
  if (filtered.length === 0) return `  ${err("✗")} no enriched data`;
  return "\n" + sectionTitle("Base · newest token profiles") + "\n\n" +
    renderTable(filtered, ["symbol", "name", "price", "24h", "mcap", "liq", "vol_24h"]);
}

// ─── /tvl ──────────────────────────────────────────────────────────────
export async function cmdTvl(): Promise<string> {
  const [hist, protos] = await Promise.all([
    fetch("https://api.llama.fi/v2/historicalChainTvl/Base").then((r) => r.json()) as Promise<Array<{ date: number; tvl: number }>>,
    fetch("https://api.llama.fi/protocols").then((r) => r.json()) as Promise<Array<{ name: string; chainTvls?: Record<string, number>; tvl: number }>>,
  ]);
  const recent = hist.slice(-30);
  if (recent.length === 0) return `  ${err("✗")} no TVL history`;
  const current = recent[recent.length - 1]!.tvl;
  const wkAgo = recent[recent.length - 8]?.tvl ?? current;
  const monAgo = recent[0]?.tvl ?? current;
  const wkPct = ((current - wkAgo) / wkAgo) * 100;
  const monPct = ((current - monAgo) / monAgo) * 100;
  const spark = sparkline(recent.map((d) => d.tvl));

  const baseProtos = protos
    .filter((p) => p.chainTvls && p.chainTvls["Base"])
    .sort((a, b) => (b.chainTvls!["Base"] ?? 0) - (a.chainTvls!["Base"] ?? 0))
    .slice(0, 10);

  return [
    "",
    sectionTitle("Base · TVL"),
    `  ${ink("now           ")} ${goldSoft(fmtUsd(current))}`,
    `  ${ink("7d change     ")} ${fmtPctColored(wkPct)}`,
    `  ${ink("30d change    ")} ${fmtPctColored(monPct)}`,
    `  ${ink("30d trend     ")} ${gold(spark)}`,
    "",
    sectionTitle("Top protocols by Base TVL"),
    "",
    renderTable(
      baseProtos.map((p) => ({
        protocol: p.name,
        tvl:      fmtUsd(p.chainTvls!["Base"]!),
      })),
      ["protocol", "tvl"],
    ),
  ].join("\n");
}

// ─── /wallet ───────────────────────────────────────────────────────────
export async function cmdWallet(addr: string): Promise<string> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr.trim())) {
    return `  ${err("✗")} usage: /wallet <0x...>`;
  }
  const a = addr.trim() as `0x${string}`;
  const [bal, code, ethPrice] = await Promise.all([
    basePublic.getBalance({ address: a }),
    basePublic.getBytecode({ address: a }).catch(() => undefined),
    fetchEthPriceUsd(),
  ]);
  const isContract = !!code && code !== "0x";
  const ethBal = parseFloat(formatEther(bal));

  return [
    "",
    sectionTitle(`Wallet · ${fmtAddr(a)}`),
    `  ${ink("address      ")} ${marble(a)}`,
    `  ${ink("type         ")} ${isContract ? gold("smart contract") : goldSoft("EOA")}`,
    `  ${ink("eth balance  ")} ${marble(ethBal.toFixed(6))} ${goldSoft("ETH")} ${inkDim(`(${fmtUsd(ethBal * ethPrice)})`)}`,
    "",
  ].join("\n");
}

// ─── /scan ─────────────────────────────────────────────────────────────
export async function cmdScan(addr: string): Promise<string> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr.trim())) {
    return `  ${err("✗")} usage: /scan <0x...>`;
  }
  const a = addr.trim() as `0x${string}`;
  const [bal, code, txCount] = await Promise.all([
    basePublic.getBalance({ address: a }),
    basePublic.getBytecode({ address: a }).catch(() => undefined),
    basePublic.getTransactionCount({ address: a }),
  ]);
  const isContract = !!code && code !== "0x";

  let tokenInfo = "";
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${a}`);
    const d = await r.json() as { pairs?: DexPair[] };
    const p = (d.pairs ?? []).filter((p) => p.chainId === "base")
      .sort((x, y) => (y.liquidity?.usd ?? 0) - (x.liquidity?.usd ?? 0))[0];
    if (p) {
      const ch24 = p.priceChange?.h24 ?? 0;
      tokenInfo = "\n" +
        `  ${ink("──── token data ────")}\n` +
        `  ${ink("symbol       ")} ${goldSoft(p.baseToken?.symbol ?? "?")}\n` +
        `  ${ink("name         ")} ${marble(p.baseToken?.name ?? "?")}\n` +
        `  ${ink("price        ")} ${goldSoft(fmtUsd(parseFloat(p.priceUsd ?? "0")))}\n` +
        `  ${ink("24h          ")} ${fmtPctColored(ch24)}\n` +
        `  ${ink("mcap         ")} ${marble(fmtUsd(p.marketCap ?? p.fdv ?? 0))}\n` +
        `  ${ink("liquidity    ")} ${marble(fmtUsd(p.liquidity?.usd ?? 0))}`;
    }
  } catch { /* not a token */ }

  return [
    "",
    sectionTitle(`Scan · ${fmtAddr(a)}`),
    `  ${ink("address      ")} ${marble(a)}`,
    `  ${ink("type         ")} ${isContract ? gold("smart contract") : goldSoft("EOA")}`,
    `  ${ink("eth balance  ")} ${marble(formatEther(bal))} ${goldSoft("ETH")}`,
    `  ${ink("tx count     ")} ${marble(txCount.toString())}`,
    tokenInfo,
    "",
    `  ${inkDim("basescan: https://basescan.org/address/" + a)}`,
    "",
  ].join("\n");
}
