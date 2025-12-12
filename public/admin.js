// public/admin.js

const tbody = document.getElementById("admin-tbody");
const statusEl = document.getElementById("admin-status");
const syncBtn = document.getElementById("sync-btn");
const logoutBtn = document.getElementById("logout-btn");

// ---- ADMIN PASSWORD FROM URL / PROMPT ----

const params = new URLSearchParams(window.location.search);
let adminPassword =
  params.get("pw") || params.get("password") || params.get("admin");

// If not in query, optionally prompt the user
if (!adminPassword) {
  adminPassword = window.prompt("Admin password:");
}

if (!adminPassword) {
  alert("Admin password is required to use the admin page.");
  window.location.href = "index.html";
}

// Clean the URL so the password is not left in the address bar
if (params.has("pw") || params.has("password") || params.has("admin")) {
  params.delete("pw");
  params.delete("password");
  params.delete("admin");
  const newQuery = params.toString();
  const newUrl =
    window.location.pathname + (newQuery ? "?" + newQuery : "");
  window.history.replaceState({}, "", newUrl);
}

// Helper: every admin-only request sends x-admin-password
function adminFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-admin-password": adminPassword
  };
  return fetch(url, { ...options, headers });
}

// ---- API HELPERS ----

async function fetchAll() {
  // submissions list is public; no admin header needed
  const res = await fetch("/api/submissions");
  if (!res.ok) {
    throw new Error("Failed to load submissions.");
  }
  return res.json();
}

function formatDate(d) {
  if (!d) return "–";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString();
}

function trackCell(round) {
  if (!round) return "<div class='cell-empty'>(none)</div>";

  const captionHtml = round.caption
    ? `<div class="cell-caption">${round.caption}</div>`
    : "";

  return `
    <div class="cell-track">
      ${round.image ? `<img src="${round.image}" class="cell-image" />` : ""}
      <div class="cell-track-meta">
        <div class="cell-track-title">${round.name}</div>
        <div class="cell-track-artist">${round.artists}</div>
        ${captionHtml}
      </div>
    </div>
  `;
}

function renderTable(submissions) {
  tbody.innerHTML = "";
  if (!submissions.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:12px; font-size:0.9rem; color:#9c9fb1;">
          No submissions yet.
        </td>
      </tr>
    `;
    return;
  }

  submissions.forEach((s) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${trackCell(s.rounds.wrapped)}</td>
      <td>${trackCell(s.rounds.peace)}</td>
      <td>${trackCell(s.rounds.worship)}</td>
      <td>${formatDate(s.createdAt)}</td>
      <td>${formatDate(s.updatedAt)}</td>
      <td class="admin-actions-cell">
        <button class="button danger tiny" data-id="${s.id}">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function load() {
  try {
    const subs = await fetchAll();
    renderTable(subs);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Failed to load submissions.";
    statusEl.classList.add("error");
  }
}

// ---- EVENT HANDLERS ----

// Delete row
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  const confirmed = window.confirm(
    "Delete this submission? This will be removed from future playlist syncs."
  );
  if (!confirmed) return;

  try {
    btn.disabled = true;
    const res = await adminFetch(
      `/api/admin/submission/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Delete failed.");
    }

    statusEl.textContent =
      "Deleted. Remember to sync playlists to apply changes.";
    statusEl.classList.remove("error");
    await load();
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  } finally {
    btn.disabled = false;
  }
});

// Sync playlists button
syncBtn.addEventListener("click", async () => {
  statusEl.textContent = "Syncing playlists…";
  statusEl.classList.remove("error");

  try {
    syncBtn.disabled = true;
    const res = await adminFetch("/api/admin/sync", {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Sync failed.");
    }
    statusEl.textContent = `Playlists synced from ${data.count} submissions.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  } finally {
    syncBtn.disabled = false;
  }
});

// "Logout" -> just go back to main page
logoutBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});

// ---- INIT ----

(async function initAdmin() {
  // If we got this far, we have a password (or redirected away).
  // Show the UI and load data.
  document.body.classList.remove("admin-locked");
  await load();
})();
