import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const failures = [];

const fail = (message) => failures.push(message);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function internalTarget(href) {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const clean = href.split("#")[0].split("?")[0];
  if (!clean) return path.join(dist, "index.html");
  if (clean.endsWith("/")) return path.join(dist, clean.slice(1), "index.html");
  const ext = path.extname(clean);
  if (ext) return path.join(dist, clean.slice(1));
  return path.join(dist, clean.slice(1), "index.html");
}

if (!fs.existsSync(dist)) {
  fail("dist/ がありません。先に npm run build を実行してください。");
} else {
  const htmlFiles = walk(dist).filter((f) => f.endsWith(".html"));

  for (const file of htmlFiles) {
    const rel = path.relative(dist, file).replaceAll("\\", "/");
    const html = fs.readFileSync(file, "utf8");

    if (!/<html[^>]+lang="ja"/i.test(html)) fail(`${rel}: html lang="ja" がありません`);
    if (countMatches(html, /<h1(?:\s|>)/gi) !== 1) fail(`${rel}: h1 が1個ではありません`);
    if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) fail(`${rel}: description がありません`);
    if (!/<link\s+rel="canonical"\s+href="https:\/\/koyasi777\.com\//i.test(html)) fail(`${rel}: canonical が不正です`);
    if (!/<meta\s+property="og:title"/i.test(html)) fail(`${rel}: og:title がありません`);
    if (!/<meta\s+property="og:description"/i.test(html)) fail(`${rel}: og:description がありません`);
    if (!/<meta\s+property="og:image"\s+content="https:\/\/koyasi777\.com\/og\//i.test(html)) fail(`${rel}: og:image がありません`);
    if (!/<meta\s+name="twitter:card"\s+content="summary_large_image"/i.test(html)) fail(`${rel}: twitter card が large image ではありません`);

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) fail(`${rel}: id="${id}" が重複しています`);
      seen.add(id);
    }

    for (const match of html.matchAll(/\shref="([^"]+)"/g)) {
      const href = match[1];
      const target = internalTarget(href);
      if (target && !fs.existsSync(target)) {
        fail(`${rel}: 内部リンク ${href} の出力先がありません`);
      }
    }

    for (const match of html.matchAll(/\ssrc="(\/[^"]+)"/g)) {
      const src = match[1].split("?")[0];
      const target = path.join(dist, src.slice(1));
      if (!fs.existsSync(target)) fail(`${rel}: 画像/スクリプト ${src} がありません`);
    }

    if (/localhost|127\.0\.0\.1/.test(html)) fail(`${rel}: localhost の参照が残っています`);
  }

  const notFound = path.join(dist, "404.html");
  if (fs.existsSync(notFound)) {
    const html = fs.readFileSync(notFound, "utf8");
    if (!/<meta\s+name="robots"\s+content="noindex, nofollow"/i.test(html)) {
      fail("404.html: noindex, nofollow がありません");
    }
  }
}

for (const rel of [
  "dist/favicon.svg",
  "dist/favicon-32.png",
  "dist/apple-touch-icon.png",
  "dist/og/default.png",
  "dist/og/projects.png",
  "dist/og/seoto.png",
  "dist/sitemap-index.xml",
  "dist/robots.txt",
]) {
  if (!fs.existsSync(path.join(root, rel))) fail(`${rel} がありません`);
}

const cssPath = path.join(root, "src/styles/global.css");
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, "utf8");
  if (css.includes(".keyboard-key.is-home")) fail("削除済みのホーム段マーカーCSSが復活しています");
  if (css.includes("min-width: 700px")) fail("旧モバイル配列図の min-width: 700px が残っています");
  if (!css.includes('--key-size: clamp(23px, calc((100vw - 82px) / 10), 30px);')) {
    fail("モバイル配列図のviewport-fitルールが見つかりません");
  }
}

if (failures.length) {
  console.error("\nPre-publish audit: FAILED\n");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("\nPre-publish audit: PASSED");
console.log("- HTML metadata / canonical / OG");
console.log("- single H1 / duplicate IDs");
console.log("- internal links / local assets");
console.log("- 404 noindex");
console.log("- favicon / OG / sitemap / robots");
console.log("- Seoto mobile keyboard guardrails");
