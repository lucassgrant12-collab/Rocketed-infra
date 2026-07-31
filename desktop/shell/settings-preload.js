// settings-preload.js - narrow bridge for the settings window. Only
// settings get/set, nothing that touches a wallet or moves funds.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atlusSettings", {
  get: () => ipcRenderer.invoke("settings:get"),
  set: (patch) => ipcRenderer.invoke("settings:set", patch),
});
