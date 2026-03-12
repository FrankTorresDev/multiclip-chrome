chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message.copiedText) return;

  chrome.storage.local.get({ clipboardHistory: [] }, (result) => {
    const history = Array.isArray(result.clipboardHistory) ? result.clipboardHistory : [];

    // Deduplicate: if the same text already exists, remove old entry (will re-add as latest)
    const deduplicated = history.filter(item => item?.text !== message.copiedText);

    deduplicated.push({
      id: crypto.randomUUID(),
      text: message.copiedText,
      time: new Date().toISOString(),
      pinned: false,
    });

    // Keep last 100 (pinned items are preserved even beyond limit)
    const pinned   = deduplicated.filter(c => c.pinned);
    const unpinned = deduplicated.filter(c => !c.pinned);
    const trimmed  = unpinned.slice(-100);

    chrome.storage.local.set({ clipboardHistory: [...trimmed, ...pinned] });
  });
});
