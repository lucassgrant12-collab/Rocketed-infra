"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";

/**
 * Relays the connected wallet address to the Atlus Pay browser extension
 * via window.postMessage. The extension's wallet-bridge.js content script
 * (only injected on this site) picks this up and stores it, so a payment
 * started from the extension can carry a wallet address without the user
 * reconnecting inside the extension itself. Renders nothing — this is
 * purely a side-channel, mounted once for the whole site in providers.tsx
 * so it stays in sync regardless of which page is showing.
 */
export function WalletBridge() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (isConnected && address) {
      window.postMessage(
        { source: "atlus-pay-website", type: "WALLET_CONNECTED", address },
        window.location.origin
      );
    } else {
      window.postMessage(
        { source: "atlus-pay-website", type: "WALLET_DISCONNECTED" },
        window.location.origin
      );
    }
  }, [isConnected, address]);

  return null;
}
