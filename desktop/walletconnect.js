// walletconnect.js - lazily creates and caches the WalletConnect
// SignClient. Runs in the main process only (see main.js), never
// exposed directly to any page content, only through the specific
// wallet:connect / wallet:awaitApproval / wallet:sendTransaction IPC
// handlers.

const { app } = require("electron");
const path = require("path");
const { SignClient } = require("@walletconnect/sign-client");
const config = require("./config");

const WALLETCONNECT_PROJECT_ID =
  process.env.WALLETCONNECT_PROJECT_ID || "2bc360f0c421943267027c4213c6c2c8";

let clientPromise = null;

function getWalletConnectClient() {
  if (!clientPromise) {
    clientPromise = SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      // Without this, the SDK's default storage writes "walletconnect.db"
      // relative to whatever the process's current working directory
      // happens to be at launch, which differs between `npm start` and a
      // packaged app and isn't guaranteed writable either way. Pointing it
      // at Electron's own per-user data directory (the same place
      // settings.js keeps atlus-settings.json) is what actually makes a
      // paired session survive an app restart instead of forcing a fresh
      // QR pairing every single time the app opens.
      storageOptions: {
        database: path.join(app.getPath("userData"), "walletconnect.db"),
      },
      // `url` is shown to the user inside their wallet app during pairing
      // ("Atlus Pay wants to connect, <url>"). Points at the real local
      // dev site rather than a domain that doesn't exist yet, update this
      // once there's a real production domain to point at instead.
      metadata: {
        name: "Atlus Pay",
        description: "Pay for anything online with crypto",
        url: config.websiteUrl,
        icons: [],
      },
    });
  }
  return clientPromise;
}

module.exports = { getWalletConnectClient };
