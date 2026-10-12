import { readFile, writeFile, readdir } from "node:fs/promises";
const root = new URL("../dist/", import.meta.url),
  metadata = JSON.parse(
    await readFile(new URL("admin-build.json", root), "utf8"),
  );
let html = await readFile(new URL("index.html", root), "utf8");
html = html
  .replace(/<title>[^<]*<\/title>/, "<title>DUUK Admin</title>")
  .replace(/<link[^>]*rel="icon"[^>]*>/g, "")
  .replace(
    "</head>",
    '<link rel="icon" href="/admin-assets/favicon.ico"><link rel="icon" type="image/png" sizes="32x32" href="/admin-assets/icon-32.png"><link rel="apple-touch-icon" href="/admin-assets/icon-180.png"><link rel="manifest" href="/admin-assets/manifest.webmanifest"><meta name="theme-color" content="#080808"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="robots" content="noindex,nofollow"></head>',
  );
await writeFile(new URL("admin-shell.html", root), html);
const assets = (await readdir(new URL("assets/", root)))
  .filter((f) => /\.(m?js|css|woff2?)$/.test(f))
  .map((f) => "/assets/" + f);
const fonts = (await readdir(new URL("fonts/", root), { recursive: true }))
  .filter((f) => /\.woff2?$/.test(f))
  .map((f) => "/fonts/" + f);
const icons = [32, 64, 180, 192, 512].map((s) => `/admin-assets/icon-${s}.png`);
const source = await readFile(
  new URL("admin-worker.template.js", import.meta.url),
  "utf8",
);
const worker =
  `const BUILD=${JSON.stringify(metadata.build_id)};\nconst SHELL=${JSON.stringify(html)};\nconst ASSETS=${JSON.stringify([...assets, ...fonts, ...icons, "/media/duuk-logo-white.png"])};\n` +
  source;
await writeFile(new URL("admin-sw.js", root), worker);
await writeFile(new URL("admin-version.json", root), JSON.stringify(metadata));
