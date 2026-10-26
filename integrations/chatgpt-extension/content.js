// Deliberately avoids scraping private chat content, injecting into the composer, or bypassing ChatGPT approvals.
chrome.storage.local.get({suggestions:false}, ({suggestions}) => { if (suggestions) console.info('Open-Connect: local suggestions preference enabled.'); });
