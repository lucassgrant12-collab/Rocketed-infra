// shell.js - the address bar's own logic. Runs in the shell window's
// renderer, talks to the main process only through the narrow
// window.atlusShell bridge (see shell-preload.js).

const addressInput = document.getElementById("address");
const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");
const reloadBtn = document.getElementById("reload-btn");

addressInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    window.atlusShell.navigate(addressInput.value);
  }
});

backBtn.addEventListener("click", () => window.atlusShell.back());
forwardBtn.addEventListener("click", () => window.atlusShell.forward());
reloadBtn.addEventListener("click", () => window.atlusShell.reload());
document.getElementById("settings-btn").addEventListener("click", () => window.atlusShell.openSettings());

window.atlusShell.onUrlChanged((url) => {
  addressInput.value = url;
});
