import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanText, validateQuery, parseFeed, isRelevant, classifyHeadline, searchCompany,
} from "../services/webService.ts";
import { getKundenliste, getVertriebZuKunde, normalizeSales } from "../services/sapService.ts";

test("Untrusted RSS markup is decoded as text and unsafe entries are rejected", () => {
  assert.equal(cleanText("&lt;script&gt;secret()&lt;/script&gt;A &amp; B &#228;"), "A & B ä");
  const parsed = parseFeed(`<rss><channel>
    <item><title><![CDATA[CLAAS &amp; Partner]]></title><link>https://example.org/article</link><pubDate>Mon, 12 Oct 2020 12:00:00 GMT</pubDate><source url="https://example.org">Presse</source></item>
    <item><title>CLAAS attack</title><link>javascript:alert(1)</link><pubDate>Mon, 12 Oct 2020 12:00:00 GMT</pubDate></item>
    <item><title>CLAAS future</title><link>https://example.org/future</link><pubDate>Mon, 12 Oct 2099 12:00:00 GMT</pubDate></item>
  </channel></rss>`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "CLAAS & Partner");
  assert.equal(parsed[0].publisher, "Presse");
  assert.throws(() => parseFeed("<html>upstream blocked</html>"));
});

test("Bing source links are unwrapped and irrelevant similarly named companies are filtered", () => {
  const parsed = parseFeed(`<rss><channel><item><title>CLAAS investiert</title>
    <link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fpublisher.example%2Fnews&amp;x=1</link>
    <pubDate>Mon, 12 Oct 2020 12:00:00 GMT</pubDate><News:Source>Branchenpresse</News:Source>
  </item></channel></rss>`);
  assert.equal(parsed[0].link, "https://publisher.example/news");
  assert.equal(parsed[0].publisher, "Branchenpresse");
  assert.equal(isRelevant("Claas eröffnet Werk", "CLAAS"), true);
  assert.equal(isRelevant("Schneider Drehteile erweitert", "Schneider Drehteile GmbH"), true);
  assert.equal(isRelevant("Schneider Electric erweitert", "Schneider Drehteile GmbH"), false);
  assert.equal(isRelevant("Claasen eröffnet Werk", "CLAAS"), false);
});

test("Search input is bounded and neutral or negated headlines are not green opportunities", () => {
  assert.throws(() => validateQuery(""));
  assert.throws(() => validateQuery("a".repeat(121)));
  assert.throws(() => validateQuery({ query: "CLAAS" }));
  assert.equal(validateQuery("  Müller & Sohn GmbH  "), "Müller & Sohn GmbH");
  assert.equal(classifyHeadline("CLAAS stellt einen Traktor vor").impact, "neutral");
  assert.equal(classifyHeadline("CLAAS plant keine Kurzarbeit").impact, "neutral");
  assert.equal(classifyHeadline("CLAAS meldet Kurzarbeit").impact, "risk");
  assert.equal(classifyHeadline("CLAAS investiert in neues Werk").impact, "opportunity");
});

test("Provider outage is reported without inventing external facts", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unavailable"); };
  try {
    const result = await searchCompany("Firmatest Ausfall QZ", [], true);
    assert.equal(result.status, "error");
    assert.equal(result.signals.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("Missing SAP configuration yields unavailable values, never demo revenue or a zero balance", async () => {
  const originalBase = process.env.SAP_ODATA_BASE_URL;
  delete process.env.SAP_ODATA_BASE_URL;
  try {
    const sales = await getVertriebZuKunde("10001");
    assert.equal(sales.status, "not_configured");
    assert.equal(sales.artikelImStamm, null);
    assert.deepEqual(sales.umsatzJeJahr, []);
    assert.deepEqual((await getKundenliste()).kunden, []);
  } finally {
    if (originalBase !== undefined) process.env.SAP_ODATA_BASE_URL = originalBase;
  }
});

test("SAP canonical projection handles OData collections and rejects invalid data or ambiguous customers", () => {
  const sales = normalizeSales({
    umsatzJeJahr: { results: [{ jahr: 2025, umsatz: "8200000" }, { jahr: 2024, umsatz: null }] },
    produktgruppenMix: [{ name: "Filtertechnik", prozent: 60 }, { name: "Sensorik", prozent: 40 }],
    historie: [{ datum: "2025-12-20", bestellungen: 12 }],
    artikelImStamm: 1007,
  });
  assert.equal(sales.status, "connected");
  assert.deepEqual(sales.umsatzJeJahr, [{ jahr: 2025, umsatz: 8200000 }]);
  assert.equal(sales.artikelImStamm, 1007);
  assert.equal(normalizeSales({ somethingElse: "wrong schema" }).status, "error");
  assert.equal(normalizeSales({ value: [{ artikelImStamm: 1 }, { artikelImStamm: 2 }] }).status, "error");
  assert.equal(normalizeSales({ produktgruppenMix: [{ name: "A", prozent: 60 }, { name: "B", prozent: 60 }] }).status, "error");
});

test("Configured SAP requests remain on the server and normalize a real endpoint response contract", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SAP_ODATA_BASE_URL", "SAP_ODATA_SALES_PATH", "SAP_BEARER_TOKEN"];
  const previous = keys.map((key) => process.env[key]);
  process.env.SAP_ODATA_BASE_URL = "https://sap.example.test/odata/";
  process.env.SAP_ODATA_SALES_PATH = "CustomerSales('{kundenNr}')";
  process.env.SAP_BEARER_TOKEN = "test-token";
  let requestUrl = "";
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.redirect, "error");
    return Response.json({ d: { umsatzJeJahr: [{ jahr: 2025, umsatz: 1234 }], artikelImStamm: 7 } });
  };
  try {
    const sales = await getVertriebZuKunde("10001");
    assert.equal(sales.status, "connected");
    assert.equal(sales.umsatzJeJahr[0].umsatz, 1234);
    assert.ok(requestUrl.includes("10001"));
    assert.ok(!JSON.stringify(sales).includes("test-token"));
    process.env.SAP_ODATA_SALES_PATH = "https://unrelated.example.test/{kundenNr}";
    assert.equal((await getVertriebZuKunde("10001")).status, "error");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => previous[index] === undefined ? delete process.env[key] : process.env[key] = previous[index]);
  }
});

test("Optional live smoke test retrieves actual public CLAAS headlines", { skip: process.env.LIVE_RESEARCH_TEST !== "1" }, async () => {
  const result = await searchCompany("CLAAS", [], true);
  assert.equal(result.status, "connected", result.message);
  assert.ok(result.signals.length > 0);
  assert.ok(result.signals.every((signal) => signal.origin === "live" && signal.source.url.startsWith("https://")));
  console.log(`Live research: ${result.provider}, ${result.signals.length} headlines; newest ${result.signals[0].date}.`);
});
