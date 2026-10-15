// shell.js - the top strip's own logic. Runs in the shell window's
// renderer, talks to the main process only through the narrow
// window.atlusShell bridge (see shell-preload.js).
//
// No free-text URL/search bar here on purpose: Atlus isn't a general
// browser, navigation happens by picking a retailer on the home screen
// (see home/home.js) or clicking a link on the site you're already on.
// This strip is back/forward/reload/home plus a read-only label of where
// you currently are.

const siteText = document.getElementById("site-text");

document.getElementById("back-btn").addEventListener("click", () => window.atlusShell.back());
document.getElementById("forward-btn").addEventListener("click", () => window.atlusShell.forward());
document.getElementById("reload-btn").addEventListener("click", () => window.atlusShell.reload());
document.getElementById("home-btn").addEventListener("click", () => window.atlusShell.home());
document.getElementById("brand").addEventListener("click", () => window.atlusShell.home());
document.getElementById("settings-btn").addEventListener("click", () => window.atlusShell.openSettings());

window.atlusShell.onUrlChanged((url) => {
  try {
    const parsed = new URL(url);
    siteText.textContent = parsed.protocol === "file:" ? "Store directory" : parsed.hostname.replace(/^www\./, "");
  } catch {
    siteText.textContent = "Store directory";
  }
});
