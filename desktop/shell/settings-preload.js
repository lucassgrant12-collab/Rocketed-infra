// settings-preload.js - narrow bridge for the settings window. Only
// settings get/set, nothing that touches a wallet or moves funds.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atlusSettings", {
  get: () => ipcRenderer.invoke("settings:get"),
  set: (patch) => ipcRenderer.invoke("settings:set", patch),
  // Status/disconnect only, deliberately no connect or send here, this
  // window has no way to move funds, only to end a connection you already
  // approved elsewhere.
  walletStatus: () => ipcRenderer.invoke("wallet:status"),
  walletDisconnect: () => ipcRenderer.invoke("wallet:disconnect"),
});
