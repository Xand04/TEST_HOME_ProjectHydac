import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseURL = process.env.SCOUT_TEST_URL || "http://127.0.0.1:8787";
const executablePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = new URL("../outputs/", import.meta.url);
await mkdir(output, { recursive: true });
const temporaryRoot = resolve(tmpdir());
const profile = await mkdtemp(join(temporaryRoot, "kundenmarkt-scout-pwa-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath, headless: true, args: ["--no-first-run"],
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true,
  isMobile: true, locale: "de-DE", serviceWorkers: "allow",
});
await context.addInitScript(() => {
  window.__scoutSwUpdateChecks = 0;
  if ("ServiceWorkerRegistration" in window) {
    const original = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function (...args) {
      window.__scoutSwUpdateChecks++;
      return original.apply(this, args);
    };
  }
});
const page = await context.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const log = (name, details = {}) => { checks.push({ name, ...details }); console.log(JSON.stringify({ name, ...details })); };
const tab = (name) => page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name, exact: true });

async function snapshotCaches() {
  return page.evaluate(async () => {
    const result = {};
    for (const name of await caches.keys()) {
      result[name] = (await (await caches.open(name)).keys()).map((request) => request.url);
    }
    return result;
  });
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator(".company-row").first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", undefined, { timeout: 45000 });
  await page.waitForFunction(() => window.__scoutSwUpdateChecks > 0);
  const registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      active: registration.active?.scriptURL, scope: registration.scope,
      updateViaCache: registration.updateViaCache,
      updateChecks: window.__scoutSwUpdateChecks,
    };
  });
  assert.equal(new URL(registration.active).pathname, "/sw.js");
  assert.equal(registration.updateViaCache, "none");
  log("Production service worker installed, activated and checked for updates", registration);
  const installedCache = Object.values(await snapshotCaches()).flat();
  assert.ok(installedCache.some((url) => /\/Dossier-.*\.js$/.test(url)), "Dossier tab must be cached at completed worker installation");
  assert.ok(installedCache.some((url) => /\/Compare-.*\.js$/.test(url)), "Comparison tab must be cached at completed worker installation");
  assert.ok(!installedCache.some((url) => /\/_next\/static\/chunks\/_next\//.test(url)), "Build asset references must resolve from the correct root");
  log("First completed installation pre-caches lazy dossier and comparison tabs");

  const manifestResponse = await page.request.get(`${baseURL}/manifest.webmanifest`);
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.equal(manifest.lang, "de");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const manifestCheck = await cdp.send("Page.getAppManifest");
  assert.equal(manifestCheck.errors.length, 0, JSON.stringify(manifestCheck.errors));
  const installability = await cdp.send("Page.getInstallabilityErrors").catch(() => null);
  if (installability) assert.deepEqual(installability.installabilityErrors, [], "Chrome should find no PWA installation blockers");
  log("Standalone manifest, icons and Chrome manifest validation", {
    display: manifest.display, icons: manifest.icons, installabilityErrors: installability?.installabilityErrors,
  });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kundenmarkt-scout-v1") || "null"));
  assert.ok(stored?.companies?.length >= 3);
  assert.ok(stored.companies.every((company) => company.signals.every((signal) => Boolean(signal.source?.url))));
  log("Real dossiers persisted with source links", { companies: stored.companies.length });

  await page.locator(".company-identity").filter({ hasText: "CLAAS" }).click();
  await page.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor();
  const sourceCount = await page.locator(".ds-source a").count();
  assert.ok(sourceCount > 2);
  await tab("Vergleich").click();
  await page.locator(".cmp-quadrants").waitFor();
  assert.equal(await page.locator(".cmp-quadrant").count(), 4);
  await tab("Dossier").click();
  await page.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor();

  const cacheSnapshot = await snapshotCaches();
  const urls = Object.values(cacheSnapshot).flat();
  assert.ok(urls.some((url) => new URL(url).pathname === "/"));
  assert.ok(urls.some((url) => /\/Dossier-.*\.js$/.test(url)));
  assert.ok(urls.some((url) => /\/Compare-.*\.js$/.test(url)));
  assert.ok(urls.some((url) => /\.css$/.test(url)));
  assert.ok(!urls.some((url) => /\/api\/|\/signin-with-chatgpt|\/signout-with-chatgpt|\/callback/.test(url)), "APIs and authentication must not enter Cache Storage");
  log("Shell, split tabs and CSS cached; API/auth responses excluded", {
    cacheNames: Object.keys(cacheSnapshot), entries: urls.length,
  });

  await context.setOffline(true);
  log("Offline emulation state before reload", await page.evaluate(() => ({
    online: navigator.onLine, banner: document.querySelector(".connection-banner")?.textContent ?? null,
  })));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor({ timeout: 15000 });
  log("Offline emulation state after reload", await page.evaluate(async () => ({
    online: navigator.onLine, banner: document.querySelector(".connection-banner")?.textContent ?? null,
    networkWorks: await fetch("/api/status", { cache: "no-store" }).then(() => true).catch(() => false),
    viewport: document.querySelector('meta[name="viewport"]')?.outerHTML ?? null,
  })));
  await page.locator(".connection-banner").filter({ hasText: "Offline" }).waitFor();
  assert.equal(await page.locator(".ds-source a").count(), sourceCount);
  assert.match(page.url(), /tab=dossier/);
  assert.match(page.url(), /kunde=claas/);
  await page.waitForFunction(() => window.__scoutSwUpdateChecks > 0);
  log("Offline cold reload restores selected dossier and source links", {
    url: page.url(), sourceLinks: sourceCount,
    coldStartUpdateChecks: await page.evaluate(() => window.__scoutSwUpdateChecks),
  });

  await tab("Portfolio").click();
  await page.locator(".company-row").first().waitFor();
  await tab("Vergleich").click();
  await page.locator(".cmp-quadrants").waitFor();
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.locator("#compare-sort").selectOption("revenue");
  await page.locator(".cmp-company-button").first().click();
  await page.locator(".dossier h1").waitFor();
  log("All cached tabs and comparison navigation work offline");
  await page.screenshot({ path: fileURLToPath(new URL("lighthouse-offline-dossier.png", output)), fullPage: true });

  const installedStart = await context.newPage();
  await installedStart.goto(`${baseURL}${manifest.start_url}#tab=dossier&kunde=claas`, { waitUntil: "domcontentloaded" });
  await installedStart.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor({ timeout: 15000 });
  await installedStart.locator(".connection-banner").waitFor();
  await installedStart.close();
  log("Manifest start URL opens a saved dossier offline");

  await context.setOffline(false);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".dossier h1").waitFor();
  const afterReconnect = Object.values(await snapshotCaches()).flat();
  assert.ok(!afterReconnect.some((url) => /\/api\/|\/signin-with-chatgpt|\/signout-with-chatgpt|\/callback/.test(url)));
  assert.deepEqual(errors, []);
  log("Reconnection succeeds; no browser runtime errors or private API cache");
  await writeFile(new URL("lighthouse-pwa-smoke.json", output), JSON.stringify({
    baseURL, checkedAt: new Date().toISOString(), checks, errors, cacheSnapshot,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: fileURLToPath(new URL("lighthouse-pwa-failure.png", output)), fullPage: true }).catch(() => {});
  await writeFile(new URL("lighthouse-pwa-smoke.json", output), JSON.stringify({
    baseURL, checkedAt: new Date().toISOString(), checks, errors, failure: error.message,
  }, null, 2));
  throw error;
} finally {
  await context.close();
  const resolvedProfile = resolve(profile);
  if (resolvedProfile.startsWith(temporaryRoot + sep) && resolvedProfile.split(sep).at(-1).startsWith("kundenmarkt-scout-pwa-")) {
    await rm(resolvedProfile, { recursive: true, force: true }).catch(() => {});
  }
}
