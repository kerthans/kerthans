import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { load } from "js-yaml";

const README_PATH = new URL("../README.md", import.meta.url);
const PROFILE_PATH = new URL("../profile.yml", import.meta.url);
const OWNER = "kerthans";
const REGIONS = {
  current: "CURRENT",
  public_index: "PUBLIC_INDEX",
  technical_traces: "TECHNICAL_TRACES",
};

const checkMode = process.argv.includes("--check");

function fail(message) {
  console.error(`profile render failed: ${message}`);
  process.exit(1);
}

function asArray(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  return value;
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(`${path} must be a non-empty string`);
  return value;
}

function optionalString(value, path) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") fail(`${path} must be a non-empty string when present`);
  return value;
}

function normalizeDescription(value, path) {
  if (typeof value === "string") return [value];
  return asArray(value, path).map((entry, index) => requiredString(entry, `${path}[${index}]`));
}

function validateRepo(repo, path) {
  const value = optionalString(repo, path);
  if (!value) return undefined;
  const [owner, name, extra] = value.split("/");
  if (!owner || !name || extra) fail(`${path} must be owner/repo`);
  if (owner !== OWNER) fail(`${path} owner must be ${OWNER}`);
  return value;
}

function validateItems(items, path) {
  const seen = new Set();
  return asArray(items, path).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${path}[${index}] must be an object`);
    const id = requiredString(item.id, `${path}[${index}].id`);
    if (seen.has(id)) fail(`${path} has duplicate id ${id}`);
    seen.add(id);

    const visibility = requiredString(item.visibility, `${path}[${index}].visibility`);
    if (!["private", "public"].includes(visibility)) fail(`${path}[${index}].visibility must be private or public`);

    const repo = validateRepo(item.repo, `${path}[${index}].repo`);
    const url = optionalString(item.url, `${path}[${index}].url`);
    if (visibility === "private" && repo) fail(`${path}[${index}] is private and must not define repo`);

    return {
      id,
      name: requiredString(item.name, `${path}[${index}].name`),
      status: requiredString(item.status, `${path}[${index}].status`),
      visibility,
      role: optionalString(item.role, `${path}[${index}].role`),
      description: normalizeDescription(item.description, `${path}[${index}].description`),
      evidence: optionalString(item.evidence, `${path}[${index}].evidence`),
      note: optionalString(item.note, `${path}[${index}].note`),
      repo,
      url,
    };
  });
}

function validateProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) fail("profile.yml must contain an object");
  if (profile.version !== 1) fail("version must be 1");
  const current = validateItems(profile.current, "current");
  if (current[0]?.id !== "vulcan") fail("current[0] must remain vulcan until profile.yml is manually changed with intent");
  return {
    current,
    public_index: validateItems(profile.public_index, "public_index"),
    technical_traces: validateItems(profile.technical_traces, "technical_traces"),
  };
}

function wrapParagraph(text, width = 79) {
  if (text.length <= width) return text;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function renderTitle(item) {
  if (item.repo) return `**[${item.name}][${item.id}]** \`${item.status}\``;
  return `**${item.name}** \`${item.status}\``;
}

function renderUrl(url) {
  const { hostname } = new URL(url);
  const label = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return `[${label}](${url})`;
}

function renderItem(item) {
  const parts = [renderTitle(item)];
  for (const paragraph of item.description) parts.push(wrapParagraph(paragraph));
  if (item.url) parts.push(renderUrl(item.url));
  if (item.evidence) parts.push(`\`${item.evidence}\``);
  if (item.note) parts.push(wrapParagraph(item.note));
  return parts.join("\n\n");
}

function renderRegion(items, suffix = "") {
  const body = items.map(renderItem).join("\n\n");
  const references = items
    .filter((item) => item.repo)
    .map((item) => `[${item.id}]: https://github.com/${item.repo}`)
    .join("\n");
  const sections = [body];
  if (suffix) sections.push(suffix);
  if (references) sections.push(references);
  return sections.join("\n\n");
}

function replaceRegion(readme, key, rendered) {
  const marker = REGIONS[key];
  const start = `<!-- PROFILE:${marker}:START -->`;
  const end = `<!-- PROFILE:${marker}:END -->`;
  const startCount = readme.split(start).length - 1;
  const endCount = readme.split(end).length - 1;
  if (startCount !== 1 || endCount !== 1) fail(`${marker} markers must appear exactly once`);
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (endIndex < startIndex) fail(`${marker} end marker appears before start marker`);
  return `${readme.slice(0, startIndex + start.length)}\n${rendered}\n${readme.slice(endIndex)}`;
}

async function main() {
  const [readme, profileText] = await Promise.all([
    readFile(README_PATH, "utf8"),
    readFile(PROFILE_PATH, "utf8"),
  ]);
  const profile = validateProfile(load(profileText));
  let next = readme;
  next = replaceRegion(next, "current", renderRegion(profile.current));
  next = replaceRegion(next, "public_index", renderRegion(profile.public_index));
  next = replaceRegion(
    next,
    "technical_traces",
    renderRegion(
      profile.technical_traces,
      "These are not current claims of mastery. They are traces of problems I actually\nentered.",
    ),
  );

  if (checkMode) {
    if (next !== readme) fail("README generated regions are stale; run npm run profile:render");
    return;
  }

  if (next !== readme) await writeFile(README_PATH, next, "utf8");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
