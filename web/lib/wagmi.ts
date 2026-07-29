import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  phantomWallet,
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

// RainbowKit throws at config time if projectId is empty, so fall back to a
// placeholder that lets the app build/run - WalletConnect itself won't work
// until a real project ID from cloud.reown.com is set in .env.local.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "atlus-pay-placeholder-project-id";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, phantomWallet, rainbowWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  { appName: "Atlus Pay", projectId }
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
  ssr: true,
});
