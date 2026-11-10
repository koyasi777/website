// GitHub-backed Mozkey metadata. KV is the cross-region source of truth;
// scheduled refreshes bound GitHub API usage independently of page traffic.
const REPO = "koyasi777/mozkey";
const ROOT = `https://api.github.com/repos/${REPO}`;
const KV_PREFIX = "mozkey:github:v1:";
const COOLDOWN_KEY = KV_PREFIX + "cooldown";
const CLIENT_CACHE = { release: 120, stats: 300 };
const MAX_STALE_AGE = { release: 20 * 60_000, stats: 70 * 60_000 };
let isolateCooldownUntil = 0;

function hasKV(env) {
  return !!(env?.MOZKEY_CACHE && typeof env.MOZKEY_CACHE.get === "function" &&
    typeof env.MOZKEY_CACHE.put === "function");
}

function validData(kind, data) {
  if (!data || typeof data !== "object" || !Number.isFinite(Date.parse(data.checkedAt))) return false;
  if (kind === "stats") {
    return Number.isSafeInteger(data.stars) && data.stars >= 0 &&
      Number.isSafeInteger(data.installerDownloads) && data.installerDownloads >= 0;
  }
  if (typeof data.version !== "string" || !/^v\d+\.\d+\.\d+$/.test(data.version) ||
      !Number.isFinite(Date.parse(data.publishedAt))) return false;
  const base = `https://github.com/${REPO}/releases/download/${data.version}/`;
  if (data.releaseUrl !== `https://github.com/${REPO}/releases/tag/${data.version}` ||
      data.checksumsUrl !== base + "SHA256SUMS.txt" || !data.assets) return false;
  for (const [key, suffix] of Object.entries({
    windowsX64: "x64.msi", windowsArm64: "arm64.msi", macosUniversal: "macos_universal.pkg",
  })) {
    const asset = data.assets[key];
    const name = `Mozkey_${data.version}_${suffix}`;
    if (!asset || asset.name !== name || asset.url !== base + name ||
        !Number.isSafeInteger(asset.size) || asset.size <= 0 ||
        typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256)) return false;
  }
  return true;
}

async function loadSaved(env, kind) {
  if (!hasKV(env)) return null;
  try {
    const value = await env.MOZKEY_CACHE.get(KV_PREFIX + kind, { type: "json", cacheTtl: 30 });
    return validData(kind, value) ? value : null;
  } catch (error) {
    console.error(`[mozkey-${kind}] KV read failed`, error instanceof Error ? error.name : "unknown");
    return null;
  }
}

async function saveValidated(env, kind, data) {
  if (!hasKV(env) || !validData(kind, data)) return;
  try {
    // Do not expire last-known-good results: if GitHub is offline, preserve them.
    await env.MOZKEY_CACHE.put(KV_PREFIX + kind, JSON.stringify(data));
  } catch (error) {
    // A racing cold request may hit KV's 1 write/second/key limit.
    // A failed write must never invalidate a successful read from GitHub.
    console.error(`[mozkey-${kind}] KV write failed`, error instanceof Error ? error.name : "unknown");
  }
}

async function inBackoff(env) {
  if (Date.now() < isolateCooldownUntil) return true;
  if (!hasKV(env)) return false;
  try {
    const stored = await env.MOZKEY_CACHE.get(COOLDOWN_KEY);
    const until = Number(stored);
    if (Number.isFinite(until) && until > Date.now()) {
      isolateCooldownUntil = until;
      return true;
    }
  } catch { /* KV unavailable: continue with the local backoff only. */ }
  return false;
}

async function setBackoff(env, until) {
  const now = Date.now();
  // Bound accidental malformed or malicious rate-limit headers to <= 24 hours.
  const bounded = Math.max(now + 60_000, Math.min(until, now + 24 * 3600_000));
  isolateCooldownUntil = Math.max(isolateCooldownUntil, bounded);
  if (hasKV(env)) {
    try {
      await env.MOZKEY_CACHE.put(COOLDOWN_KEY, String(bounded), {
        expirationTtl: Math.max(60, Math.ceil((bounded - now) / 1000)),
      });
    } catch { /* Best-effort cross-region backoff; local backoff still applies. */ }
  }
}

function rateLimitExpiry(response) {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = Number(response.headers.get("retry-after"));
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Date.now() + retryAfter * 1000;
  if (remaining === "0" && Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return resetSeconds * 1000 + 5000;
  }
  if (response.status === 429 || response.status === 403) return Date.now() + 60_000;
  return null;
}

async function githubJSON(env, url) {
  if (await inBackoff(env)) throw new Error("GitHub backoff active");
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "koyasi777-com-mozkey-metadata",
  };
  // Never log or return this secret. Keep it only in a Cloudflare Secret.
  if (typeof env?.GITHUB_API_TOKEN === "string" && env.GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_API_TOKEN}`;
  }
  const response = await fetch(url, {
    method: "GET", headers, signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      await setBackoff(env, rateLimitExpiry(response) ?? Date.now() + 60_000);
    }
    throw new Error(`GitHub API HTTP ${response.status}`);
  }
  return response.json();
}

async function liveRelease(env, parseLatestRelease) {
  const remote = await githubJSON(env, ROOT + "/releases/latest");
  const result = parseLatestRelease(remote);
  if (!result || !validData("release", result)) throw new Error("Latest release invalid or incomplete");
  return result;
}

async function liveStats(env) {
  const repo = await githubJSON(env, ROOT);
  if (!Number.isSafeInteger(repo?.stargazers_count) || repo.stargazers_count < 0) {
    throw new Error("Invalid GitHub star count");
  }
  let installerDownloads = 0;
  let complete = false;
  for (let page = 1; page <= 10; page++) {
    const releases = await githubJSON(env, `${ROOT}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases) || releases.length > 100) throw new Error("Invalid releases list");
    for (const release of releases) {
      if (release?.draft !== false || !Array.isArray(release.assets)) continue;
      for (const asset of release.assets) {
        if (asset?.state !== "uploaded" || typeof asset.name !== "string" ||
            !/\.(?:msi|pkg)$/i.test(asset.name)) continue;
        if (!Number.isSafeInteger(asset.download_count) || asset.download_count < 0) {
          throw new Error("Invalid installer download count");
        }
        installerDownloads += asset.download_count;
        if (!Number.isSafeInteger(installerDownloads)) throw new Error("Download count overflow");
      }
    }
    if (releases.length < 100) { complete = true; break; }
  }
  if (!complete) throw new Error("Incomplete release pagination");
  return { stars: repo.stargazers_count, installerDownloads, checkedAt: new Date().toISOString() };
}

async function collect(kind, env, parseLatestRelease) {
  return kind === "release" ? liveRelease(env, parseLatestRelease) : liveStats(env);
}

function dataResponse(kind, data) {
  const age = Date.now() - Date.parse(data.checkedAt);
  const stale = !Number.isFinite(age) || age > MAX_STALE_AGE[kind];
  return new Response(JSON.stringify({ ...data, stale }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CLIENT_CACHE[kind]}`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "X-Mozkey-Data": stale ? "last-known-good" : "fresh",
    },
  });
}

function failureResponse(kind) {
  return new Response(JSON.stringify({ error: kind + "_unavailable" }), {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function serveMozkey(kind, request, env, ctx, parseLatestRelease) {
  const cache = globalThis.caches?.default;
  const key = new Request(new URL(request.url).origin + "/api/mozkey/" + kind);
  if (cache) {
    try {
      const cached = await cache.match(key);
      if (cached) return cached;
    } catch { /* Cache API availability varies by environment. */ }
  }
  const saved = await loadSaved(env, kind);
  let data = saved;
  if (!data) {
    try {
      data = await collect(kind, env, parseLatestRelease);
      await saveValidated(env, kind, data);
    } catch (error) {
      console.error(`[mozkey-${kind}] unavailable`, error instanceof Error ? error.message : "unknown");
      return failureResponse(kind);
    }
  }
  const response = dataResponse(kind, data);
  if (cache && ctx?.waitUntil) {
    ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  }
  return response;
}

export async function refreshMozkey(controller, env, parseLatestRelease) {
  // KV-backed periodic refresh: page views do not trigger GitHub API traffic.
  if (!hasKV(env)) return;
  const kinds = ["release"];
  const scheduledTime = Number.isFinite(controller?.scheduledTime) ? controller.scheduledTime : Date.now();
  if (new Date(scheduledTime).getUTCMinutes() === 0) kinds.push("stats");
  for (const kind of kinds) {
    try {
      if (await inBackoff(env)) {
        console.warn(`[mozkey-${kind}] refresh skipped: rate-limit backoff`);
        continue;
      }
      const data = await collect(kind, env, parseLatestRelease);
      await saveValidated(env, kind, data);
    } catch (error) {
      console.error(`[mozkey-${kind}] refresh failed`, error instanceof Error ? error.message : "unknown");
      // Keep last successful KV value. Next cron will retry after backoff.
    }
  }
}
