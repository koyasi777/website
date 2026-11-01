// API-only Worker for Mozkey release metadata. Other requests preserve Astro's static assets.
const REPO = "koyasi777/mozkey";
const GH_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const GH_DOWNLOAD_ROOT = `https://github.com/${REPO}/releases/download/`;
const CACHE_SECONDS = 900; // 15 minutes, per Cloudflare colo
const PLATFORMS = {
  windowsX64: "x64.msi",
  windowsArm64: "arm64.msi",
  macosUniversal: "macos_universal.pkg",
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isHex256(digest) {
  return typeof digest === "string" && /^sha256:[a-f0-9]{64}$/i.test(digest);
}

export function parseLatestRelease(input, now = new Date().toISOString()) {
  if (!input || typeof input !== "object" || input.draft !== false || input.prerelease !== false) return null;
  const version = input.tag_name;
  if (typeof version !== "string" || !/^v\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof input.published_at !== "string" || !Number.isFinite(Date.parse(input.published_at))) return null;
  if (!Array.isArray(input.assets)) return null;
  const base = `${GH_DOWNLOAD_ROOT}${version}/`;
  const assets = {};

  for (const [key, suffix] of Object.entries(PLATFORMS)) {
    const name = `Mozkey_${version}_${suffix}`;
    const matching = input.assets.filter((a) => a && a.name === name && a.state === "uploaded");
    if (matching.length !== 1) return null;
    const asset = matching[0];
    if (asset.browser_download_url !== base + encodeURIComponent(name)) return null;
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2_000_000_000) return null;
    if (!isHex256(asset.digest)) return null;
    assets[key] = {
      name,
      url: asset.browser_download_url,
      size: asset.size,
      sha256: asset.digest.slice(7).toLowerCase(),
    };
  }

  // Publication can precede completed uploads. Only promote a fully populated release.
  const sums = input.assets.filter((a) => a && a.name === "SHA256SUMS.txt" && a.state === "uploaded");
  if (sums.length !== 1 || sums[0].browser_download_url !== base + "SHA256SUMS.txt") return null;
  if (!hasOwn(assets, "windowsX64") || !hasOwn(assets, "windowsArm64") || !hasOwn(assets, "macosUniversal")) return null;

  return {
    version,
    publishedAt: input.published_at,
    checkedAt: now,
    releaseUrl: `https://github.com/${REPO}/releases/tag/${version}`,
    checksumsUrl: sums[0].browser_download_url,
    assets,
  };
}

function responseJSON(data, status, cacheable) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? `public, max-age=${CACHE_SECONDS}` : "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/mozkey/release") return env.ASSETS.fetch(request);
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
    }

    const cache = globalThis.caches?.default;
    const key = new Request(`${url.origin}/api/mozkey/release`, { method: "GET" });
    if (cache) {
      const cached = await cache.match(key);
      if (cached) return cached;
    }

    try {
      const upstream = await fetch(GH_API, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "koyasi777-com-mozkey-release-metadata",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!upstream.ok) throw new Error("GitHub unavailable");
      const json = await upstream.json();
      const release = parseLatestRelease(json);
      if (!release) throw new Error("Latest release has incomplete or unexpected assets");
      const response = responseJSON(release, 200, true);
      if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    } catch {
      // Do not cache errors or send unvalidated URLs. The static v1.0.0 HTML remains usable.
      return responseJSON({ error: "release_unavailable" }, 503, false);
    }
  },
};
