// home.js - the Atlus home screen shown inside the BrowserView. Fetches
// the real retailer catalog from the coordinator (source of truth is
// coordinator/retailers.js) and renders it as a searchable grid. Clicking
// a card is a plain link, no IPC bridge needed: the BrowserView just
// navigates to that retailer's real site the same way any browser link
// click would.

const COORDINATOR_URL = "http://localhost:3001";

const searchInput = document.getElementById("search");
const resultsEl = document.getElementById("results");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");

let retailers = [];

function render(filterText) {
  const q = filterText.trim().toLowerCase();
  const matches = q
    ? retailers.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    : retailers;

  if (!matches.length) {
    resultsEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  const byCategory = new Map();
  for (const r of matches) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  resultsEl.innerHTML = [...byCategory.entries()]
    .map(
      ([category, items]) => `
        <div class="category-block">
          <div class="category">${escapeHtml(category)}</div>
          <div class="grid">
            ${items
              .map(
                (r) => `
                  <a class="card" href="https://${escapeHtml(r.domain)}">
                    <div class="card-name">${escapeHtml(r.name)}</div>
                    <span class="card-tag ${r.type}">${r.type === "range" ? "Any amount" : "Fixed amounts"}</span>
                  </a>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

searchInput.addEventListener("input", () => render(searchInput.value));

fetch(`${COORDINATOR_URL}/api/atlus/retailers`)
  .then((r) => r.json())
  .then((data) => {
    retailers = data.retailers || [];
    render("");
  })
  .catch(() => {
    errorEl.style.display = "block";
  });
