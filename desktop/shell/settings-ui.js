// settings-ui.js - the settings window's own logic. Talks to the main
// process only through window.atlusSettings (see settings-preload.js).

const fields = {
  firstName: document.getElementById("firstName"),
  lastName: document.getElementById("lastName"),
  line1: document.getElementById("line1"),
  line2: document.getElementById("line2"),
  city: document.getElementById("city"),
  state: document.getElementById("state"),
  zip: document.getElementById("zip"),
  blocklist: document.getElementById("blocklist"),
};
const statusEl = document.getElementById("status");

async function load() {
  const settings = await window.atlusSettings.get();
  fields.firstName.value = settings.cardholderFirstName;
  fields.lastName.value = settings.cardholderLastName;
  fields.line1.value = settings.billingAddressLine1;
  fields.line2.value = settings.billingAddressLine2;
  fields.city.value = settings.billingCity;
  fields.state.value = settings.billingState;
  fields.zip.value = settings.billingZip;
  fields.blocklist.value = (settings.merchantBlocklist || []).join("\n");
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  await window.atlusSettings.set({
    cardholderFirstName: fields.firstName.value.trim(),
    cardholderLastName: fields.lastName.value.trim(),
    billingAddressLine1: fields.line1.value.trim(),
    billingAddressLine2: fields.line2.value.trim(),
    billingCity: fields.city.value.trim(),
    billingState: fields.state.value.trim(),
    billingZip: fields.zip.value.trim(),
    merchantBlocklist: fields.blocklist.value
      .split("\n")
      .map((line) => line.trim().toLowerCase().replace(/^www\./, ""))
      .filter(Boolean),
  });
  statusEl.textContent = "Saved.";
  setTimeout(() => (statusEl.textContent = ""), 2000);
});

load();
