// sync-retailer-data.js - re-runnable. For every retailer in retailers.js,
// asks Bitrefill's real API for the product, then:
//   - writes retailer-data.json: the largest single purchase amount, its
//     currency, and the logo's background color, which retailers.js loads
//     so the home screen can show a real "up to" figure instead of guessing
//   - downloads the retailer's logo into ../desktop/home/logos/<productId>.png
//     (128px PNG via Bitrefill's image CDN) so the app ships its own copy
//     instead of hitting a CDN every time the home screen opens
// Re-run after adding or changing a retailer:
//   node scripts/sync-retailer-data.js
// All read-only. create-payment still checks the live product at purchase
// time, this is display data only, never what decides whether a payment works.
//
// Logos are each brand's own trademark, shown here only so people can
// recognise the store they're picking, taken from Bitrefill's catalog.

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { RETAILERS } = require("../retailers");

const key = process.env.BITREFILL_API_KEY;
if (!key) {
  console.error("BITREFILL_API_KEY is not set in coordinator/.env");
  process.exit(1);
}

const LOGO_DIR = path.join(__dirname, "..", "..", "desktop", "home", "logos");
fs.mkdirSync(LOGO_DIR, { recursive: true });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(800 * attempt);
    }
  }
}

async function getProduct(id) {
  return withRetry(async () => {
    const r = await fetch(`https://api.bitrefill.com/v2/products/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).data;
  });
}

async function downloadLogo(imageId, file) {
  const url = `https://res.cloudinary.com/bitrefill/image/upload/c_fit,f_png,h_128,w_128/${encodeURIComponent(imageId)}`;
  const buf = await withRetry(async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!(r.headers.get("content-type") || "").startsWith("image/")) throw new Error("not an image");
    return Buffer.from(await r.arrayBuffer());
  });
  fs.writeFileSync(file, buf);
}

(async () => {
  const data = {};
  const failed = [];
  for (const retailer of RETAILERS) {
    try {
      const p = await getProduct(retailer.productId);
      const packageMax = Math.max(0, ...(p.packages || []).map((pkg) => Number(pkg.value)));
      const max = p.range ? Math.max(Number(p.range.max), packageMax) : packageMax;
      const entry = { currency: p.currency, logoBackground: p.logo_background || "#FFFFFF" };
      if (max) entry.max = max;
      if (p.image) await downloadLogo(p.image, path.join(LOGO_DIR, `${retailer.productId}.png`));
      else failed.push(`${retailer.name}: no image`);
      data[retailer.productId] = entry;
    } catch (error) {
      failed.push(`${retailer.name}: ${error.message}`);
    }
    await sleep(150);
  }
  fs.writeFileSync(path.join(__dirname, "..", "retailer-data.json"), JSON.stringify(data, null, 2) + "\n");
  const logos = fs.readdirSync(LOGO_DIR).filter((f) => f.endsWith(".png")).length;
  console.log(`retailer-data.json: ${Object.keys(data).length}/${RETAILERS.length} retailers, ${logos} logos in desktop/home/logos/`);
  if (failed.length) console.log("Problems:\n  " + failed.join("\n  "));
})();
