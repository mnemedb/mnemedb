import { http } from "wagmi";
import { base } from "wagmi/chains";
import { createConfig } from "@privy-io/wagmi";

// Wagmi config provided by Privy — injects Privy-managed wallets (embedded
// + connected) as wagmi accounts so all our existing useAccount/useWalletClient
// code keeps working without changes.
export const wagmiConfig = createConfig({
  chains: [base],
  transports: { [base.id]: http() },
});
