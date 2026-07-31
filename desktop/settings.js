// settings.js - persists the user's own cardholder name, billing address,
// and merchant blocklist to a JSON file in Electron's userData directory.
//
// No field here ships with a pre-filled real-looking value (no default
// address, no default name). A prepaid Visa's billing details need to
// match the actual cardholder for AVS checks to make sense, so a
// hardcoded placeholder address would either be obviously fake (useless)
// or someone else's real address (wrong) - either way this stays whatever
// the user actually enters in the settings window, nothing more.

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(app.getPath("userData"), "atlus-settings.json");

const DEFAULTS = {
  cardholderFirstName: "",
  cardholderLastName: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  // Domains the user has personally found reject the Atlus card, checked
  // before a payment starts (see inject/checkout.js's compatibility
  // check). Empty by default: nothing here is a verified, general list of
  // incompatible merchants, only what this user has actually observed.
  merchantBlocklist: [],
};

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(patch) {
  const merged = { ...readSettings(), ...patch };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { readSettings, writeSettings };
