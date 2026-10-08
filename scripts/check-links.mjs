import { readFile } from "node:fs/promises";
import process from "node:process";

const README_PATH = new URL("../README.md", import.meta.url);
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

async function checkUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "kerthans-profile-link-check",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    return { url, ok: response.ok, status: response.status };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const readme = await readFile(README_PATH, "utf8");
  const results = await Promise.all(urlsFrom(readme).map(checkUrl));
  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    console.log(`${result.ok ? "ok" : "fail"} ${result.url} (${result.status ?? result.error})`);
  }
  if (failed.length > 0) fail(`${failed.length} README link(s) failed`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
