import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function workerHarness() {
  const listeners = new Map();
  const buckets = new Map();
  const messages = [];
  const calls = [];
  let offline = false;
  let skipped = false;
  const origin = "https://scout.example";
  const key = (value) => new URL(typeof value === "string" ? value : value.url, origin).href;
  const caches = {
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name);
      return {
        async put(request, response) { bucket.set(key(request), response.clone()); },
        async match(request) { return bucket.get(key(request))?.clone(); },
        async keys() { return [...bucket.keys()].map((url) => ({ url })); },
        async delete(request) { return bucket.delete(key(request)); },
      };
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); },
    async match(request) {
      for (const bucket of buckets.values()) if (bucket.has(key(request))) return bucket.get(key(request)).clone();
    },
  };
  const self = {
    location: { origin },
    clients: { async claim() {}, async matchAll() { return [{ postMessage(message) { messages.push(message); } }]; } },
    addEventListener(type, handler) { listeners.set(type, handler); },
    async skipWaiting() { skipped = true; },
  };
  const context = vm.createContext({
    self, caches, URL, Set, Promise, Response, setTimeout, clearTimeout,
    fetch: async (request) => {
      const url = key(request);
      calls.push(url);
      if (offline) throw new TypeError("offline");
      if (url === `${origin}/`) return new Response('<!doctype html><html lang="de"><script src="/assets/app.js"></script><body>Kundenmarkt-Scout</body></html>', { headers: { "Content-Type": "text/html" } });
      if (url.endsWith("/assets/app.js")) return new Response('import "./dossier.js"; const unsafe="https://external.example/not-cached.js";', { headers: { "Content-Type": "text/javascript" } });
      return new Response("asset", { headers: { "Content-Type": "application/octet-stream" } });
    },
  });
  vm.runInContext(source, context);
  return {
    listeners, caches, calls, messages,
    setOffline(value) { offline = value; },
    get skipped() { return skipped; },
    async lifecycle(type) {
      let pending;
      listeners.get(type)({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    async request(path, mode = "cors", method = "GET") {
      let response;
      const pending = [];
      listeners.get("fetch")({
        request: { url: new URL(path, origin).href, mode, method },
        respondWith(promise) { response = promise; },
        waitUntil(promise) { pending.push(promise); },
      });
      await Promise.all(pending);
      return response ? await response : undefined;
    },
    async message(type) {
      let pending;
      listeners.get("message")({ data: { type }, waitUntil(promise) { pending = promise; } });
      await pending;
    },
  };
}

test("PWA installation caches its module graph and root opens offline", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  assert.ok(worker.calls.some((url) => url.endsWith("/assets/dossier.js")));
  assert.ok(worker.calls.every((url) => url.startsWith("https://scout.example/")));
  worker.setOffline(true);
  const response = await worker.request("/?source=pwa", "navigate");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Kundenmarkt-Scout/);
  const module = await worker.request("/assets/dossier.js");
  assert.equal(module.status, 200);
});

test("PWA leaves APIs, authentication and POST requests untouched", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  assert.equal(await worker.request("/api/sap/10001"), undefined);
  assert.equal(await worker.request("/api/companies"), undefined);
  assert.equal(await worker.request("/signin-with-chatgpt", "navigate"), undefined);
  assert.equal(await worker.request("/callback", "navigate"), undefined);
  assert.equal(await worker.request("/", "cors", "POST"), undefined);
});

test("PWA updates activate only on request and logout clears only app data", async () => {
  const worker = workerHarness();
  await worker.caches.open("unrelated-app");
  await worker.lifecycle("install");
  assert.equal(worker.skipped, false);
  await worker.message("SKIP_WAITING");
  assert.equal(worker.skipped, true);
  assert.equal(await worker.request("/signout-with-chatgpt", "navigate"), undefined);
  assert.deepEqual(await worker.caches.keys(), ["unrelated-app"]);
  assert.equal(worker.messages[0].type, "CLEAR_PRIVATE_DATA");
});
