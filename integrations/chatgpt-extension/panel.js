const fields = { suggest: "suggestions", context: "contextOptIn" };

chrome.storage.local.get({ suggestions: false, contextOptIn: false }, (saved) => {
  for (const [id, key] of Object.entries(fields)) {
    const el = document.getElementById(id);
    el.checked = Boolean(saved[key]);
    el.addEventListener("change", () => {
      chrome.storage.local.set({ [key]: el.checked }, () => {
        document.getElementById("status").textContent =
          "Preference saved locally; no data transmitted.";
      });
    });
  }
});
