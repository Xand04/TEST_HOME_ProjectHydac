import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.SCOUT_TEST_URL || "http://localhost:5173";
const executablePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = new URL("../outputs/", import.meta.url);
await mkdir(output, { recursive: true });

for (let attempt = 0; attempt < 45; attempt++) {
  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(2000) });
    if (response.ok) break;
    if (attempt === 44) throw new Error(`Server returned ${response.status}`);
  } catch (error) {
    if (attempt === 44) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-first-run"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  locale: "de-DE",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const checks = [];
const layoutFailures = [];
const log = (name, details = {}) => { checks.push({ name, ...details }); console.log(JSON.stringify({ name, ...details })); };
const tab = (name) => page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name, exact: true });
async function capture(name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: new URL(name, output).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: true });
}

async function checkOverflow(name) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("main *,header *,nav *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > innerWidth + 2 && getComputedStyle(element).position !== "fixed";
      }).slice(0, 12).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent?.slice(0, 70) })),
  }));
  if (dimensions.scrollWidth > dimensions.width + 1) layoutFailures.push(`${name}: horizontal overflow ${JSON.stringify(dimensions)}`);
  log(name, { width: dimensions.width, scrollWidth: dimensions.scrollWidth });
}

async function openClaas() {
  await tab("Portfolio").click();
  await page.locator(".company-identity").filter({ hasText: "CLAAS" }).click();
  await page.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor();
  assert.match(page.url(), /#.*tab=dossier/);
  assert.match(page.url(), /kunde=claas/);
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".company-row").first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const companyCount = await page.locator(".company-row").count();
  assert.ok(companyCount >= 3, "Verified companies should load");
  log("Verified portfolio loaded", { companyCount });

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await tab("Portfolio").click();
    await checkOverflow(`Portfolio responsive ${width}`);
    await openClaas();
    await checkOverflow(`Dossier responsive ${width}`);
    assert.ok((await page.locator(".ds-source a").count()) > 2, "Source links must exist");
    await tab("Vergleich").click();
    await page.locator(".cmp-quadrants").waitFor();
    assert.equal(await page.locator(".cmp-quadrant").count(), 4);
    await checkOverflow(`Matrix responsive ${width}`);
    await page.getByRole("button", { name: "Liste", exact: true }).click();
    await page.locator("#compare-sort").selectOption("revenue");
    await checkOverflow(`Comparison list responsive ${width}`);
    await page.locator(".cmp-company-button").first().click();
    await page.locator(".dossier").waitFor();
    log(`Comparison opens dossier ${width}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await tab("Portfolio").click();
  await capture("portfolio-mobile.png");
  await page.locator("#portfolio-search").fill("CLAAS");
  assert.equal(await page.locator(".company-row").count(), 1);
  await page.locator("#portfolio-search").press("Enter");
  await page.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor();
  await capture("dossier-mobile.png");
  const minimumKpiButtons = await page.locator(".ds-kpi-status").evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  assert.ok(minimumKpiButtons.width >= 44 && minimumKpiButtons.height >= 44);
  await page.locator(".ds-kpi-status").click();
  await page.locator(".toast").waitFor();
  log("Search Enter, hash navigation, source links and status toast");

  await page.locator(".toast button").click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("dossier-desktop.png");
  const pdf = await page.pdf({ path: new URL("dossier.pdf", output).pathname.replace(/^\/([A-Za-z]:)/, "$1"), preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  log("A4 dossier PDF generated", { pages: pdfPages, bytes: pdf.length });
  assert.equal(pdfPages, 2, "The CLAAS dossier print should have two pages");
  await tab("Portfolio").click();
  await capture("portfolio-desktop.png");
  await checkOverflow("Portfolio desktop 1440");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Neue Analyse", exact: true }).click();
  await page.locator("#analysis-query").fill("CLAAS");
  const analysisResponse = page.waitForResponse((response) => response.url().endsWith("/api/analyze") && response.request().method() === "POST", { timeout: 60000 });
  await page.locator("#analysis-query").press("Enter");
  await page.getByRole("dialog").filter({ hasText: "Der Markt wird durchsuchbar." }).waitFor();
  const response = await analysisResponse;
  const analysis = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(analysis));
  await page.locator(".dossier h1").filter({ hasText: "CLAAS" }).waitFor({ timeout: 15000 });
  log("REAL CLAAS analysis completed", {
    signalCount: analysis.signals?.length,
    liveSignals: analysis.signals?.filter((signal) => signal.origin === "live").length,
    providers: analysis.providers,
  });
  assert.ok(analysis.signals?.some((signal) => signal.origin === "live"), "Live web analysis should retrieve current external results");
  const livePdf = await page.pdf({ path: new URL("dossier-live.pdf", output).pathname.replace(/^\/([A-Za-z]:)/, "$1"), preferCSSPageSize: true, printBackground: true });
  const livePdfPages = (livePdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  log("Live-researched dossier PDF generated", { pages: livePdfPages });
  assert.equal(livePdfPages, 2, "The updated live dossier print should have two pages");
  await page.locator(".ds-delete-button").click();
  await page.getByRole("dialog", { name: "Dossier entfernen?" }).waitFor();
  await page.getByRole("button", { name: "Behalten", exact: true }).click();
  await page.locator(".dossier").waitFor();
  assert.ok((await page.locator(".dossier h1").innerText()).includes("CLAAS"));
  await page.locator(".ds-delete-button").click();
  await page.getByRole("dialog").getByRole("button", { name: "Dossier entfernen", exact: true }).click();
  await page.locator(".portfolio-page").waitFor();
  assert.equal(await page.locator(".company-identity").filter({ hasText: "CLAAS" }).count(), 0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kundenmarkt-scout-v1") || "{}"));
  assert.ok(!stored.companies.some((company) => company.id === "claas"));
  log("Delete sheet cancel, confirm, and persisted local removal");

  assert.deepEqual(pageErrors, [], "Browser runtime must not throw");
  assert.deepEqual(layoutFailures, [], "All supported widths must avoid page overflow");
  log("Browser runtime clean", { errors: pageErrors.length });
  await writeFile(new URL("ui-smoke-results.json", output), JSON.stringify({ baseURL, checkedAt: new Date().toISOString(), checks, pageErrors }, null, 2));
} catch (error) {
  await page.screenshot({ path: new URL("failure.png", output).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: true }).catch(() => {});
  await writeFile(new URL("ui-smoke-results.json", output), JSON.stringify({ baseURL, checks, pageErrors, error: error.message }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
