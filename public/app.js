const prompts = await fetch("/api/prompts").then((r) => r.json());

const roundsContainer = document.getElementById("rounds-container");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const nameInput = document.getElementById("name");
const findBtn = document.getElementById("find-btn");
const countdownEl = document.getElementById("countdown-timer");

// December 27, 2025, 10:00 PM PT = 2025-12-28T06:00:00.000Z
const deadline = new Date("2025-12-28T06:00:00.000Z");
let submissionsClosed = false;

const selections = {
  wrapped: null,
  peace: null,
  worship: null,
};

const roundViews = {};
let mode = "create"; // "create" or "update"

function setMode(newMode) {
  mode = newMode;
  submitBtn.textContent = mode === "update" ? "Update songs" : "Submit songs";
}

// Visibility helpers for footer links
function updatePlaylistsLinkVisibility() {
  const link = document.getElementById("view-playlists-link");
  if (!link) return;

  const adminSession = localStorage.getItem("adminSession");
  const now = new Date();

  const isClosed = now >= deadline;
  const isAdmin = !!adminSession;

  if (isClosed || isAdmin) {
    link.style.display = "inline";
  } else {
    link.style.display = "none";
  }

  updateFooterSeparatorVisibility();
}

function updateAdminLinkVisibility() {
  const adminLink = document.getElementById("admin-link");
  if (!adminLink) return;

  const adminSession = localStorage.getItem("adminSession");
  adminLink.style.display = adminSession ? "inline" : "none";

  updateFooterSeparatorVisibility();
}

function updateFooterSeparatorVisibility() {
  const sep = document.getElementById("footer-sep");
  if (!sep) return;

  const adminLink = document.getElementById("admin-link");
  const playlistsLink = document.getElementById("view-playlists-link");

  const adminVisible = adminLink && adminLink.style.display !== "none";
  const playlistsVisible =
    playlistsLink && playlistsLink.style.display !== "none";

  // Show separator only if BOTH relevant links are visible
  if (adminVisible && playlistsVisible) {
    sep.style.display = "inline";
  } else {
    sep.style.display = "none";
  }
}

setMode("create");

function createRound(key, config) {
  const wrapper = document.createElement("section");
  wrapper.className = "card round";

  wrapper.innerHTML = `
    <h2 class="round-title">${config.title}</h2>
    <label class="field-label">Search for a song</label>
    <input type="text" class="input search-input" placeholder="Type a song or artist..." />
    <div class="search-results"></div>

    <div class="selected-track hidden">
      <h3>Selected song</h3>
      <div class="track-card">
        <img class="track-image" />
        <div class="track-meta">
          <div class="track-title"></div>
          <div class="track-artist"></div>
        </div>
      </div>
    </div>

    <label class="field-label">Caption (optional)</label>
    <textarea class="input caption-input" rows="3" placeholder="Why did you pick this?"></textarea>
  `;

  const searchInput = wrapper.querySelector(".search-input");
  const resultsEl = wrapper.querySelector(".search-results");
  const selectedEl = wrapper.querySelector(".selected-track");
  const imgEl = wrapper.querySelector(".track-image");
  const titleEl = wrapper.querySelector(".track-title");
  const artistEl = wrapper.querySelector(".track-artist");
  const captionInput = wrapper.querySelector(".caption-input");

  let searchTimeout = null;

  searchInput.addEventListener("input", () => {
    if (submissionsClosed) return;

    const q = searchInput.value.trim();
    resultsEl.innerHTML = "";
    if (!q) return;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const tracks = await res.json();

      resultsEl.innerHTML = "";
      tracks.forEach((t) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "result-row";
        row.innerHTML = `
          <img src="${t.image || ""}" class="result-image" />
          <div class="result-meta">
            <div class="result-title">${t.name}</div>
            <div class="result-artist">${t.artists}</div>
            <div class="result-album">${t.album}</div>
          </div>
        `;
        row.addEventListener("click", () => {
          if (submissionsClosed) return;

          selections[key] = {
            ...t,
            caption: captionInput.value,
          };
          imgEl.src = t.image || "";
          titleEl.textContent = t.name;
          artistEl.textContent = t.artists;
          selectedEl.classList.remove("hidden");
          resultsEl.innerHTML = "";
          validateForm();
        });
        resultsEl.appendChild(row);
      });
    }, 300);
  });

  captionInput.addEventListener("input", () => {
    if (selections[key]) {
      selections[key].caption = captionInput.value;
    }
  });

  roundsContainer.appendChild(wrapper);

  roundViews[key] = {
    wrapper,
    searchInput,
    resultsEl,
    selectedEl,
    imgEl,
    titleEl,
    artistEl,
    captionInput,
  };
}

// Build all three prompts
for (const key of ["wrapped", "peace", "worship"]) {
  createRound(key, prompts[key]);
}

function validateForm() {
  const name = nameInput.value.trim();
  const hasAll =
    !!name && selections.wrapped && selections.peace && selections.worship;
  submitBtn.disabled = submissionsClosed || !hasAll;
}

nameInput.addEventListener("input", () => {
  // Changing the name manually puts you back into "create" mode by default
  setMode("create");
  validateForm();
});

// Load an existing submission and pre-fill UI
function loadSubmission(sub) {
  nameInput.value = sub.name;

  ["wrapped", "peace", "worship"].forEach((key) => {
    const r = sub.rounds[key];
    const view = roundViews[key];
    if (!r || !view) return;

    selections[key] = { ...r }; // id, uri, name, artists, album, image, caption

    view.captionInput.value = r.caption || "";
    view.imgEl.src = r.image || "";
    view.titleEl.textContent = r.name;
    view.artistEl.textContent = r.artists;
    view.selectedEl.classList.remove("hidden");
  });

  setMode("update");
  validateForm();
}

// "Find" button: look up by name
findBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  statusEl.textContent = "";
  if (!name) {
    statusEl.textContent = "Enter a name to find your songs.";
    statusEl.classList.add("error");
    return;
  }

  try {
    const res = await fetch(
      `/api/submission?name=${encodeURIComponent(name)}`
    );
    if (res.status === 404) {
      statusEl.textContent =
        "No existing submission for that name. You’ll create a new one.";
      statusEl.classList.remove("error");
      setMode("create");
      validateForm();
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Lookup failed");
    }

    const sub = await res.json();
    loadSubmission(sub);
    statusEl.textContent =
      "Loaded your previous songs. You can update them now.";
    statusEl.classList.remove("error");
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  }
});

// Close/lock form when deadline passed
function setSubmissionsClosed() {
  submissionsClosed = true;
  if (countdownEl) {
    countdownEl.textContent = "Submissions are closed.";
    countdownEl.classList.remove("countdown-warning");
  }
  submitBtn.disabled = true;
  nameInput.disabled = true;
  findBtn.disabled = true;

  document
    .querySelectorAll(".search-input, .caption-input")
    .forEach((el) => (el.disabled = true));

  statusEl.textContent = "Submissions are closed.";
  statusEl.classList.add("error");

  updatePlaylistsLinkVisibility();
}

// Countdown timer
function updateCountdown() {
  const now = new Date();
  const diff = deadline - now;

  if (diff <= 0) {
    if (!submissionsClosed) {
      setSubmissionsClosed();
    }
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (countdownEl) {
    countdownEl.textContent =
      `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;

    const hoursRemaining = totalSeconds / 3600;
    if (hoursRemaining <= 24) {
      countdownEl.classList.add("countdown-warning");
    } else {
      countdownEl.classList.remove("countdown-warning");
    }
  }
}

submitBtn.addEventListener("click", async () => {
  statusEl.textContent = "";
  submitBtn.disabled = true;

  const payload = {
    name: nameInput.value.trim(),
    rounds: {
      wrapped: selections.wrapped,
      peace: selections.peace,
      worship: selections.worship,
    },
  };

  try {
    const method = mode === "update" ? "PUT" : "POST";
    const resp = await fetch("/api/submit", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Submission failed");
    }

    setMode("update");
    statusEl.textContent =
      mode === "update"
        ? "Updated! Your songs have been saved."
        : "Submitted! Your songs have been saved.";
    statusEl.classList.remove("error");
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  } finally {
    validateForm();
  }
});

// Initial countdown + interval
updateCountdown();
setInterval(updateCountdown, 1000);

// If already past deadline on load, lock immediately
if (deadline - new Date() <= 0) {
  setSubmissionsClosed();
}

// Initial visibility for footer links
updatePlaylistsLinkVisibility();
updateAdminLinkVisibility();
updateFooterSeparatorVisibility();