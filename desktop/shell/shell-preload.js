// shell-preload.js - exposes a minimal, specific API to the shell UI
// (index.html/shell.js). Nothing here can move funds or sign anything,
// it only controls navigation in the BrowserView, that's deliberate:
// the shell is Atlus's own chrome around the window, kept as low-privilege
// as the actual browsing content it's steering.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atlusShell", {
  navigate: (input) => ipcRenderer.invoke("shell:navigate", input),
  back: () => ipcRenderer.invoke("shell:back"),
  forward: () => ipcRenderer.invoke("shell:forward"),
  reload: () => ipcRenderer.invoke("shell:reload"),
  onUrlChanged: (callback) => {
    ipcRenderer.on("shell:url-changed", (event, url) => callback(url));
  },
  openSettings: () => ipcRenderer.invoke("shell:openSettings"),
});
