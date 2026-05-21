import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Primary: Coinbase Smart Wallet — passkey, email signup, no browser extension.
    coinbaseWallet({
      appName:    "Mneme",
      preference: "smartWalletOnly",
    }),
    // Fallback: any injected wallet (MetaMask, Rabby, Brave Wallet, …).
    injected(),
  ],
  transports: { [base.id]: http() },
});
