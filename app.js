const STORAGE_KEY = "threadsSavedOrganizer.v1";

const DEFAULT_CATEGORIES = ["General", "Recipes", "Tech", "Fitness", "Inspiration"];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { posts: [], categories: [...DEFAULT_CATEGORIES] };
    }
    const data = JSON.parse(raw);
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      categories: Array.isArray(data.categories) ? data.categories : [...DEFAULT_CATEGORIES],
    };
  } catch {
    return { posts: [], categories: [...DEFAULT_CATEGORIES] };
  }
}

function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ posts: state.posts, categories: state.categories })
  );
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUrl(value) {
  const v = value.trim();
  if (!v) return "";
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    return u.href;
  } catch {
    return "";
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** @type {{ posts: Array<{id:string,url:string,category:string,note:string,createdAt:string}>, categories: string[] }} */
let state = loadState();

const els = {
  form: document.getElementById("capture-form"),
  url: document.getElementById("url"),
  pasteLink: document.getElementById("paste-link"),
  category: document.getElementById("category"),
  newCategory: document.getElementById("new-category"),
  note: document.getElementById("note"),
  search: document.getElementById("search"),
  filterCategory: document.getElementById("filter-category"),
  list: document.getElementById("post-list"),
  empty: document.getElementById("empty-state"),
  toast: document.getElementById("toast"),
  installBanner: document.getElementById("install-banner"),
  installCopy: document.getElementById("install-copy"),
  installBtn: document.getElementById("install-btn"),
  dismissInstall: document.getElementById("dismiss-install"),
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function populateCategorySelects() {
  const sorted = [...new Set(state.categories)].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  els.category.innerHTML = sorted
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");

  els.filterCategory.innerHTML =
    `<option value="">All categories</option>` +
    sorted.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getFilteredPosts() {
  const q = els.search.value.trim().toLowerCase();
  const cat = els.filterCategory.value;

  return state.posts
    .filter((p) => !cat || p.category === cat)
    .filter((p) => {
      if (!q) return true;
      return (
        p.url.toLowerCase().includes(q) ||
        (p.note && p.note.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderList() {
  const items = getFilteredPosts();
  els.empty.hidden = items.length > 0;

  els.list.innerHTML = items
    .map(
      (p) => `
    <li class="post-item" data-id="${escapeHtml(p.id)}">
      <div class="header-row">
        <span class="badge">${escapeHtml(p.category)}</span>
        <button type="button" class="btn btn-danger" data-action="delete" data-id="${escapeHtml(p.id)}">Remove</button>
      </div>
      <p style="margin:0.5rem 0 0">
        <a class="post-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.url)}</a>
      </p>
      ${p.note ? `<p class="post-note">${escapeHtml(p.note)}</p>` : ""}
      <div class="post-meta">${escapeHtml(formatDate(p.createdAt))}</div>
    </li>`
    )
    .join("");
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = normalizeUrl(els.url.value);
  if (!url) {
    showToast("Please enter a valid link.");
    return;
  }

  let category = els.category.value.trim() || "General";
  const newCat = els.newCategory.value.trim();
  if (newCat) {
    category = newCat;
    if (!state.categories.includes(category)) {
      state.categories.push(category);
    }
  }

  state.posts.push({
    id: uid(),
    url,
    category,
    note: els.note.value.trim(),
    createdAt: new Date().toISOString(),
  });

  saveState(state);
  els.url.value = "";
  els.newCategory.value = "";
  els.note.value = "";
  populateCategorySelects();
  renderList();
  showToast("Saved.");
});

els.list.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action=delete]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  state.posts = state.posts.filter((p) => p.id !== id);
  saveState(state);
  renderList();
  showToast("Removed.");
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const debouncedRender = debounce(renderList, 120);
els.search.addEventListener("input", debouncedRender);
els.filterCategory.addEventListener("change", renderList);

function applySharedText(candidate, { noteFrom } = {}) {
  const raw = (candidate || "").trim();
  if (!raw) return false;

  const normalized = normalizeUrl(raw) || raw;
  if (normalized.startsWith("http")) {
    els.url.value = normalized;
  } else {
    const match = raw.match(/https?:\/\/[^\s]+/i);
    if (match) els.url.value = match[0];
    else els.url.value = raw;
  }

  const extra = (noteFrom || "").replace(/https?:\/\/\S+/gi, "").trim();
  if (extra && !els.note.value) {
    els.note.value = extra.slice(0, 500);
  }
  return true;
}

function readShareParams() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title");
  const text = params.get("text");
  const urlParam = params.get("url");

  const candidate = urlParam || text || title || "";
  if (!candidate) return;

  applySharedText(candidate, { noteFrom: [title, text].filter(Boolean).join(" ") });
  showToast("Link filled from share.");
  history.replaceState({}, "", window.location.pathname);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

let deferredPrompt = null;
const INSTALL_DISMISS_KEY = "threadsSavedOrganizer.installDismissed";

function setupInstallBanner() {
  if (isStandalone() || localStorage.getItem(INSTALL_DISMISS_KEY) === "1") {
    return;
  }

  if (isIos()) {
    els.installCopy.textContent =
      "Add this to your Home Screen: tap Share, then Add to Home Screen. After that it opens like an app.";
    els.installBanner.hidden = false;
    return;
  }

  els.installCopy.textContent =
    "Install this on your phone: open this page in Chrome, then tap Add to Home screen (or the install button below when it appears).";
  els.installBanner.hidden = false;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1" || isStandalone()) return;
  els.installCopy.textContent =
    "Install Saved posts on this phone so it sits on your Home Screen and works offline.";
  els.installBtn.hidden = false;
  els.installBanner.hidden = false;
});

els.installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => {});
  deferredPrompt = null;
  els.installBanner.hidden = true;
});

els.dismissInstall.addEventListener("click", () => {
  localStorage.setItem(INSTALL_DISMISS_KEY, "1");
  els.installBanner.hidden = true;
});

els.pasteLink.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!applySharedText(text, { noteFrom: text })) {
      showToast("Clipboard is empty.");
      return;
    }
    showToast("Pasted.");
  } catch {
    showToast("Allow clipboard access, or paste into the link field.");
    els.url.focus();
  }
});

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

populateCategorySelects();
readShareParams();
renderList();
setupInstallBanner();
registerSW();
