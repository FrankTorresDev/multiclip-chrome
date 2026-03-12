document.addEventListener("DOMContentLoaded", () => {
  const clipsDiv        = document.getElementById("clips-div");
  const clearListBtn    = document.getElementById("clear-list-btn");
  const searchInput     = document.getElementById("clip-search");
  const clipCountEl     = document.getElementById("clip-count");
  const sortBtn         = document.getElementById("sort-btn");
  const sortIndicator   = document.getElementById("sort-indicator");
  const modal           = document.getElementById("expand-modal");
  const modalText       = document.getElementById("modal-text");
  const modalClose      = document.getElementById("modal-close");
  const modalCopyBtn    = document.getElementById("modal-copy-btn");
  const toastEl         = document.getElementById("toast");

  let history      = [];   // full unfiltered list (chronological asc)
  let sortNewest   = true; // sort direction
  let focusedIndex = -1;   // keyboard nav index in rendered list
  let toastTimer   = null;

  // ── Toast ─────────────────────────────────────────
  function showToast(msg, duration = 1600) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), duration);
  }

  // ── Clipboard ─────────────────────────────────────
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch { return false; }
    }
  }

  // ── IDs ───────────────────────────────────────────
  function ensureClipIds(list) {
    let changed = false;
    const withIds = (Array.isArray(list) ? list : []).map((item, idx) => {
      if (item?.id) return item;
      changed = true;
      return { ...item, id: crypto?.randomUUID?.() || `clip-${Date.now()}-${idx}` };
    });
    return { withIds, changed };
  }

  // ── Text helpers ──────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

  function highlightMatchSafe(text, query) {
    const safe = escapeHtml(text || "");
    if (!query) return safe;
    const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
    return safe.replace(regex, "<mark>$1</mark>");
  }

  function getSnippet(text, query, lead=10, tail=65) {
    const raw = String(text || "");
    if (!query) return raw;
    const idx = raw.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return raw;
    const start = Math.max(0, idx - lead);
    const end   = Math.min(raw.length, idx + query.length + tail);
    let s = raw.slice(start, end);
    if (start > 0) s = "…" + s;
    if (end < raw.length) s += "…";
    return s;
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff/60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff/3_600_000)}h ago`;
    return d.toLocaleString("en-US", { month:"2-digit", day:"2-digit", year:"2-digit", hour:"numeric", minute:"2-digit", hour12:true });
  }

  // ── Storage helpers ───────────────────────────────
  async function saveHistory(h) {
    await chrome.storage.local.set({ clipboardHistory: h });
  }

  async function deleteClip(clipId) {
    history = history.filter(c => c.id !== clipId);
    await saveHistory(history);
    rerender();
  }

  async function togglePin(clipId) {
    history = history.map(c => c.id === clipId ? { ...c, pinned: !c.pinned } : c);
    await saveHistory(history);
    rerender();
  }

  // ── Sort / filter helpers ─────────────────────────
  function getDisplayList(query) {
    let list = [...history];

    // filter
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(c => (c?.text || "").toLowerCase().includes(q));
    }

    // sort: pinned first, then by time
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const ta = new Date(a.time).getTime();
      const tb = new Date(b.time).getTime();
      return sortNewest ? tb - ta : ta - tb;
    });

    return list;
  }

  // ── UI update ─────────────────────────────────────
  function updateCount() {
    clipCountEl.textContent = history.length;
  }

  function rerender() {
    const q = searchInput.value.trim();
    renderClips(getDisplayList(q), q);
    updateCount();
    focusedIndex = -1;
  }

  // ── SVG icons ─────────────────────────────────────
  function makeSvg(d, viewBox = "0 0 24 24") {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width","16"); svg.setAttribute("height","16");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","2.2");
    svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
    return svg;
  }

  function makeCopySvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width","15"); svg.setAttribute("height","15");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","2.2");
    svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");
    ["M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-2",
     "M16 4h2a2 2 0 012 2v2",
     "M21 14H11",
     "M15 10l-4 4 4 4"].forEach(d => {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  // ── Render ─────────────────────────────────────────
  function clearUI() {
    while (clipsDiv.firstChild) clipsDiv.removeChild(clipsDiv.firstChild);
  }

  function renderEmptyState(msg = "No clipped text yet", sub = 'Copy any text on the page to save it here.') {
    clearUI();
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    wrap.innerHTML = `
      <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="2" width="13" height="15" rx="2"/><rect x="3" y="7" width="13" height="15" rx="2"/>
      </svg>
      <p class="empty-title">${escapeHtml(msg)}</p>
      <p class="empty-sub">${escapeHtml(sub)}</p>`;
    clipsDiv.appendChild(wrap);
  }

  function renderClips(list, query = "") {
    clearUI();
    focusedIndex = -1;

    if (!Array.isArray(list) || list.length === 0) {
      renderEmptyState(
        query ? "No matching clips" : "No clipped text yet",
        query ? `No results for "${query}".` : "Copy any text on the page to save it here."
      );
      return;
    }

    list.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "clip-card" + (item.pinned ? " pinned" : "");
      card.setAttribute("role", "listitem");
      card.setAttribute("tabindex", "0");
      card.dataset.index = index;

      // Number
      const num = document.createElement("span");
      num.className = "clip-num";
      num.textContent = `#${index + 1}`;
      card.appendChild(num);

      // Text
      const textWrapper = document.createElement("div");
      textWrapper.className = "clip-text-wrapper";
      const textEl = document.createElement("div");
      textEl.className = "clip-text";
      const snippet = getSnippet(item.text, query);
      textEl.innerHTML = highlightMatchSafe(snippet, query);
      textEl.title = "Click to expand";
      textWrapper.addEventListener("click", () => openModal(item.text));
      textWrapper.appendChild(textEl);
      card.appendChild(textWrapper);

      // Actions
      const actions = document.createElement("div");
      actions.className = "clip-actions";

      // Pin btn
      const pinBtn = document.createElement("button");
      pinBtn.className = "action-btn pin-btn" + (item.pinned ? " pinned-active" : "");
      pinBtn.title = item.pinned ? "Unpin" : "Pin to top";
      pinBtn.setAttribute("aria-label", item.pinned ? "Unpin clip" : "Pin clip to top");
      pinBtn.appendChild(makeSvg(item.pinned
        ? "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
        : "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
      ));
      pinBtn.addEventListener("click", async e => {
        e.stopPropagation();
        await togglePin(item.id);
        showToast(item.pinned ? "Unpinned" : "📌 Pinned");
      });
      actions.appendChild(pinBtn);

      // Copy btn
      const copyBtn = document.createElement("button");
      copyBtn.className = "action-btn copy-btn";
      copyBtn.title = "Copy to clipboard";
      copyBtn.setAttribute("aria-label", "Copy clip");
      copyBtn.appendChild(makeCopySvg());
      copyBtn.addEventListener("click", async e => {
        e.stopPropagation();
        const ok = await copyToClipboard(item.text);
        if (ok) showToast("✓ Copied!");
      });
      actions.appendChild(copyBtn);

      // Delete btn
      const delBtn = document.createElement("button");
      delBtn.className = "action-btn del-btn";
      delBtn.title = "Delete clip";
      delBtn.setAttribute("aria-label", "Delete clip");
      delBtn.appendChild(makeSvg("M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"));
      delBtn.addEventListener("click", async e => {
        e.stopPropagation();
        await deleteClip(item.id);
        showToast("Deleted");
      });
      actions.appendChild(delBtn);
      card.appendChild(actions);

      // Meta row
      const meta = document.createElement("div");
      meta.className = "clip-meta";

      const timeEl = document.createElement("span");
      timeEl.className = "clip-time";
      timeEl.textContent = formatTime(item.time);
      meta.appendChild(timeEl);

      const charEl = document.createElement("span");
      charEl.className = "clip-chars";
      charEl.textContent = `${(item.text || "").length} chars`;
      meta.appendChild(charEl);

      if (item.pinned) {
        const badge = document.createElement("span");
        badge.className = "clip-pin-badge";
        badge.textContent = "📌 pinned";
        meta.appendChild(badge);
      }

      card.appendChild(meta);

      // Keyboard: Enter copies
      card.addEventListener("keydown", async e => {
        if (e.key === "Enter") {
          const ok = await copyToClipboard(item.text);
          if (ok) showToast("✓ Copied!");
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          await deleteClip(item.id);
          showToast("Deleted");
        }
      });

      clipsDiv.appendChild(card);
    });
  }

  // ── Keyboard nav ──────────────────────────────────
  searchInput.addEventListener("keydown", e => {
    const cards = [...clipsDiv.querySelectorAll(".clip-card")];
    if (!cards.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, cards.length - 1);
      cards.forEach((c,i) => c.classList.toggle("keyboard-focus", i === focusedIndex));
      cards[focusedIndex].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      cards.forEach((c,i) => c.classList.toggle("keyboard-focus", i === focusedIndex));
      cards[focusedIndex].focus();
    }
  });

  // ── Modal ─────────────────────────────────────────
  function openModal(text) {
    modalText.textContent = text;
    modal.removeAttribute("hidden");
    modalClose.focus();
  }
  function closeModal() { modal.setAttribute("hidden",""); }

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  modalCopyBtn.addEventListener("click", async () => {
    const ok = await copyToClipboard(modalText.textContent);
    if (ok) { showToast("✓ Copied!"); closeModal(); }
  });

  // ── Search ────────────────────────────────────────
  searchInput.addEventListener("input", () => rerender());

  // ── Sort toggle ───────────────────────────────────
  sortBtn.addEventListener("click", () => {
    sortNewest = !sortNewest;
    sortIndicator.textContent = sortNewest ? "Newest first" : "Oldest first";
    rerender();
  });

  // ── Clear all ─────────────────────────────────────
  clearListBtn.addEventListener("click", async () => {
    if (!history.length) return;
    const confirmed = window.confirm("Clear all clips? This cannot be undone.");
    if (!confirmed) return;
    history = [];
    await chrome.storage.local.remove("clipboardHistory");
    searchInput.value = "";
    rerender();
    showToast("All clips cleared");
  });

  // ── Init ──────────────────────────────────────────
  chrome.storage.local.get("clipboardHistory", result => {
    if (!Array.isArray(result.clipboardHistory) || result.clipboardHistory.length === 0) {
      history = [];
      renderEmptyState();
      updateCount();
      return;
    }

    const { withIds, changed } = ensureClipIds(result.clipboardHistory);
    history = withIds;
    if (changed) saveHistory(history);

    rerender();
  });
});