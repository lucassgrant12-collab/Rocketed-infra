// retailers.js - the curated catalog of merchants Atlus can actually pay
// at, and the single source of truth for both the desktop app's home
// screen (GET /api/atlus/retailers) and payment creation (matching a
// domain to a real Bitrefill product_id).
//
// Every entry here was checked against the real /v2/products/:id endpoint
// before being added (see RESEARCH.md's "wider survey" entry) - the same
// discipline as BITREFILL_VISA_PRODUCT_ID before it: a product_id is never
// guessed or fuzzy-matched at request time, only ever looked up once by a
// person and hardcoded here. Bad fuzzy-search matches from that survey
// (e.g. a "steam usa" search returning Ruth's Chris Steakhouse, "next uk"
// returning a Ukrainian phone operator) are deliberately left out.
//
// `type` mirrors what the live product data actually said: "range" means
// the product accepts an exact custom amount (no rounding waste possible),
// "fixed" means only preset denominations exist (checkout total gets
// rounded up to the next package, see selectPackage() in server.js).
//
// A handful of brands (Uber Eats, Google Play, Netflix, Airbnb) use the
// exact same domain worldwide regardless of which country's card you'd
// actually be issued. Only one entry is kept per shared domain here
// (the US product), since a domain can only map to one product_id. This
// is a real v1 limitation, not an oversight: a UK or Australian user
// buying "Netflix" through Atlus today gets billed in USD against the US
// product. Locale-aware matching is future work, not attempted here.

const RETAILERS = [
  // --- Food & drink ---
  { name: "Starbucks", domain: "starbucks.com", productId: "starbucks-usa", category: "Food & drink", type: "range" },
  { name: "Uber Eats", domain: "ubereats.com", productId: "uber-eats-usa", category: "Food & drink", type: "range" },
  { name: "DoorDash", domain: "doordash.com", productId: "doordash-usa", category: "Food & drink", type: "range" },
  { name: "Chipotle", domain: "chipotle.com", productId: "chipotle-usa", category: "Food & drink", type: "range" },
  { name: "Dunkin'", domain: "dunkindonuts.com", productId: "dunkin-donuts-usa", category: "Food & drink", type: "range" },
  { name: "Subway", domain: "subway.com", productId: "subway-usa", category: "Food & drink", type: "range" },
  { name: "Burger King", domain: "bk.com", productId: "burger-king-usa", category: "Food & drink", type: "range" },
  { name: "Panera Bread", domain: "panerabread.com", productId: "panera-bread-usa", category: "Food & drink", type: "fixed" },
  { name: "Dan Murphy's", domain: "danmurphys.com.au", productId: "dan-murphy_s-australia", category: "Food & drink", type: "range" },
  { name: "Deliveroo (UK)", domain: "deliveroo.co.uk", productId: "deliveroo-uk", category: "Food & drink", type: "fixed" },
  { name: "Tim Hortons (Canada)", domain: "timhortons.com", productId: "tim-hortons-canada", category: "Food & drink", type: "range" },

  // --- Retail & department stores ---
  { name: "Target", domain: "target.com", productId: "target-usa", category: "Retail", type: "fixed" },
  { name: "Kohl's", domain: "kohls.com", productId: "kohl_s-usa", category: "Retail", type: "range" },
  { name: "JCPenney", domain: "jcpenney.com", productId: "jc-penney-usa", category: "Retail", type: "range" },
  { name: "Woolworths (AU)", domain: "woolworths.com.au", productId: "woolworths-supermarket-australia", category: "Retail", type: "fixed" },
  { name: "Coles (AU)", domain: "coles.com.au", productId: "coles-australia", category: "Retail", type: "fixed" },
  { name: "Myer (AU)", domain: "myer.com.au", productId: "myer-australia", category: "Retail", type: "fixed" },
  { name: "Bunnings (AU)", domain: "bunnings.com.au", productId: "bunnings-australia", category: "Retail", type: "fixed" },
  { name: "Officeworks (AU)", domain: "officeworks.com.au", productId: "officeworks-australia", category: "Retail", type: "fixed" },
  { name: "David Jones (AU)", domain: "davidjones.com", productId: "david-jones-australia", category: "Retail", type: "range" },
  { name: "BIG W (AU)", domain: "bigw.com.au", productId: "big-w-au", category: "Retail", type: "fixed" },
  { name: "Amart Furniture (AU)", domain: "amartfurniture.com.au", productId: "amart-furniture-australia", category: "Retail", type: "range" },
  { name: "Tesco (UK)", domain: "tesco.com", productId: "tesco-uk", category: "Retail", type: "range" },
  { name: "ASDA (UK)", domain: "asda.com", productId: "asda-uk", category: "Retail", type: "range" },
  { name: "Argos (UK)", domain: "argos.co.uk", productId: "argos-uk", category: "Retail", type: "range" },
  { name: "eBay Australia", domain: "ebay.com.au", productId: "ebay-aus", category: "Retail", type: "range" },

  // --- Electronics ---
  { name: "Best Buy", domain: "bestbuy.com", productId: "best-buy-usa", category: "Electronics", type: "range" },
  { name: "GameStop", domain: "gamestop.com", productId: "gamestop-usa", category: "Electronics", type: "range" },
  { name: "JB Hi-Fi (AU)", domain: "jbhifi.com.au", productId: "jbhifi-australia", category: "Electronics", type: "range" },

  // --- Beauty & apparel ---
  { name: "Sephora", domain: "sephora.com", productId: "sephora-usa", category: "Beauty", type: "range" },
  { name: "Ulta Beauty", domain: "ulta.com", productId: "ulta-beauty-usa", category: "Beauty", type: "range" },
  { name: "Nike", domain: "nike.com", productId: "nike-usa", category: "Apparel", type: "range" },
  { name: "Adidas", domain: "adidas.com", productId: "adidas-usa", category: "Apparel", type: "range" },
  { name: "ASOS (UK)", domain: "asos.com", productId: "asos-uk", category: "Apparel", type: "range" },
  { name: "Rebel (AU)", domain: "rebelsport.com.au", productId: "rebel-australia", category: "Apparel", type: "range" },

  // --- Pharmacy ---
  { name: "CVS Pharmacy", domain: "cvs.com", productId: "cvs-pharmacy-usa", category: "Pharmacy", type: "range" },
  { name: "Walgreens", domain: "walgreens.com", productId: "walgreens-usa", category: "Pharmacy", type: "range" },
  { name: "Chemist Warehouse (AU)", domain: "chemistwarehouse.com.au", productId: "chemist-warehouse-australia", category: "Pharmacy", type: "fixed" },
  { name: "Boots (UK)", domain: "boots.com", productId: "boots-uk", category: "Pharmacy", type: "range" },

  // --- Travel ---
  { name: "Airbnb", domain: "airbnb.com", productId: "airbnb-usa", category: "Travel", type: "range" },
  { name: "Delta", domain: "delta.com", productId: "delta-air-lines-usa", category: "Travel", type: "range" },
  { name: "Southwest Airlines", domain: "southwest.com", productId: "southwest-airlines-usa", category: "Travel", type: "range" },
  { name: "Hotels.com", domain: "hotels.com", productId: "hotels_com-usa", category: "Travel", type: "range" },
  { name: "Webjet (AU)", domain: "webjet.com.au", productId: "webjet-au", category: "Travel", type: "fixed" },

  // --- Entertainment & gaming ---
  { name: "Netflix", domain: "netflix.com", productId: "netflix-usa", category: "Entertainment", type: "fixed" },
  { name: "Regal Cinemas", domain: "regmovies.com", productId: "regal-cinemas-usa", category: "Entertainment", type: "range" },
  { name: "AMC Theatres", domain: "amctheatres.com", productId: "amc-theatres-usa", category: "Entertainment", type: "range" },
  { name: "Xbox", domain: "xbox.com", productId: "xbox-live-usa", category: "Gaming", type: "fixed" },
  { name: "PlayStation Store", domain: "store.playstation.com", productId: "sony-playstation-usa", category: "Gaming", type: "range" },
  { name: "Nintendo eShop", domain: "nintendo.com", productId: "nintendo-usa", category: "Gaming", type: "fixed" },
  { name: "Roblox", domain: "roblox.com", productId: "roblox-usa", category: "Gaming", type: "range" },
  { name: "Google Play", domain: "play.google.com", productId: "google-play-usa", category: "Gaming", type: "range" },
];

function findByDomain(hostname) {
  const clean = hostname.replace(/^www\./, "").toLowerCase();
  return RETAILERS.find((r) => clean === r.domain || clean.endsWith("." + r.domain)) || null;
}

module.exports = { RETAILERS, findByDomain };
