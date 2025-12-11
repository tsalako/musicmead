const tbody = document.getElementById("admin-tbody");
const statusEl = document.getElementById("admin-status");
const syncBtn = document.getElementById("sync-btn");
const logoutBtn = document.getElementById("logout-btn");

let adminSession = localStorage.getItem("adminSession");

async function ensureAuth() {
  // If we already have a valid session, just continue
  if (adminSession) return true;

  // Prompt once; if cancelled, bail
  const pw = prompt("Enter admin password:");
  if (!pw) return false;

  try {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Invalid password.");
      // Do not recurse here; we'll let the caller decide to redirect
      return false;
    }

    adminSession = data.session;
    localStorage.setItem("adminSession", adminSession);
    return true;
  } catch (err) {
    alert("Failed to contact server. Please try again.");
    return false;
  }
}

async function fetchAll() {
  const res = await fetch("/api/submissions");
  const data = await res.json();
  return data;
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
    statusEl.textContent = "Failed to load submissions";
    statusEl.classList.add("error");
  }
}

// Handle delete clicks
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  const confirmed = window.confirm(
    "Delete this submission? This will be removed from future playlist syncs."
  );
  if (!confirmed) return;

  try {
    const authed = await ensureAuth();
    if (!authed) {
      window.location.href = "index.html";
      return;
    }

    btn.disabled = true;
    const res = await fetch(`/api/admin/submission/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-session": adminSession }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Delete failed");
    }
    statusEl.textContent =
      "Deleted. Remember to sync playlists to apply changes.";
    statusEl.classList.remove("error");
    await load();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  }
});

// Handle sync button
syncBtn.addEventListener("click", async () => {
  statusEl.textContent = "Syncing playlists…";
  statusEl.classList.remove("error");

  try {
    const authed = await ensureAuth();
    if (!authed) {
      window.location.href = "index.html";
      return;
    }

    syncBtn.disabled = true;
    const res = await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "x-admin-session": adminSession }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Sync failed");
    }
    statusEl.textContent = `Playlists synced from ${data.count} submissions.`;
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  } finally {
    syncBtn.disabled = false;
  }
});

// Logout button
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("adminSession");
  adminSession = null;
  alert("Logged out. Redirecting…");
  window.location.href = "index.html";
});

// Initial gate: force password before showing page
(async function initAdmin() {
  const ok = await ensureAuth();
  if (!ok) {
    // Kick them back to the main submission page
    window.location.href = "index.html";
    return;
  }

  // Auth succeeded → show admin UI
  document.body.classList.remove("admin-locked");
  load();
})();
