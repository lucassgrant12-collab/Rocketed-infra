import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

// RainbowKit throws at config time if projectId is empty, so fall back to a
// placeholder that lets the app build/run — WalletConnect itself won't work
// until a real project ID from cloud.reown.com is set in .env.local.
export const wagmiConfig = getDefaultConfig({
  appName: "Atlus Pay",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "atlus-pay-placeholder-project-id",
  chains: [sepolia],
  ssr: true,
});
