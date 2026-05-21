import { keccak256, toBytes, type Account } from "viem";

export const MNEME_TYPES = {
  MnemeRequest: [
    { name: "method",    type: "string"  },
    { name: "path",      type: "string"  },
    { name: "bodyHash",  type: "bytes32" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce",     type: "string"  },
  ],
} as const;

export interface SignRequestParams {
  account:       Account;
  chainId:       number;
  domainName:    string;
  domainVersion: string;
  method:        string;
  path:          string;
  body:          string;
}

export interface SignedHeaders {
  "X-Mneme-Wallet":    string;
  "X-Mneme-Timestamp": string;
  "X-Mneme-Nonce":     string;
  "Authorization":     string;
}

export async function signRequest(p: SignRequestParams): Promise<SignedHeaders> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce     = randomNonce();
  const bodyHash  = keccak256(toBytes(p.body));

  if (!p.account.signTypedData) {
    throw new Error("Account must support signTypedData (use privateKeyToAccount or a viem LocalAccount)");
  }

  const signature = await p.account.signTypedData({
    domain: { name: p.domainName, version: p.domainVersion, chainId: p.chainId },
    types: MNEME_TYPES,
    primaryType: "MnemeRequest",
    message: {
      method:    p.method,
      path:      p.path,
      bodyHash,
      timestamp: BigInt(timestamp),
      nonce,
    },
  });

  return {
    "X-Mneme-Wallet":    p.account.address,
    "X-Mneme-Timestamp": String(timestamp),
    "X-Mneme-Nonce":     nonce,
    "Authorization":     `Mneme ${signature}`,
  };
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
