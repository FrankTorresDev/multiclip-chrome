document.addEventListener("copy", () => {
  // Small delay ensures the selection text is finalized
  setTimeout(() => {
    const copiedText = document.getSelection()?.toString().trim() || "";
    if (copiedText) {
      chrome.runtime.sendMessage({ copiedText });
    }
  }, 0);
});
