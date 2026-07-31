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

const SHELL_HEIGHT = 44;

let mainWindow;
let browserView;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  browserView.webContents.loadFile(path.join(__dirname, "home", "index.html"));
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
    width: 420,
    height: 640,
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
// ---------------------------------------------------------------------

ipcMain.handle("wallet:connect", async () => {
  const client = await getWalletConnectClient();

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction"],
        chains: ["eip155:8453"], // Base
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

  const account = session.namespaces.eip155.accounts[0]; // "eip155:8453:0xabc..."
  const address = account.split(":")[2];

  activeSession = session;
  return { address, topic: session.topic };
});

let activeSession = null;

ipcMain.handle("wallet:sendTransaction", async (event, { to, data, value }) => {
  if (!activeSession) throw new Error("No active wallet session");

  const client = await getWalletConnectClient();
  const [account] = activeSession.namespaces.eip155.accounts;
  const from = account.split(":")[2];

  const txHash = await client.request({
    topic: activeSession.topic,
    chainId: "eip155:8453",
    request: {
      method: "eth_sendTransaction",
      params: [{ from, to, data, value: value ?? "0x0" }],
    },
  });

  return { txHash };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
