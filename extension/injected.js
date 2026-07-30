// injected.js
//
// Runs in the PAGE's own JS world, not content.js's isolated world.
// content.js injects this via a <script src="..."> tag (see
// injectPageBridge() in content.js). This is the only reliable way to
// reach an injected wallet provider: MetaMask (window.ethereum) and
// Phantom (window.phantom.ethereum) both inject into the page's own
// world, and a Chrome extension's isolated-world content script does not
// share arbitrary window properties with that world, only postMessage
// and the DOM itself cross the boundary.
//
// Deliberately generic: this file only knows how to talk EIP-1193
// (accounts, chain id, chain switch, eth_call, sendTransaction). It has
// no idea what USDC or Base or an ERC-20 transfer is, that logic (and the
// calldata it builds) lives entirely in content.js, so the one file with
// real wallet access stays as small and auditable as possible.
//
// Listens for requests from content.js over window.postMessage, performs
// the actual window.ethereum.request(...) calls, and posts results back
// the same way. Never talks to any server, never sees Bitrefill or the
// coordinator at all, its only job is the wallet.

const MARKER = "atlus-pay-wallet-bridge";

function getProvider() {
  // Prefer Phantom if it's installed, since Phantom users otherwise have
  // no window.ethereum at all (Phantom's EVM interface lives at its own
  // namespace, not the shared one). Falls back to whatever's at
  // window.ethereum (MetaMask, or another wallet using the same slot).
  if (window.phantom?.ethereum) return window.phantom.ethereum;
  if (window.ethereum) return window.ethereum;
  return null;
}

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
  const ethereum = getProvider();
  if (!ethereum) {
    throw new Error("No wallet extension detected (MetaMask or Phantom).");
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
    case "switchChain": {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: params.chainId }],
      });
      return { chainId: params.chainId };
    }
    case "ethCall": {
      const result = await ethereum.request({
        method: "eth_call",
        params: [{ to: params.to, data: params.data }, "latest"],
      });
      return { result };
    }
    case "sendTransaction": {
      const txHash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: params.from, to: params.to, data: params.data, value: params.value ?? "0x0" }],
      });
      return { txHash };
    }
    default:
      throw new Error(`Unknown wallet action: ${action}`);
  }
}
