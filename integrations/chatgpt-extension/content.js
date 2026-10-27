// Do not scrape private chat content or bypass ChatGPT approvals.
chrome.storage.local.get({ suggestions: false }, ({ suggestions }) => {
  if (suggestions) {
    console.info("Open-Connect: local suggestions preference enabled.");
  }
});
