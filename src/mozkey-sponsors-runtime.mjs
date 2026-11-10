// Public GitHub Sponsors only. Never publish private sponsorships or funding data.
// Only scheduled refreshes call GitHub; page requests read the shared KV snapshot.
const KEY = "mozkey:github:v1:sponsors";
const GRAPHQL_URL = "https://api.github.com/graphql";
const LIST_LIMIT = 48;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

const QUERY = `query PublicMozkeySponsors($cursor: String) {
  user(login: "koyasi777") {
    sponsorshipsAsMaintainer(
      first: 100
      after: $cursor
      activeOnly: true
      includePrivate: false
      orderBy: {field: CREATED_AT, direction: DESC}
    ) {
      nodes {
        privacyLevel
        sponsorEntity {
          ... on User { login }
          ... on Organization { login }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

function hasKV(env) {
  return typeof env?.MOZKEY_CACHE?.get === "function" &&
    typeof env.MOZKEY_CACHE.put === "function";
}

function isLogin(login) {
  return typeof login === "string" && login.length <= 39 &&
    GITHUB_LOGIN.test(login) && !login.endsWith("-");
}

function validSaved(value, now = Date.now()) {
  if (!value || typeof value !== "object" || !Array.isArray(value.sponsors) ||
      value.sponsors.length > LIST_LIMIT || typeof value.checkedAt !== "string") return false;
  const age = now - Date.parse(value.checkedAt);
  if (!Number.isFinite(age) || age < -5 * 60_000 || age > MAX_AGE_MS) return false;
  const seen = new Set();
  for (const login of value.sponsors) {
    if (!isLogin(login) || seen.has(login.toLowerCase())) return false;
    seen.add(login.toLowerCase());
  }
  return true;
}

function reply(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function servePublicSponsors(env) {
  if (!hasKV(env)) return reply({ error: "sponsors_unavailable" }, 503);
  try {
    const value = await env.MOZKEY_CACHE.get(KEY, { type: "json", cacheTtl: 60 });
    if (validSaved(value)) return reply(value, 200);
  } catch {
    console.error("[mozkey-sponsors] KV read failed");
  }
  // Fail closed after six hours to avoid indefinitely listing revoked sponsorships.
  return reply({ error: "sponsors_unavailable" }, 503);
}

async function fetchPage(env, cursor) {
  // The existing read-only token may be sufficient for public GraphQL data.
  // An optional separate token can be configured if GitHub denies access.
  const token = env?.GITHUB_SPONSORS_TOKEN || env?.GITHUB_API_TOKEN;
  if (typeof token !== "string" || !token) throw new Error("GitHub token missing");
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "User-Agent": "koyasi777-com-public-sponsors",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GitHub Sponsors HTTP ${response.status}`);
  const json = await response.json();
  if (!json || (Array.isArray(json.errors) && json.errors.length > 0)) {
    throw new Error("GitHub Sponsors GraphQL error");
  }
  const connection = json.data?.user?.sponsorshipsAsMaintainer;
  if (!connection || !Array.isArray(connection.nodes) ||
      connection.nodes.length > PAGE_SIZE ||
      typeof connection.pageInfo?.hasNextPage !== "boolean") {
    throw new Error("Unexpected GitHub Sponsors response");
  }
  return connection;
}

export async function refreshPublicSponsors(env) {
  if (!hasKV(env)) return;
  try {
    const all = [];
    const seen = new Set();
    let cursor = null;
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const connection = await fetchPage(env, cursor);
      for (const node of connection.nodes) {
        // Explicit PUBLIC check protects against future API behavior changes.
        if (node?.privacyLevel !== "PUBLIC") continue;
        const login = node.sponsorEntity?.login;
        if (!isLogin(login) || seen.has(login.toLowerCase())) continue;
        seen.add(login.toLowerCase());
        all.push(login);
      }
      if (!connection.pageInfo.hasNextPage) {
        complete = true;
        break;
      }
      const next = connection.pageInfo.endCursor;
      if (typeof next !== "string" || !next || next === cursor) {
        throw new Error("Invalid GitHub Sponsors pagination");
      }
      cursor = next;
    }
    if (!complete) throw new Error("Incomplete GitHub Sponsors pagination");
    const snapshot = {
      sponsors: all.slice(0, LIST_LIMIT),
      checkedAt: new Date().toISOString(),
    };
    await env.MOZKEY_CACHE.put(KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Do not log GraphQL response bodies or tokens; preserve the prior snapshot.
    console.error("[mozkey-sponsors] refresh failed", error instanceof Error ? error.message : "unknown");
  }
}
