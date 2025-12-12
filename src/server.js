import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import crypto from "crypto";

import {
  searchTracks,
  syncPlaylistsFromSubmissions,
  getAuthUrl,
  exchangeCodeForTokens
} from "./spotify.js";

import {
  getSubmissions,
  createSubmission,
  getSubmissionByName,
  updateSubmissionByName,
  deleteSubmission
} from "./storage.js";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, "..", "public")));

// Prompts metadata
const PROMPTS = {
  wrapped: {
    key: "wrapped",
    title: "Wrapped – Most listened to song of the year (no cheating)"
  },
  peace: {
    key: "peace",
    title: "Passing of the Peace – Your chance to replace the passing of the peace music"
  },
  worship: {
    key: "worship",
    title: "Worship Slaps – Favorite worship song"
  }
};

app.get("/api/prompts", (req, res) => {
  res.json(PROMPTS);
});

// Spotify search endpoint
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.json([]);
    }

    const tracks = await searchTracks(q);
    res.json(tracks);
  } catch (err) {
    console.error("Error in /api/search", err.response?.data || err.message);
    res.status(500).json({ error: "Spotify search failed" });
  }
});

// Create submission
app.post("/api/submit", async (req, res) => {
  try {
    const { name, rounds } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required" });
    }

    const requiredKeys = ["wrapped", "peace", "worship"];
    for (const key of requiredKeys) {
      const r = rounds?.[key];
      if (!r || !r.id || !r.uri || !r.name || !r.artists) {
        return res.status(400).json({ error: `Missing track info for ${key}` });
      }
    }

    const submission = createSubmission({
      name: name.trim(),
      rounds: {
        wrapped: rounds.wrapped,
        peace: rounds.peace,
        worship: rounds.worship
      }
    });

    res.json({ ok: true, mode: "create", submission });
  } catch (err) {
    console.error("Error in POST /api/submit", err);
    res.status(400).json({ error: err.message || "Failed to save submission" });
  }
});

// Update submission (by name)
app.put("/api/submit", async (req, res) => {
  try {
    const { name, rounds } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required" });
    }

    const requiredKeys = ["wrapped", "peace", "worship"];
    for (const key of requiredKeys) {
      const r = rounds?.[key];
      if (!r || !r.id || !r.uri || !r.name || !r.artists) {
        return res.status(400).json({ error: `Missing track info for ${key}` });
      }
    }

    const updated = updateSubmissionByName(name, {
      name: name.trim(),
      rounds: {
        wrapped: rounds.wrapped,
        peace: rounds.peace,
        worship: rounds.worship
      }
    });

    res.json({ ok: true, mode: "update", submission: updated });
  } catch (err) {
    console.error("Error in PUT /api/submit", err);
    res.status(400).json({ error: err.message || "Failed to update submission" });
  }
});

// Lookup submission by name (for editing)
app.get("/api/submission", (req, res) => {
  const name = (req.query.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const sub = getSubmissionByName(name);
  if (!sub) {
    return res.status(404).json({ error: "No submission for that name." });
  }
  res.json(sub);
});

// List all submissions (for playlists & admin)
app.get("/api/submissions", (req, res) => {
  const submissions = getSubmissions();
  res.json(submissions);
});

// // --- Admin auth and protected routes ---

// const activeAdminSessions = new Set();

// function createAdminSession() {
//   return crypto.randomBytes(32).toString("hex");
// }

// app.post("/api/admin/auth", (req, res) => {
//   const { password } = req.body;
//   if (!password) {
//     return res.status(400).json({ error: "Password required" });
//   }

//   const expected = process.env.ADMIN_PASSWORD;
//   if (!expected) {
//     return res.status(500).json({ error: "ADMIN_PASSWORD is not set on server." });
//   }

//   if (password !== expected) {
//     return res.status(403).json({ error: "Invalid admin password" });
//   }

//   const token = createAdminSession();
//   activeAdminSessions.add(token);

//   // Auto-expire after 12 hours
//   setTimeout(() => activeAdminSessions.delete(token), 12 * 3600 * 1000);

//   res.json({ ok: true, session: token });
// });

function requireAdmin(req, res, next) {
  if (isProd) {
    return res
      .status(403)
      .json({ error: "Admin actions are disabled in production." });
  }
  next();
}

app.get("/api/admin/enabled", (req, res) => {
  res.json({ enabled: !isProd });
});

// Delete a submission by id
app.delete("/api/admin/submission/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const ok = deleteSubmission(id);
  if (!ok) {
    return res.status(404).json({ error: "Submission not found" });
  }
  res.json({ ok: true });
});

// Admin: sync playlists from file
app.post("/api/admin/sync", requireAdmin, async (req, res) => {
  try {
    const submissions = getSubmissions();
    await syncPlaylistsFromSubmissions(submissions);
    res.json({ ok: true, count: submissions.length });
  } catch (err) {
    console.error("Error syncing playlists", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to sync playlists" });
  }
});

// --- One-time Spotify auth endpoints to obtain REFRESH TOKEN ---

app.get("/auth/login", (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.send("Error from Spotify auth: " + error);
  }
  try {
    const data = await exchangeCodeForTokens(code);
    console.log("Your refresh token:", data.refresh_token);
    res.send(
      "Success! Check your server logs for the refresh token and paste it into .env as SPOTIFY_REFRESH_TOKEN."
    );
  } catch (err) {
    console.error("Auth callback error", err.response?.data || err.message);
    res.status(500).send("Auth failed");
  }
});

app.get("/healthz", (req, res) => {
  console.log(`healthz-ok ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`);
  res.status(200).json({ status: "ok", time: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) });
});

// Ping /healthz every 14 minutes to prevent sleeping
setInterval(() => {
  fetch("https://musicmead.onrender.com/healthz")
    .then((res) => console.log(`[healthz] Ping success: ${res.status}`))
    .catch((err) => console.error("[healthz] Ping failed:", err));
}, 14 * 60 * 1000); // 14 minutes

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
