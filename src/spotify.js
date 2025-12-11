import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_REFRESH_TOKEN
} = process.env;

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

async function getAccessTokenFromRefreshToken() {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  if (!SPOTIFY_REFRESH_TOKEN) {
    throw new Error("SPOTIFY_REFRESH_TOKEN is not set. Run the auth flow first.");
  }

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", SPOTIFY_REFRESH_TOKEN);

  const authHeader = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const resp = await axios.post("https://accounts.spotify.com/api/token", params, {
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const { access_token, expires_in } = resp.data;
  cachedAccessToken = access_token;
  cachedAccessTokenExpiresAt = Date.now() + expires_in * 1000;
  return access_token;
}

export async function searchTracks(query) {
  const accessToken = await getAccessTokenFromRefreshToken();

  const resp = await axios.get("https://api.spotify.com/v1/search", {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q: query,
      type: "track",
      limit: 10
    }
  });

  return resp.data.tracks.items.map((t) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    image: t.album.images[0]?.url || null
  }));
}

async function replacePlaylistTracks(playlistId, trackUris) {
  const accessToken = await getAccessTokenFromRefreshToken();

  // Clear playlist if no tracks
  if (!trackUris || trackUris.length === 0) {
    await axios.put(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: [] },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return;
  }

  // Spotify limits to 100 URIs per call
  const chunks = [];
  for (let i = 0; i < trackUris.length; i += 100) {
    chunks.push(trackUris.slice(i, i + 100));
  }

  // First chunk uses PUT (replace)
  await axios.put(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { uris: chunks[0] },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // Subsequent chunks use POST (append)
  for (let i = 1; i < chunks.length; i++) {
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: chunks[i] },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }
}

export async function syncPlaylistsFromSubmissions(submissions) {
  const wrappedUris = [];
  const peaceUris = [];
  const worshipUris = [];

  for (const s of submissions) {
    if (s.rounds?.wrapped?.uri) wrappedUris.push(s.rounds.wrapped.uri);
    if (s.rounds?.peace?.uri) peaceUris.push(s.rounds.peace.uri);
    if (s.rounds?.worship?.uri) worshipUris.push(s.rounds.worship.uri);
  }

  const { PLAYLIST_WRAPPED_ID, PLAYLIST_PEACE_ID, PLAYLIST_WORSHIP_ID } =
    process.env;

  if (!PLAYLIST_WRAPPED_ID || !PLAYLIST_PEACE_ID || !PLAYLIST_WORSHIP_ID) {
    throw new Error("Playlist IDs are not all set in environment variables.");
  }

  await replacePlaylistTracks(PLAYLIST_WRAPPED_ID, wrappedUris);
  await replacePlaylistTracks(PLAYLIST_PEACE_ID, peaceUris);
  await replacePlaylistTracks(PLAYLIST_WORSHIP_ID, worshipUris);
}

// Helper for the one-time auth dance to get a refresh token
export function getAuthUrl() {
  const scopes = [
    "playlist-modify-public",
    "playlist-modify-private"
  ].join(" ");

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: scopes
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", SPOTIFY_REDIRECT_URI);

  const authHeader = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const resp = await axios.post("https://accounts.spotify.com/api/token", params, {
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  return resp.data; // { access_token, refresh_token, expires_in, ... }
}
