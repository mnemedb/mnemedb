/**
 * ERC-7715 — wallet_requestExecutionPermissions request builder.
 *
 * Spec: https://eips.ethereum.org/EIPS/eip-7715
 *
 *   type PermissionRequest = {
 *     chainId: Hex
 *     from?: Address
 *     to: Address                  // the agent that will redeem the permission
 *     permission: {
 *       type: string               // e.g. 'erc20-token-recurring-allowance', 'native-token-stream'
 *       isAdjustmentAllowed: boolean
 *       data: Record<string, any>
 *     }
 *     rules?: { type: string; data: Record<string, any> }[]
 *   }[]
 *
 * The matching response contains:
 *   - context: Hex                 // opaque blob to redeem via ERC-7710
 *   - delegationManager: Address   // contract that redeems
 *   - dependencies: factory + factoryData[]
 *
 * Mneme persists the permission request as `erc7715_permissions` on the
 * mandate row; the response context + delegationManager get stored on
 * arm/grant so the worker can later call ERC-7710 `redeemDelegations`.
 */

export type Hex     = `0x${string}`;
export type Address = `0x${string}`;

export interface Erc7715PermissionRequest {
  chainId:    Hex;
  from?:      Address;
  to:         Address;
  permission: {
    type:                string;
    isAdjustmentAllowed: boolean;
    data:                Record<string, unknown>;
  };
  rules?: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

interface Mandate {
  kind:            string;
  intent:          Record<string, unknown>;
  spend_cap_usdc:  string | number | null;
  risk_profile:    Record<string, unknown>;
  expires_at:      string | Date | null;
}

/** Common Base token addresses used as defaults. */
const TOKEN_ADDRESS: Record<string, Address> = {
  USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  ETH:  "0x0000000000000000000000000000000000000000",
  WETH: "0x4200000000000000000000000000000000000006",
};

function toHex(n: number | bigint): Hex {
  const v = typeof n === "bigint" ? n : BigInt(Math.round(n));
  return ("0x" + v.toString(16)) as Hex;
}

function isoToUnix(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const t = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** Resolve a token symbol or 0x address to a 0x address. Returns null on invalid. */
function resolveToken(t: unknown): Address | null {
  if (typeof t !== "string") return null;
  const s = t.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase() as Address;
  const up = s.toUpperCase();
  return TOKEN_ADDRESS[up] ?? null;
}

/**
 * Compile a Mneme Mandate to one (or more) ERC-7715 PermissionRequest
 * entries, plus an optional `expiry` rule applied across them.
 *
 * `agentAddress` is the account that will redeem the permission on the
 * user's behalf (the `to` field per spec).
 *
 * `chainId` defaults to 8453 (Base) but caller can pass any Hex.
 */
export function mandateToErc7715(
  mandate:      Mandate,
  agentAddress: Address,
  opts?:        { chainId?: number; userAddress?: Address },
): Erc7715PermissionRequest[] {
  const chainId = toHex(opts?.chainId ?? 8453);
  const expiry  = isoToUnix(mandate.expires_at);
  const risk    = mandate.risk_profile ?? {};
  const intent  = mandate.intent       ?? {};

  // Common rules — expiry applied to every entry in the request.
  const rules: NonNullable<Erc7715PermissionRequest["rules"]> = [];
  if (expiry) rules.push({ type: "expiry", data: { timestamp: expiry } });

  const requests: Erc7715PermissionRequest[] = [];

  // ─── Swap / send: spend-cap on a token ───────────────────────────────
  if (mandate.kind === "swap" || mandate.kind === "send") {
    const fromToken = resolveToken(intent.from_token);
    const cap       = mandate.spend_cap_usdc != null ? Number(mandate.spend_cap_usdc) : null;

    if (fromToken && cap && cap > 0) {
      // Most common spend gating: recurring token allowance.
      // 6 decimals assumed for USDC; for other tokens caller can override via
      // intent.from_decimals.
      const decimals = typeof intent.from_decimals === "number" ? intent.from_decimals : 6;
      const amountRaw = BigInt(Math.floor(cap * 10 ** decimals));
      const period    = typeof intent.period_seconds === "number" ? intent.period_seconds : 86_400; // daily

      requests.push({
        chainId,
        from: opts?.userAddress,
        to:   agentAddress,
        permission: {
          type: "erc20-token-recurring-allowance",
          isAdjustmentAllowed: false,
          data: {
            token:       fromToken,
            amount:      toHex(amountRaw),
            period:      period,
            startTime:   Math.floor(Date.now() / 1000),
          },
        },
        ...(rules.length ? { rules } : {}),
      });
    } else if (cap && cap > 0 && intent.from_token === "ETH") {
      // Native ETH spend gating
      const amountRawWei = BigInt(Math.floor(cap * 1e18));   // crude $→ETH not done here
      requests.push({
        chainId,
        from: opts?.userAddress,
        to:   agentAddress,
        permission: {
          type: "native-token-recurring-allowance",
          isAdjustmentAllowed: false,
          data: {
            amount:    toHex(amountRawWei),
            period:    typeof intent.period_seconds === "number" ? intent.period_seconds : 86_400,
            startTime: Math.floor(Date.now() / 1000),
          },
        },
        ...(rules.length ? { rules } : {}),
      });
    }
  }

  // ─── Stake / LP / perp / predict: scoped contract-call permission ────
  // Per ERC-7715 the type for this is implementation-defined; we use a
  // commonly-proposed shape: 'contract-call' with allowlists.
  const allowed = Array.isArray(risk.allowed_protocols) ? risk.allowed_protocols : null;
  if (mandate.kind !== "swap" && mandate.kind !== "send" && allowed && allowed.length > 0) {
    requests.push({
      chainId,
      from: opts?.userAddress,
      to:   agentAddress,
      permission: {
        type: "contract-call",
        isAdjustmentAllowed: false,
        data: {
          allowedContracts: allowed,
          maxSlippage:      risk.max_slippage ?? 0.01,
          mandateKind:      mandate.kind,
        },
      },
      ...(rules.length ? { rules } : {}),
    });
  }

  // Fallback — if we built nothing, emit a single permission carrying the
  // raw intent so the wallet can decide what to grant. Conservative.
  if (requests.length === 0) {
    requests.push({
      chainId,
      from: opts?.userAddress,
      to:   agentAddress,
      permission: {
        type: "custom",
        isAdjustmentAllowed: true,
        data: {
          mandateKind: mandate.kind,
          intent,
          riskProfile: risk,
          spendCapUsdc: mandate.spend_cap_usdc,
        },
      },
      ...(rules.length ? { rules } : {}),
    });
  }

  return requests;
}
