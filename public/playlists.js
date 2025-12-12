// playlists.js
const tabs = document.querySelectorAll("[data-playlist-tab]");
const listEl = document.getElementById("playlist-list");
const titleEl = document.getElementById("playlist-title");
const descEl = document.getElementById("playlist-description");
const spotifyLinkEl = document.getElementById("spotify-tab-link");

const PLAYLIST_META = {
  wrapped: {
    title: "Wrapped",
    description: "Most listened to song of the year (no cheating)",
  },
  peace: {
    title: "Passing of the Peace",
    description: "Your chance to replace the passing of the peace music",
  },
  worship: {
    title: "Worship Slaps",
    description: "Favorite worship song",
  },
};

let grouped = {
  wrapped: [],
  peace: [],
  worship: [],
};

// Will hold playlist IDs once loaded from the server
// Expecting shape: { wrappedId, peaceId, worshipId }
let playlistIds = null;

// ---- ADMIN LINK VISIBILITY ----
async function updateAdminVisibility() {
  const adminLink = document.getElementById("admin-link");
  const sep = document.getElementById("footer-sep");
  if (!adminLink || !sep) return;

  try {
    const res = await fetch("/api/admin/enabled");
    const data = await res.json();
    const enabled = !!data.enabled;

    adminLink.style.display = enabled ? "inline" : "none";
    sep.style.display = enabled ? "inline" : "none";
  } catch (err) {
    adminLink.style.display = "none";
    sep.style.display = "none";
  }
}

// ---- PLAYLIST ID LOADING ----
// You’ll need a backend route like:
// GET /api/playlist-ids -> { wrappedId, peaceId, worshipId }
async function loadPlaylistIds() {
  if (!spotifyLinkEl) return;

  try {
    const res = await fetch("/api/playlist-ids");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    // Normalize keys in case you name them slightly differently
    playlistIds = {
      wrapped: data.wrappedId || data.wrapped || null,
      peace: data.peaceId || data.peace || null,
      worship: data.worshipId || data.worship || null,
    };
  } catch (err) {
    console.error("Failed to load playlist IDs:", err);
    playlistIds = null;
    // Hide the button if we can't get IDs
    spotifyLinkEl.style.display = "none";
  }
}

// Update the Spotify button URL based on the active tab
function updateSpotifyLinkForTab(key) {
  if (!spotifyLinkEl || !playlistIds) return;

  const id = playlistIds[key];
  if (id) {
    spotifyLinkEl.href = `https://open.spotify.com/playlist/${id}`;
    spotifyLinkEl.style.display = "inline-flex";
  } else {
    spotifyLinkEl.removeAttribute("href");
    spotifyLinkEl.style.display = "none";
  }
}

// ---- DATA LOADING ----
async function loadSubmissions() {
  try {
    const res = await fetch("/api/submissions");
    const data = await res.json();

    grouped = {
      wrapped: [],
      peace: [],
      worship: [],
    };

    if (Array.isArray(data)) {
      data.forEach((sub) => {
        ["wrapped", "peace", "worship"].forEach((key) => {
          const round = sub.rounds && sub.rounds[key];
          if (round) {
            grouped[key].push({
              submitter: sub.name,
              caption: round.caption,
              track: round,
              createdAt: sub.createdAt || null,
            });
          }
        });
      });
    }

    // Sort by submission time within each playlist:
    // oldest first (earliest submission at the top).
    // Flip the subtraction if you want newest first.
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - db; // change to db - da for newest first
      });
    });
  } catch (err) {
    console.error("Failed to load submissions:", err);
    listEl.innerHTML =
      '<div class="empty-state">Unable to load submissions.</div>';
  }
}

// ---- RENDERING ----
function renderCard(entry) {
  const { submitter, caption, track } = entry;
  const card = document.createElement("article");
  card.className = "playlist-card";

  const safeCaption =
    caption && caption.trim().length ? caption.trim() : "(no caption)";

  card.innerHTML = `
    <div class="playlist-card-inner">
      <img src="${track.image || ""}" alt="" class="playlist-card-image" />
      <div class="playlist-card-body">
        <div class="playlist-card-title">${track.name}</div>
        <div class="playlist-card-artist">${track.artists}</div>
        <div class="playlist-card-meta">
          <span class="playlist-card-submitter">Submitted by ${submitter}</span>
        </div>
        <p class="playlist-card-caption">${safeCaption}</p>
      </div>
    </div>
  `;
  return card;
}

function renderPlaylist(key) {
  const meta = PLAYLIST_META[key] || PLAYLIST_META.wrapped;
  titleEl.textContent = meta.title;
  descEl.textContent = meta.description;

  const items = grouped[key] || [];
  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML =
      '<div class="empty-state">No submissions for this playlist yet.</div>';
    return;
  }

  items.forEach((entry) => {
    listEl.appendChild(renderCard(entry));
  });
}

// ---- TAB SWITCHING ----
function setActiveTab(key) {
  tabs.forEach((tab) => {
    const tabKey = tab.getAttribute("data-playlist-tab");
    tab.classList.toggle("active", tabKey === key);
  });

  renderPlaylist(key);
  updateSpotifyLinkForTab(key);
}

// ---- INIT ----
async function init() {
  updateAdminVisibility();
  await Promise.all([loadSubmissions(), loadPlaylistIds()]);
  setActiveTab("wrapped");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const key = tab.getAttribute("data-playlist-tab");
    setActiveTab(key);
  });
});

init();
