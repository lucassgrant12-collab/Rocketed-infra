// config.js - where the desktop app finds the coordinator (payments) and
// the website (transaction records). Defaults point at a local dev setup.
// Before shipping an installer to anyone else, change these two defaults to
// the real deployed URLs, a packaged app launched by double-click has no
// environment variables to override them with.

module.exports = {
  coordinatorUrl: process.env.ATLUS_COORDINATOR_URL || "http://localhost:3001",
  websiteUrl: process.env.ATLUS_WEBSITE_URL || "http://localhost:3000",
};
