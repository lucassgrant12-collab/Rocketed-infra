// injected.js
//
// Runs in the PAGE's own JS world, not content.js's isolated world.
// content.js injects this via a <script src="..."> tag (see
// injectPageBridge() in content.js). This is the only reliable way to
// reach window.ethereum: MetaMask injects it into the page's world, and a
// Chrome extension's isolated-world content script does not share
// arbitrary window properties with that world, only postMessage and the
// DOM itself cross the boundary.
//
// Listens for requests from content.js over window.postMessage, performs
// the actual window.ethereum.request(...) calls, and posts results back
// the same way. Never talks to any server, never sees Bitrefill or the
// coordinator at all, its only job is the wallet.

const MARKER = "atlus-pay-wallet-bridge";

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== MARKER || event.data?.direction !== "to-page") return;

  const { requestId, action, params } = event.data;

  try {
    const result = await handleAction(action, params);
    window.postMessage(
      { source: MARKER, direction: "to-content", requestId, result },
      window.location.origin
    );
  } catch (error) {
    window.postMessage(
      {
        source: MARKER,
        direction: "to-content",
        requestId,
        error: error?.message || String(error),
      },
      window.location.origin
    );
  }
});

async function handleAction(action, params) {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new Error("No wallet extension detected (window.ethereum is not available).");
  }

  switch (action) {
    case "requestAccounts": {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      return { accounts };
    }
    case "getChainId": {
      const chainId = await ethereum.request({ method: "eth_chainId" });
      return { chainId };
    }
    case "switchToMainnet": {
      // Ethereum mainnet. Real ETH, real value, this is deliberate: see
      // RESEARCH.md's note on why the payment leg moved off testnet.
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1" }],
      });
      return { chainId: "0x1" };
    }
    case "getBalance": {
      const balance = await ethereum.request({
        method: "eth_getBalance",
        params: [params.address, "latest"],
      });
      return { balanceWeiHex: balance };
    }
    case "sendTransaction": {
      const txHash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: params.from, to: params.to, value: params.valueWeiHex }],
      });
      return { txHash };
    }
    default:
      throw new Error(`Unknown wallet action: ${action}`);
  }
}
