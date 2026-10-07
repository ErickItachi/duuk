/* One worker, scoped to the administrative application. No private response is cached. */
const CACHE = "duuk-admin-" + BUILD;
const clientsVersions = new Map();
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.put(
        "/admin-shell.html",
        new Response(SHELL, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
      await cache.addAll(ASSETS);
      // Updating workers wait for explicit SKIP_WAITING from an acknowledged client.
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      for (const client of await self.clients.matchAll({ type: "window" }))
        client.postMessage({ type: "DUUK_REPORT_VERSION" });
    })(),
  ),
);
async function cleanUnusedCaches() {
  const clients = await self.clients.matchAll({ type: "window" });
  if (clients.some((c) => !clientsVersions.has(c.id))) return;
  const needed = new Set([
    BUILD,
    ...clients.map((c) => clientsVersions.get(c.id)),
  ]);
  for (const key of await caches.keys())
    if (
      key.startsWith("duuk-admin-") &&
      !needed.has(key.slice("duuk-admin-".length))
    )
      await caches.delete(key);
}
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "DUUK_CLIENT_VERSION" && event.source?.id) {
    clientsVersions.set(event.source.id, event.data.build);
    event.waitUntil(cleanUnusedCaches());
  }
  if (event.data?.type === "DUUK_VERSION")
    event.ports[0]?.postMessage({ build: BUILD });
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && /^\/admin(?:\/|$)/.test(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match("/admin-shell.html"))
        .then((r) => r || fetch(request)),
    );
  } else if (
    ASSETS.includes(url.pathname) ||
    /^\/assets\/.+\.(m?js|css)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const current = await caches.open(CACHE);
        const cached =
          (await current.match(request)) || (await caches.match(request));
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && ASSETS.includes(url.pathname))
          await current.put(request, response.clone());
        return response;
      })(),
    );
  }
});
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload?.title) return;
  const url = String(payload.url || "/admin/");
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || "",
      icon: "/admin-assets/icon-192.png",
      badge: "/admin-assets/icon-64.png",
      tag: payload.tag || "duuk",
      data: { url: /^\/admin(?:\/|$)/.test(url) ? url : "/admin/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/admin/",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = windows.find((c) =>
        c.url.startsWith(self.location.origin + "/admin"),
      );
      if (open) {
        await open.focus();
        open.postMessage({ type: "DUUK_NAVIGATE", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
