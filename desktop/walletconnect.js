// walletconnect.js - lazily creates and caches the WalletConnect
// SignClient. Runs in the main process only (see main.js), never
// exposed directly to any page content, only through the specific
// wallet:connect / wallet:awaitApproval / wallet:sendTransaction IPC
// handlers.

const { SignClient } = require("@walletconnect/sign-client");

const WALLETCONNECT_PROJECT_ID =
  process.env.WALLETCONNECT_PROJECT_ID || "2bc360f0c421943267027c4213c6c2c8";

let clientPromise = null;

function getWalletConnectClient() {
  if (!clientPromise) {
    clientPromise = SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      // `url` is shown to the user inside their wallet app during pairing
      // ("Atlus Pay wants to connect, <url>"). Points at the real local
      // dev site rather than a domain that doesn't exist yet, update this
      // once there's a real production domain to point at instead.
      metadata: {
        name: "Atlus Pay",
        description: "Pay for anything online with crypto",
        url: "http://localhost:3000",
        icons: [],
      },
    });
  }
  return clientPromise;
}

module.exports = { getWalletConnectClient };
