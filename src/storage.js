import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FILE_PATH = /opt/render/project/src/data/submissions.json in production
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_PATH = path.join(DATA_DIR, "submissions.json");

function ensureFileExists() {
  // Make sure the data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Make sure the JSON file exists
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, "[]", "utf8");
  }
}

function readRaw() {
  try {
    ensureFileExists();
    const txt = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(txt || "[]");
  } catch (err) {
    // If something weird happens, fall back to an empty array
    console.error("Error reading submissions.json:", err.message);
    return [];
  }
}

function writeRaw(submissions) {
  ensureFileExists();
  fs.writeFileSync(FILE_PATH, JSON.stringify(submissions, null, 2), "utf8");
}

function findIndexByName(submissions, name) {
  const target = name.trim().toLowerCase();
  return submissions.findIndex(
    (s) => s.name.trim().toLowerCase() === target
  );
}

function logSubmissions(submissions) {
  try {
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false
    });

    console.log(
      `SUBMISSIONS_SNAPSHOT [${timestamp} PST]: ${JSON.stringify(submissions)}`
    );
  } catch (err) {
    console.error("Error logging submissions:", err);
  }
}

export function getSubmissions() {
  return readRaw();
}

export function getSubmissionByName(name) {
  const submissions = readRaw();
  const idx = findIndexByName(submissions, name);
  if (idx === -1) return null;
  return submissions[idx];
}

export function createSubmission(payload) {
  const submissions = readRaw();
  const idx = findIndexByName(submissions, payload.name);
  if (idx !== -1) {
    throw new Error("A submission with that name already exists.");
  }

  const newSub = {
    id: nanoid(),
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...payload
  };

  submissions.push(newSub);
  writeRaw(submissions);
  logSubmissions(submissions);
  return newSub;
}

export function updateSubmissionByName(name, changes) {
  const submissions = readRaw();
  const idx = findIndexByName(submissions, name);
  if (idx === -1) {
    throw new Error("No existing submission found for that name.");
  }

  const updated = {
    ...submissions[idx],
    ...changes,
    updatedAt: new Date().toISOString()
  };

  submissions[idx] = updated;
  writeRaw(submissions);
  logSubmissions(submissions);
  return updated;
}

export function deleteSubmission(id) {
  const submissions = readRaw();
  const idx = submissions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  submissions.splice(idx, 1);
  writeRaw(submissions);
  logSubmissions(submissions);
  return true;
}
