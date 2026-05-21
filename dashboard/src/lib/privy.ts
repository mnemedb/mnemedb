import { base } from "wagmi/chains";
import type { PrivyClientConfig } from "@privy-io/react-auth";

export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID ?? "") as string;

/**
 * Privy login UX. Email / Google / Twitter / Apple / wallet — embedded wallet
 * auto-created for users who don't bring their own. Signatures happen silently
 * for the embedded wallet (no popup) since the user already authenticated.
 */
export const privyConfig: PrivyClientConfig = {
  appearance: {
    theme:                 "dark",
    accentColor:           "#d4af37",   // Greek gold
    logo:                  "/mnemelogo.png",
    showWalletLoginFirst:  false,        // surface email/social first, wallet as option
  },
  loginMethods: ["email", "google", "twitter", "apple", "wallet"],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  defaultChain:    base,
  supportedChains: [base],
};
