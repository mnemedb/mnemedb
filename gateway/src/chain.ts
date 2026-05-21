import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

/**
 * Public client used for signature verification that needs an on-chain
 * fallback (ERC-1271 / ERC-6492) — i.e. smart contract wallets like
 * Coinbase Smart Wallet, Safe, Argent.
 *
 * EOA signatures verify offline via ECDSA inside viem; no RPC call.
 * Only smart-wallet sigs incur a single eth_call.
 */
export const publicClient = createPublicClient({
  chain:     base,
  transport: http(RPC_URL),
});
