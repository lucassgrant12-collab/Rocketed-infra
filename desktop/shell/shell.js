// shell.js - the top strip's own logic. Runs in the shell window's
// renderer, talks to the main process only through the narrow
// window.atlusShell bridge (see shell-preload.js).
//
// No free-text URL/search bar here on purpose: Atlus isn't a general
// browser, navigation happens by picking a retailer on the home screen
// (see home/home.js) or clicking a link on the site you're already on.
// This strip is just back/forward/reload/home plus a read-only label of
// where you currently are.

const siteEl = document.getElementById("site");
const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");
const reloadBtn = document.getElementById("reload-btn");
const homeBtn = document.getElementById("home-btn");
const brandEl = document.getElementById("brand");

backBtn.addEventListener("click", () => window.atlusShell.back());
forwardBtn.addEventListener("click", () => window.atlusShell.forward());
reloadBtn.addEventListener("click", () => window.atlusShell.reload());
homeBtn.addEventListener("click", () => window.atlusShell.home());
brandEl.addEventListener("click", () => window.atlusShell.home());
document.getElementById("settings-btn").addEventListener("click", () => window.atlusShell.openSettings());

window.atlusShell.onUrlChanged((url) => {
  try {
    const parsed = new URL(url);
    siteEl.textContent = parsed.protocol === "file:" ? "" : parsed.hostname;
  } catch {
    siteEl.textContent = "";
  }
});
