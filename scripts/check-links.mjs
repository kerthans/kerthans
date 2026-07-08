import { readFile } from "node:fs/promises";
import process from "node:process";

const README_PATH = new URL("../README.md", import.meta.url);
const EXCLUDED_URLS = new Map([
  [
    "https://xi1uh4zvhbc.feishu.cn/docx/Gx6cdEawdoR85OxWZHQcWqw8nMd",
    "Feishu returns 404 to automated HTTP clients; verify manually in browser.",
  ],
]);

function fail(message) {
  console.error(`link check failed: ${message}`);
  process.exit(1);
}

function urlsFrom(markdown) {
  const urls = new Set();
  const regex = /https?:\/\/[^\s)>"]+/g;
  for (const match of markdown.matchAll(regex)) urls.add(match[0]);
  return [...urls].sort();
}

async function fetchOk(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "HEAD",
    headers: {
      "user-agent": "kerthans-profile-link-check",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(10_000),
  });
  return response.status >= 200 && response.status < 400;
}

async function checkGitHubRepo(url) {
  const parsed = new URL(url);
  const [, owner, repo] = parsed.pathname.split("/");
  if (!owner || !repo || parsed.pathname.split("/").length !== 3) return fetchOk(url);
  return fetchOk(`https://api.github.com/repos/${owner}/${repo}`);
}

async function checkGitHubRaw(url) {
  const parsed = new URL(url);
  const [, owner, repo, ref, ...pathParts] = parsed.pathname.split("/");
  if (!owner || !repo || !ref || pathParts.length === 0) return fetchOk(url);
  const path = pathParts.map(encodeURIComponent).join("/");
  return fetchOk(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
}

async function checkUrl(url) {
  if (EXCLUDED_URLS.has(url)) return { url, ok: true, excluded: EXCLUDED_URLS.get(url) };
  const parsed = new URL(url);
  if (parsed.hostname === "github.com") return { url, ok: await checkGitHubRepo(url) };
  if (parsed.hostname === "raw.githubusercontent.com") return { url, ok: await checkGitHubRaw(url) };
  try {
    return { url, ok: await fetchOk(url) };
  } catch {
    return { url, ok: await fetchOk(url, { method: "GET" }) };
  }
}

async function main() {
  const readme = await readFile(README_PATH, "utf8");
  const results = [];
  for (const url of urlsFrom(readme)) results.push(await checkUrl(url));
  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    const marker = result.excluded ? "/" : result.ok ? "ok" : "fail";
    const reason = result.excluded ? ` ${result.excluded}` : "";
    console.log(`${marker} ${result.url}${reason}`);
  }
  if (failed.length > 0) fail(`${failed.length} README link(s) failed`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
