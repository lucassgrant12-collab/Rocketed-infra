// home.js - the Atlus home screen shown inside the BrowserView. Fetches
// the real retailer catalog from the coordinator (source of truth is
// coordinator/retailers.js) and renders it as a categorized, searchable
// list. Clicking a tile is a plain link, no IPC bridge needed: the
// BrowserView just navigates to that retailer's real site the same way any
// browser link click would.
//
// The wallet panel and settings button are the only parts that need the
// main process, through the narrow window.atlusHome bridge that
// inject/checkout.js exposes on this local page (and only this kind of
// page).

// main.js passes the real coordinator URL in the query string (see goHome),
// this page has no Node access to read config.js itself.
const COORDINATOR_URL =
  new URLSearchParams(window.location.search).get("coordinator") || "http://localhost:3001";

const $ = (id) => document.getElementById(id);
const searchInput = $("search");
const resultsEl = $("results");
const categoriesEl = $("categories");
const emptyEl = $("empty");
const errorEl = $("error");

let retailers = [];
let activeCategory = "All stores";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function money(amount, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function subtitle(r) {
  if (r.max != null) return `Up to ${money(r.max, r.currency)}`;
  return r.type === "range" ? "Any amount" : "Fixed amounts";
}

function categoryList() {
  const counts = new Map();
  for (const r of retailers) counts.set(r.category, (counts.get(r.category) || 0) + 1);
  return [["All stores", retailers.length], ...counts.entries()];
}

function renderSidebar() {
  categoriesEl.innerHTML =
    `<div class="group-label">Categories</div>` +
    categoryList()
      .map(
        ([name, count]) => `
          <button class="channel${name === activeCategory ? " active" : ""}" data-category="${escapeHtml(name)}">
            <span>${escapeHtml(name)}</span><span class="count">${count}</span>
          </button>`
      )
      .join("");
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const matches = retailers.filter(
    (r) =>
      (activeCategory === "All stores" || r.category === activeCategory) &&
      (!q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
  );

  $("head-title").textContent = activeCategory;
  resultsEl.innerHTML = "";
  emptyEl.hidden = matches.length > 0;
  if (!matches.length) {
    $("empty-body").textContent = q
      ? `Nothing matches "${searchInput.value.trim()}". Atlus only lists stores it has checked.`
      : "There are no stores in this category yet.";
    return;
  }

  const byCategory = new Map();
  for (const r of matches) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  resultsEl.innerHTML = [...byCategory.entries()]
    .map(
      ([category, items]) => `
        <section>
          <div class="section-head">${escapeHtml(category)} &mdash; ${items.length}</div>
          <div class="grid">
            ${items
              .map(
                (r) => `
                  <a class="tile" href="https://${escapeHtml(r.domain)}">
                    <div class="tile-icon" style="background:${escapeHtml(r.logoBackground || "#404249")}">
                      <img src="logos/${escapeHtml(r.productId)}.png" alt="" loading="lazy" />
                      <span class="tile-letter">${escapeHtml(r.name.charAt(0).toUpperCase())}</span>
                    </div>
                    <div class="tile-text">
                      <div class="tile-name">${escapeHtml(r.name)}</div>
                      <div class="tile-sub">${escapeHtml(subtitle(r))}</div>
                    </div>
                  </a>`
              )
              .join("")}
          </div>
        </section>`
    )
    .join("");
}

// A logo that fails to load falls back to the store's first letter, which
// stays hidden unless that happens (logos can be transparent, so a letter
// sitting underneath would show through them).
resultsEl.addEventListener(
  "error",
  (event) => {
    if (event.target.tagName !== "IMG") return;
    event.target.closest(".tile-icon")?.classList.add("no-logo");
    event.target.remove();
  },
  true
);

categoriesEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-category]");
  if (!btn) return;
  activeCategory = btn.dataset.category;
  renderSidebar();
  render();
});

searchInput.addEventListener("input", render);

// Ctrl+K or "/" jumps to search, Escape clears it.
document.addEventListener("keydown", (event) => {
  const typing = document.activeElement === searchInput;
  if ((event.ctrlKey && event.key.toLowerCase() === "k") || (!typing && event.key === "/")) {
    event.preventDefault();
    searchInput.focus();
  } else if (event.key === "Escape" && typing) {
    searchInput.value = "";
    render();
    searchInput.blur();
  }
});

// ---------- wallet panel ----------

async function refreshWallet() {
  if (!window.atlusHome) return;
  try {
    const { connected, address } = await window.atlusHome.walletStatus();
    $("presence").classList.toggle("on", connected);
    $("wallet-status").textContent = connected
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "Not connected";
  } catch {
    // Leave whatever was showing, a failed status check isn't worth a banner.
  }
}

$("settings").addEventListener("click", () => window.atlusHome?.openSettings());
// The wallet can change while this page sits open (connecting from a
// checkout, disconnecting in Settings), so re-check whenever it regains focus.
window.addEventListener("focus", refreshWallet);

// ---------- load ----------

async function load() {
  errorEl.hidden = true;
  try {
    const response = await fetch(`${COORDINATOR_URL}/api/atlus/retailers`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    retailers = (await response.json()).retailers || [];
    renderSidebar();
    render();
  } catch {
    resultsEl.innerHTML = "";
    emptyEl.hidden = true;
    errorEl.hidden = false;
  }
}

$("retry").addEventListener("click", load);
refreshWallet();
load();
