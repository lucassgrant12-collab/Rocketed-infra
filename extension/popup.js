// popup.js - Atlus Pay payment confirmation window
//
// This is opened by background.js as a standalone chrome.windows.create
// popup, not the toolbar's default_popup. Shows the amount content.js
// detected, lets the user confirm or cancel, and reflects the background
// script's coordinator progress via "paymentSucceeded" / "paymentFailed".

const params = new URLSearchParams(window.location.search);
const detectedAmount = params.get("amount");
const amountKnown = Boolean(detectedAmount) && detectedAmount !== "Amount not detected";

const amountEl = document.getElementById("amount");
const manualAmountInput = document.getElementById("manual-amount");
const confirmBtn = document.getElementById("confirm-btn");
const cancelBtn = document.getElementById("cancel-btn");
const statusEl = document.getElementById("status");

if (amountKnown) {
  amountEl.textContent = `$${detectedAmount}`;
} else {
  amountEl.textContent = "Amount not detected";
  amountEl.classList.add("unknown");
  manualAmountInput.style.display = "block";
}

function setStatus(text, kind) {
  statusEl.textContent = text ?? "";
  statusEl.className = kind ?? "";
}

confirmBtn.addEventListener("click", () => {
  const amount = amountKnown ? detectedAmount : manualAmountInput.value.trim();
  if (!amount) {
    setStatus("Enter an amount first.", "error");
    return;
  }

  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  setStatus("Processing...");

  chrome.runtime.sendMessage({ action: "confirmPayment", amount });
});

cancelBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "cancelPayment" });
  window.close();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "paymentSucceeded") {
    setStatus("Payment complete. Filling checkout form...", "success");
    setTimeout(() => window.close(), 1200);
  } else if (message.action === "paymentFailed") {
    setStatus(message.message || "Payment failed.", "error");
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
  }
});
