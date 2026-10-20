/* Increase this version for every deployment that changes the application bundle. */
const BUILD_VERSION = "2026-10-20-v2";
const PREFIX = "kundenmarkt-scout-";
const SHELL = `${PREFIX}${BUILD_VERSION}-shell`;
const ASSETS = `${PREFIX}${BUILD_VERSION}-assets`;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
const AUTH_PATHS = new Set(["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"]);
const OFFLINE_HTML = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#102e4a"><title>Kundenmarkt-Scout · Offline</title><body style="margin:0;padding:32px;font:18px/1.5 system-ui;background:#f5f7fa;color:#102e4a"><main style="max-width:480px;margin:15vh auto"><h1>Gerade ohne Empfang.</h1><p>Öffne Kundenmarkt-Scout einmal mit Internet, damit deine Dossiers auf diesem Gerät verfügbar sind.</p><a href="/" style="display:inline-block;padding:14px 20px;background:#102e4a;color:white;border-radius:12px">Erneut versuchen</a></main></body></html>`;

function mayCache(response) {
  return response.ok && !response.redirected && response.type !== "opaque" && !/no-store/i.test(response.headers.get("cache-control") || "");
}

function staticUrl(value, base) {
  try {
    const url = new URL(value.startsWith("_next/") ? `/${value}` : value, base);
    if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || AUTH_PATHS.has(url.pathname)) return null;
    return /\.(?:m?js|css|woff2?|png|svg|webp|ico)$/.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The first page's scripts can load before the worker takes control. Discover
 * same-origin bundle dependencies so the first completed installation has a
 * usable offline shell, including modules loaded by React's lazy tabs.
 */
async function cacheShellDependencies(html) {
  const assets = await caches.open(ASSETS);
  const queue = [];
  const seen = new Set();
  const collect = (text, base) => {
    for (const match of text.matchAll(/["']([^"'<>\\\s]+\.(?:m?js|css)(?:\?[^"'<>\\\s]*)?)["']/g)) {
      const url = staticUrl(match[1], base);
      if (url && !seen.has(url.href) && seen.size < 80) {
        seen.add(url.href);
        queue.push(url.href);
      }
    }
  };
  collect(html, self.location.origin);
  while (queue.length) {
    const batch = queue.splice(0, 6);
    await Promise.allSettled(batch.map(async (url) => {
      const response = await fetch(url, { credentials: "same-origin", cache: "reload" });
      if (!mayCache(response)) return;
      await assets.put(url, response.clone());
      if (/\.(?:m?js|css)(?:\?|$)/.test(url)) collect(await response.text(), url);
    }));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    const response = await fetch("/", { credentials: "same-origin", cache: "reload" });
    if (!response.ok || response.redirected || !(response.headers.get("content-type") || "").includes("text/html")) {
      throw new Error("Die App-Hülle konnte nicht sicher gespeichert werden.");
    }
    // This shell contains no SAP responses or authenticated user profile data.
    await shell.put("/", response.clone());
    await Promise.allSettled(SHELL_URLS.slice(1).map(async (url) => {
      const asset = await fetch(url, { credentials: "same-origin", cache: "reload" });
      if (mayCache(asset)) await shell.put(url, asset);
    }));
    await cacheShellDependencies(await response.text());
  })());
  // Updates deliberately wait for the user's "Jetzt aktualisieren" action.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && ![SHELL, ASSETS].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function clearPrivateData() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(PREFIX)).map((key) => caches.delete(key)));
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "CLEAR_PRIVATE_DATA" });
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "CLEAR_PRIVATE_DATA") event.waitUntil(clearPrivateData());
});

async function documentResponse(request) {
  const shell = await caches.open(SHELL);
  const cached = await shell.match("/");
  let timer;
  const network = fetch(request).then(async (response) => {
    if (response.status === 401 || response.status === 403) await clearPrivateData();
    if (mayCache(response) && (response.headers.get("content-type") || "").includes("text/html")) {
      await shell.put("/", response.clone());
    }
    return response;
  });
  try {
    // A saved shell wins after a short connectivity check; first visits still
    // await the network and are never mistaken for an installed offline app.
    return cached
      ? await Promise.race([network, new Promise((resolve) => { timer = setTimeout(() => resolve(cached), 2200); })])
      : await network;
  } catch {
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  } finally {
    clearTimeout(timer);
  }
}

async function assetResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (mayCache(response)) {
    const assets = await caches.open(ASSETS);
    await assets.put(request, response.clone());
    const keys = await assets.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 160)).map((key) => assets.delete(key)));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/signout-with-chatgpt") {
    event.waitUntil(clearPrivateData());
    return;
  }
  // Auth and APIs always reach the network. SAP data must not enter this cache.
  if (AUTH_PATHS.has(url.pathname) || url.pathname.startsWith("/api/") || request.method !== "GET") return;
  if (request.mode === "navigate") {
    if (url.pathname === "/") event.respondWith(documentResponse(request));
    return;
  }
  if (staticUrl(url.href, self.location.origin) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(assetResponse(request));
  }
});
