import assert from "node:assert/strict";
import test from "node:test";
import worker, { parseLatestRelease } from "../src/worker.mjs";

const root = "https://github.com/koyasi777/mozkey/releases/download/v1.0.0/";
const digest = "sha256:" + "a".repeat(64);
function asset(name) { return { name, state: "uploaded", browser_download_url: root + name, size: 114331648, digest }; }
function fixture() {
  return {
    tag_name: "v1.0.0", draft: false, prerelease: false, published_at: "2026-11-01T03:45:22Z",
    assets: [
      asset("Mozkey_v1.0.0_x64.msi"),
      asset("Mozkey_v1.0.0_arm64.msi"),
      asset("Mozkey_v1.0.0_macos_universal.pkg"),
      asset("SHA256SUMS.txt"),
    ],
  };
}

test("recognizes complete stable release", () => {
  const parsed = parseLatestRelease(fixture(), "2026-11-01T04:00:00Z");
  assert.equal(parsed.version, "v1.0.0");
  assert.equal(parsed.assets.windowsX64.name, "Mozkey_v1.0.0_x64.msi");
  assert.equal(parsed.assets.windowsArm64.sha256, "a".repeat(64));
  assert.equal(parsed.assets.macosUniversal.size, 114331648);
  assert.equal(parsed.checkedAt, "2026-11-01T04:00:00Z");
});

test("automatically follows a future stable release version", () => {
  const next = fixture();
  next.tag_name = "v1.0.1";
  for (const item of next.assets) {
    item.name = item.name.replace("v1.0.0", "v1.0.1");
    item.browser_download_url = item.browser_download_url.replaceAll("v1.0.0", "v1.0.1");
  }
  const parsed = parseLatestRelease(next);
  assert.equal(parsed.version, "v1.0.1");
  assert.match(parsed.assets.windowsX64.url, /v1\.0\.1\/Mozkey_v1\.0\.1_x64\.msi$/);
});

test("rejects incomplete and unsafe releases", () => {
  for (const property of ["draft", "prerelease"]) {
    const data = fixture(); data[property] = true;
    assert.equal(parseLatestRelease(data), null);
  }
  for (const removed of ["Mozkey_v1.0.0_arm64.msi", "SHA256SUMS.txt"]) {
    const data = fixture(); data.assets = data.assets.filter((a) => a.name !== removed);
    assert.equal(parseLatestRelease(data), null);
  }
  for (const mutation of [
    (d) => { d.assets[0].digest = undefined; },
    (d) => { d.assets[0].browser_download_url = "https://example.com/file.msi"; },
    (d) => { d.assets[0].size = 0; },
    (d) => { d.assets[0].state = "new"; },
    (d) => { d.tag_name = "v1.0.0-rc1"; },
  ]) {
    const data = fixture(); mutation(data); assert.equal(parseLatestRelease(data), null);
  }
});

test("API caches validated release, serves static assets otherwise", async () => {
  const oldFetch = globalThis.fetch;
  const oldCaches = globalThis.caches;
  const stored = new Map();
  let upstreamCalls = 0;
  try {
    globalThis.fetch = async () => { upstreamCalls++; return Response.json(fixture()); };
    globalThis.caches = { default: {
      async match(req) { return stored.get(req.url)?.clone(); },
      async put(req, res) { stored.set(req.url, res.clone()); },
    } };
    const tasks = [];
    const ctx = { waitUntil(p) { tasks.push(p); } };
    const env = { ASSETS: { fetch() { return new Response("static", { status: 200 }); } } };
    const req = new Request("https://koyasi777.com/api/mozkey/release");
    const first = await worker.fetch(req, env, ctx);
    await Promise.all(tasks);
    assert.equal((await first.json()).version, "v1.0.0");
    const second = await worker.fetch(req, env, ctx);
    assert.equal((await second.json()).version, "v1.0.0");
    assert.equal(upstreamCalls, 1);
    assert.equal(await (await worker.fetch(new Request("https://koyasi777.com/mozkey/"), env, ctx)).text(), "static");
    assert.equal((await worker.fetch(new Request(req.url, { method: "POST" }), env, ctx)).status, 405);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.caches = oldCaches;
  }
});

test("GitHub API outage fails safely without caching errors", async () => {
  const oldFetch = globalThis.fetch;
  const oldCaches = globalThis.caches;
  try {
    globalThis.fetch = async () => { throw new Error("offline"); };
    globalThis.caches = { default: { async match() { return undefined; }, async put() { assert.fail("error cached"); } } };
    const response = await worker.fetch(new Request("https://koyasi777.com/api/mozkey/release"), { ASSETS: {} }, { waitUntil() {} });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "release_unavailable");
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = oldFetch; globalThis.caches = oldCaches; }
});
