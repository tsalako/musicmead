import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE_PATH = path.join(__dirname, "..", "data", "submissions.json");

function readRaw() {
  try {
    const txt = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

function writeRaw(submissions) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(submissions, null, 2), "utf8");
}

function findIndexByName(submissions, name) {
  const target = name.trim().toLowerCase();
  return submissions.findIndex(
    (s) => s.name.trim().toLowerCase() === target
  );
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
  return updated;
}

export function deleteSubmission(id) {
  const submissions = readRaw();
  const idx = submissions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  submissions.splice(idx, 1);
  writeRaw(submissions);
  return true;
}
