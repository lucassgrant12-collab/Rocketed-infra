// main.js - Atlus Pay desktop app, Electron main process
//
// This is the whole point of the desktop pivot: a purpose-built window
// the user shops inside instead of their regular browser, so Atlus's own
// code has unrestricted control over every page loaded in it. No browser
// extension, no extension store review, no third-party policy gatekeeper.
//
// Architecture:
//   - The main window's top strip is the "shell" (shell/index.html): just
//     back/forward/reload/home and a settings button, not part of the
//     embedded browsing content. No address bar, see shell/shell.js for
//     why - Atlus isn't a general browser.
//   - A BrowserView below it starts on Atlus's own curated home screen
//     (home/index.html, a searchable grid of retailers) and navigates to
//     a real retailer's site once the user picks one. inject/checkout.js
//     is attached to it as a preload script, so it runs on every page
//     loaded there, the same job content.js does in the browser
//     extension: detect a checkout form, inject the button, drive the
//     full-page overlay.
//   - WalletConnect's SignClient runs here in the main process (it's a
//     Node.js-compatible SDK, no need to bundle it for a browser
//     context). checkout.js talks to it over ipcRenderer/ipcMain, it can
//     call ipcRenderer directly (no contextBridge indirection needed,
//     unlike the extension's injected.js/content.js split) since a
//     preload script is already privileged, there's no separate
//     "isolated world" to bridge across the way Chrome extensions have.

const { app, BrowserWindow, BrowserView, ipcMain } = require("electron");
const path = require("path");
const { getWalletConnectClient } = require("./walletconnect");
const { readSettings, writeSettings } = require("./settings");
const config = require("./config");

const SHELL_HEIGHT = 44;
const BASE_CHAIN = "eip155:8453";

let mainWindow;
let browserView;
let activeSession = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Atlus",
    backgroundColor: "#1e1f22",
    autoHideMenuBar: true,
    // The shell strip (shell/index.html) doubles as the title bar, with
    // the native window controls drawn over its right edge, instead of a
    // separate OS title bar sitting above it.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#1e1f22", symbolColor: "#b5bac1", height: SHELL_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, "shell", "shell-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "shell", "index.html"));

  browserView = new BrowserView({
    webPreferences: {
      // checkout.js is the preload script itself, not a separate bridge
      // file, see its own top comment for why.
      preload: path.join(__dirname, "inject", "checkout.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Electron sandboxes preload scripts by default (since v20), which
      // restricts require() to a small built-in whitelist and silently
      // fails on anything else, checkout.js's `require("qrcode")` included.
      // A failed preload leaves the page in a broken half-initialized
      // state (this was the cause of the black-screen render bug), so
      // sandbox is disabled to give the preload real Node module access.
      // nodeIntegration stays false, so the page content itself still has
      // no Node access, only the preload script does.
      sandbox: false,
    },
  });

  browserView.setBackgroundColor("#313338");
  mainWindow.setBrowserView(browserView);
  layoutBrowserView();
  goHome();

  mainWindow.on("resize", layoutBrowserView);

  browserView.webContents.on("did-navigate", (event, url) => {
    mainWindow.webContents.send("shell:url-changed", url);
  });
  browserView.webContents.on("did-navigate-in-page", (event, url) => {
    mainWindow.webContents.send("shell:url-changed", url);
  });
}

function layoutBrowserView() {
  const [width, height] = mainWindow.getContentSize();
  browserView.setBounds({ x: 0, y: SHELL_HEIGHT, width, height: height - SHELL_HEIGHT });
  browserView.setAutoResize({ width: true, height: true });
}

// ---------------------------------------------------------------------
// Shell IPC: the top strip's back/forward/reload/home controls. No
// free-text navigate handler, Atlus isn't a general browser, see
// shell/shell.js for why. The only way into a site is a retailer card on
// the home screen (a plain link) or a link on the site you're already on.
// ---------------------------------------------------------------------

ipcMain.handle("shell:back", () => {
  if (browserView.webContents.navigationHistory.canGoBack()) {
    browserView.webContents.navigationHistory.goBack();
  }
});

ipcMain.handle("shell:forward", () => {
  if (browserView.webContents.navigationHistory.canGoForward()) {
    browserView.webContents.navigationHistory.goForward();
  }
});

ipcMain.handle("shell:reload", () => {
  browserView.webContents.reload();
});

ipcMain.handle("shell:home", () => {
  goHome();
});

function goHome() {
  browserView.webContents.loadFile(path.join(__dirname, "home", "index.html"), {
    query: { coordinator: config.coordinatorUrl },
  });
}

// ---------------------------------------------------------------------
// Settings: cardholder name, billing address, merchant blocklist. Read
// directly by inject/checkout.js (via settings:get) for the merchant
// compatibility check and the post-payment autofill.
// ---------------------------------------------------------------------

let settingsWindow = null;

ipcMain.handle("shell:openSettings", () => {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 540,
    height: 720,
    title: "Atlus settings",
    backgroundColor: "#313338",
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, "shell", "settings-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "shell", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
});

ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:set", (event, patch) => writeSettings(patch));

// ---------------------------------------------------------------------
// WalletConnect IPC: the overlay (inside the BrowserView's page content)
// asks the main process to pair with a wallet and sign transactions.
// SignClient itself never runs in a renderer, only here.
//
// Sessions are reused, not re-paired on every payment. Earlier versions
// of checkout.js called wallet:connect unconditionally on every single
// "Pay with Atlus" click, meaning the user had to scan a fresh QR code
// even for a second payment moments after the first, despite already
// having an approved WalletConnect session sitting right there unused.
// checkout.js now checks wallet:status first and only falls back to a
// real pairing when there's genuinely no usable session, restoring one
// from disk on startup (see walletconnect.js's storageOptions) covers the
// same problem across app restarts, not just within one.
// ---------------------------------------------------------------------

async function restoreActiveSession() {
  const client = await getWalletConnectClient();

  client.on("session_delete", ({ topic }) => {
    if (activeSession?.topic === topic) activeSession = null;
  });
  client.on("session_expire", ({ topic }) => {
    if (activeSession?.topic === topic) activeSession = null;
  });

  // client.session.getAll() reflects whatever storageOptions persisted
  // from a previous run. A session found here already went through real
  // wallet approval before, it just wasn't cleanly disconnected, so it's
  // safe to treat as connected without asking the user to do anything.
  const sessions = client.session.getAll();
  const usable = sessions.find((session) => session.namespaces?.eip155?.accounts?.length);
  if (usable) activeSession = usable;
}

function sessionAddress(session) {
  const account = session.namespaces.eip155.accounts[0]; // "eip155:8453:0xabc..."
  return account.split(":")[2];
}

ipcMain.handle("wallet:status", () => {
  if (!activeSession) return { connected: false, address: null };
  return { connected: true, address: sessionAddress(activeSession) };
});

// Lets the user deliberately switch wallets from the settings window,
// the only other way a session ever clears is expiry (~7 days) or the
// wallet app itself disconnecting.
ipcMain.handle("wallet:disconnect", async () => {
  if (!activeSession) return { connected: false };
  const client = await getWalletConnectClient();
  const topic = activeSession.topic;
  activeSession = null;
  try {
    await client.disconnect({ topic, reason: { code: 6000, message: "User disconnected" } });
  } catch {
    // Already gone on the wallet's side, nothing left to clean up there,
    // clearing activeSession above is what actually matters here.
  }
  return { connected: false };
});

ipcMain.handle("wallet:connect", async () => {
  const client = await getWalletConnectClient();

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction"],
        chains: [BASE_CHAIN],
        events: ["chainChanged", "accountsChanged"],
      },
    },
  });

  // approval() resolves once the user's wallet app approves the pairing.
  // Runs async so the QR code (built from `uri`) can be shown to the
  // user immediately without waiting for that.
  const sessionPromise = approval();

  return { uri, sessionId: registerPendingSession(sessionPromise) };
});

const pendingSessions = new Map();
let sessionCounter = 0;

function registerPendingSession(promise) {
  const id = `session_${++sessionCounter}`;
  pendingSessions.set(id, promise);
  return id;
}

ipcMain.handle("wallet:awaitApproval", async (event, sessionId) => {
  const promise = pendingSessions.get(sessionId);
  if (!promise) throw new Error("Unknown wallet session");

  const session = await promise;
  pendingSessions.delete(sessionId);

  activeSession = session;
  return { address: sessionAddress(session), topic: session.topic };
});

ipcMain.handle("wallet:sendTransaction", async (event, { to, data, value }) => {
  if (!activeSession) throw new Error("No active wallet session");

  const client = await getWalletConnectClient();
  const from = sessionAddress(activeSession);

  try {
    const txHash = await client.request({
      topic: activeSession.topic,
      chainId: BASE_CHAIN,
      request: {
        method: "eth_sendTransaction",
        params: [{ from, to, data, value: value ?? "0x0" }],
      },
    });
    return { txHash };
  } catch (error) {
    // A reused session that's actually gone stale (wallet-side disconnect
    // that didn't sync back, an expiry the events above didn't catch in
    // time) surfaces here as a failed request. Clearing it means the next
    // payment attempt falls back to a fresh pairing instead of repeatedly
    // failing against a session that will never work again.
    activeSession = null;
    throw error;
  }
});

app.whenReady().then(async () => {
  createWindow();
  await restoreActiveSession();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
