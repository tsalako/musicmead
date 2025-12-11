const prompts = await fetch("/api/prompts").then((r) => r.json());

const roundsContainer = document.getElementById("rounds-container");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const nameInput = document.getElementById("name");
const findBtn = document.getElementById("find-btn");

const selections = {
  wrapped: null,
  peace: null,
  worship: null
};

const roundViews = {};
let mode = "create"; // "create" or "update"

function setMode(newMode) {
  mode = newMode;
  submitBtn.textContent = mode === "update" ? "Update songs" : "Submit songs";
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
          selections[key] = {
            ...t,
            caption: captionInput.value
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
    captionInput
  };
}

for (const key of ["wrapped", "peace", "worship"]) {
  createRound(key, prompts[key]);
}

function validateForm() {
  const name = nameInput.value.trim();
  const hasAll =
    !!name && selections.wrapped && selections.peace && selections.worship;
  submitBtn.disabled = !hasAll;
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
    statusEl.textContent = "Loaded your previous songs. You can update them now.";
    statusEl.classList.remove("error");
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add("error");
  }
});

submitBtn.addEventListener("click", async () => {
  statusEl.textContent = "";
  submitBtn.disabled = true;

  const payload = {
    name: nameInput.value.trim(),
    rounds: {
      wrapped: selections.wrapped,
      peace: selections.peace,
      worship: selections.worship
    }
  };

  try {
    const method = mode === "update" ? "PUT" : "POST";
    const resp = await fetch("/api/submit", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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
