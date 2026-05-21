import { useReadContract } from "wagmi";

export const AGENT_REGISTRY_ADDRESS = (
  import.meta.env.VITE_AGENT_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const agentRegistryAbi = [
  {
    type: "function",
    name: "register",
    inputs: [{ name: "handle", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "namespaceOf",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "walletOf",
    inputs: [{ name: "namespace", type: "bytes32" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

export function bytes32ToString(b: `0x${string}`): string {
  const hex = b.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let len = bytes.length;
  while (len > 0 && bytes[len - 1] === 0) len--;
  return new TextDecoder().decode(bytes.slice(0, len));
}

const registryConfigured = AGENT_REGISTRY_ADDRESS !== ZERO_ADDRESS;

export function useHandle(wallet?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContract({
    address:      AGENT_REGISTRY_ADDRESS,
    abi:          agentRegistryAbi,
    functionName: "namespaceOf",
    args:         wallet ? [wallet] : undefined,
    query:        { enabled: !!wallet && registryConfigured },
  });

  const handle =
    data && data !== ZERO_BYTES32
      ? bytes32ToString(data as `0x${string}`)
      : null;

  return { handle, isLoading, refetch, configured: registryConfigured };
}
