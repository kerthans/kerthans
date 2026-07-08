import { readFile } from "node:fs/promises";
import process from "node:process";
import { load } from "js-yaml";

const README_PATH = new URL("../README.md", import.meta.url);
const PROFILE_PATH = new URL("../profile.yml", import.meta.url);
const OWNER = "kerthans";
const REPO = "kerthans";
const MARKERS = ["CURRENT", "PUBLIC_INDEX", "TECHNICAL_TRACES"];

const deniedResidue = [
  "Peter-JXL",
  "BrunnerLivio",
  "ABSphreak",
  "profile-counter.glitch.me",
  "readme-typing-svg",
  "github-readme-stats",
  "github-profile-trophy",
  "quotes-github-readme",
  "svg.bookmark.style",
  "your_username",
  "your-org",
  "demo.example.com",
];

function fail(message) {
  console.error(`profile audit failed: ${message}`);
  process.exit(1);
}

function allUrls(markdown) {
  const urls = new Set();
  const regex = /https?:\/\/[^\s)>"]+/g;
  for (const match of markdown.matchAll(regex)) urls.add(match[0]);
  return [...urls];
}

function assertNoResidue(surface) {
  for (const token of deniedResidue) {
    if (surface.includes(token)) fail(`denied copied-profile residue found: ${token}`);
  }
}

function assertMarkerIntegrity(readme) {
  for (const marker of MARKERS) {
    const start = `<!-- PROFILE:${marker}:START -->`;
    const end = `<!-- PROFILE:${marker}:END -->`;
    const startCount = readme.split(start).length - 1;
    const endCount = readme.split(end).length - 1;
    if (startCount !== 1 || endCount !== 1) fail(`${marker} markers must appear exactly once`);
    if (readme.indexOf(end) < readme.indexOf(start)) fail(`${marker} end marker appears before start marker`);
  }
}

function assertTelemetryOwnership(urls) {
  for (const url of urls) {
    const raw = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/output\//);
    if (raw && (raw[1] !== OWNER || raw[2] !== REPO)) {
      fail(`foreign raw contribution telemetry URL: ${url}`);
    }

    if (url.includes("profile-counter.glitch.me")) fail(`profile counter URL is not allowed: ${url}`);

    if (url.includes("github-readme-stats") || url.includes("github-profile-trophy")) {
      const parsed = new URL(url);
      const username = parsed.searchParams.get("username");
      if (username && username !== OWNER) fail(`foreign profile telemetry username ${username}: ${url}`);
    }
  }
}

function assertPrivateLinks(readme, profile) {
  const groups = [profile.current, profile.public_index, profile.technical_traces].filter(Boolean);
  for (const items of groups) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || item.visibility !== "private") continue;
      const name = typeof item.name === "string" ? item.name : "";
      const repo = typeof item.repo === "string" ? item.repo : "";
      if (repo) fail(`private item ${name} must not define repo in profile.yml`);
      const forbidden = `https://github.com/${OWNER}/${encodeURIComponent(name)}`;
      const plainForbidden = `https://github.com/${OWNER}/${name}`;
      if (readme.includes(forbidden) || readme.includes(plainForbidden)) {
        fail(`private item ${name} must not link to a derived GitHub repository`);
      }
    }
  }
}

async function main() {
  const [readme, profileText] = await Promise.all([
    readFile(README_PATH, "utf8"),
    readFile(PROFILE_PATH, "utf8"),
  ]);
  const profile = load(profileText);
  assertNoResidue(`${readme}\n${profileText}`);
  assertMarkerIntegrity(readme);
  assertTelemetryOwnership(allUrls(readme));
  assertPrivateLinks(readme, profile);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
