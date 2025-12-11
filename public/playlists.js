const prompts = await fetch("/api/prompts").then((r) => r.json());
const submissions = await fetch("/api/submissions").then((r) => r.json());
const container = document.getElementById("playlists-container");

const rounds = ["wrapped", "peace", "worship"];

for (const key of rounds) {
  const section = document.createElement("section");
  section.className = "card";

  const title = document.createElement("h2");
  title.className = "round-title";
  title.textContent = prompts[key].title;

  const list = document.createElement("div");
  list.className = "playlist-grid";

  submissions.forEach((sub) => {
    const r = sub.rounds[key];
    if (!r) return;

    const item = document.createElement("article");
    item.className = "playlist-item";

    item.innerHTML = `
      <div class="track-card">
        <img class="track-image" src="${r.image || ""}" />
        <div class="track-meta">
          <div class="track-title">${r.name}</div>
          <div class="track-artist">${r.artists}</div>
        </div>
      </div>
      <div class="playlist-caption">
        <div class="submitted-by">Submitted by <strong>${sub.name}</strong></div>
        ${
          r.caption
            ? `<p class="caption-text">${r.caption}</p>`
            : `<p class="caption-text empty">(no caption)</p>`
        }
      </div>
    `;

    list.appendChild(item);
  });

  section.appendChild(title);
  section.appendChild(list);
  container.appendChild(section);
}
