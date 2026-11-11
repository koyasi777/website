import { serveMozkey, refreshMozkey } from "./mozkey-gh-runtime.mjs";
import { servePublicSponsors, refreshPublicSponsors } from "./mozkey-sponsors-runtime.mjs";
// API-only Worker for Mozkey release metadata. Other requests preserve Astro's static assets.
const REPO = "koyasi777/mozkey";
const GH_DOWNLOAD_ROOT = `https://github.com/${REPO}/releases/download/`;
// Accept the current explicit Windows filenames and the v1.0.0 legacy names.
// Only these exact names may be promoted into a public download link.
const PLATFORMS = {
  windowsX64: ["windows_x64.msi", "x64.msi"],
  windowsArm64: ["windows_arm64.msi", "arm64.msi"],
  macosUniversal: ["macos_universal.pkg"],
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

  for (const [key, suffixes] of Object.entries(PLATFORMS)) {
    const allowedNames = suffixes.map((suffix) => `Mozkey_${version}_${suffix}`);
    const matching = input.assets.filter((a) => a && allowedNames.includes(a.name) && a.state === "uploaded");
    // Ambiguous Windows assets are not safe to auto-select.
    if (matching.length !== 1) return null;
    const asset = matching[0];
    const name = asset.name;
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

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    const kind = pathname === "/api/mozkey/release" ? "release" :
      pathname === "/api/mozkey/stats" ? "stats" : null;
    const isSponsors = pathname === "/api/mozkey/sponsors";
    if (!kind && !isSponsors) return env.ASSETS.fetch(request);
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" },
      });
    }
    if (isSponsors) return servePublicSponsors(env);
    return serveMozkey(kind, request, env, ctx, parseLatestRelease);
  },
  async scheduled(controller, env, ctx) {
    const tasks = [refreshMozkey(controller, env, parseLatestRelease)];
    const scheduledTime = Number.isFinite(controller?.scheduledTime) ? controller.scheduledTime : Date.now();
    // Reuse the existing quarter-hour cron; update public sponsors once per hour.
    if (new Date(scheduledTime).getUTCMinutes() === 0) {
      tasks.push(refreshPublicSponsors(env));
    }
    const task = Promise.allSettled(tasks);
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
  },
};
