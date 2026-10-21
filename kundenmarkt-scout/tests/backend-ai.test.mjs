import test from "node:test";
import assert from "node:assert/strict";
import { generateBriefing, getAIStatus } from "../services/aiService.ts";

const company = {
  id: "external-company",
  name: "Belegtes Unternehmen",
  kundenNr: "NEVER-SEND-PRIVATE-ID",
  revenue: { value: 123456789, year: 2025, source: { label: "Nicht Teil des Briefings", url: "https://example.org" } },
  analysisSummary: "OLD-PRIVATE-SUMMARY",
  verifiedAt: "2026-10-20",
  signals: [{
    id: "public-signal", type: "Investition", title: "Öffentliches Unternehmen erweitert sein Werk",
    summary: "Öffentliche Pressemeldung.", date: "2026-10-01", impact: "opportunity",
    priority: "mittel", origin: "verified", source: { label: "Unternehmenspresse", url: "https://example.org/presse" },
  }],
};

async function configured(run) {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_MODEL;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "unit-test-token";
  process.env.OPENAI_MODEL = "explicit-test-model";
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = oldModel;
  }
}

function complete(text) {
  return Response.json({
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    ],
  });
}

test("Optional AI requires both key and explicit model and performs no request otherwise", async () => {
  await configured(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("must not call"); };
    delete process.env.OPENAI_MODEL;
    assert.equal(getAIStatus().status, "not_configured");
    assert.equal((await generateBriefing(company)).method, "rules");
    process.env.OPENAI_MODEL = "explicit-test-model";
    delete process.env.OPENAI_API_KEY;
    assert.equal((await generateBriefing(company)).providerStatus.status, "not_configured");
    assert.equal(calls, 0);
  });
});

test("AI request includes only public source projection and parses assistant output beyond reasoning items", async () => {
  await configured(async () => {
    globalThis.fetch = async (url, request) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(request.headers.Authorization, "Bearer unit-test-token");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "explicit-test-model");
      assert.equal(body.store, false);
      assert.equal(request.redirect, "error");
      assert.ok(request.signal instanceof AbortSignal);
      const input = JSON.parse(body.input);
      assert.deepEqual(Object.keys(input), ["companyName", "publicSources"]);
      assert.equal(input.publicSources[0].number, 1);
      assert.ok(!request.body.includes("NEVER-SEND-PRIVATE-ID"));
      assert.ok(!request.body.includes("OLD-PRIVATE-SUMMARY"));
      assert.ok(!request.body.includes("123456789"));
      return complete("Gesprächseinstieg: Den Werksausbau als möglichen Anlass für einen Technikdialog ansprechen [1].");
    };
    const result = await generateBriefing(company);
    assert.equal(result.method, "ai");
    assert.match(result.summary, /^KI-Interpretation/);
    assert.equal(result.providerStatus.status, "connected");
    assert.ok(!JSON.stringify(result).includes("unit-test-token"));
  });
});

test("AI output with unsupported source references, numbers or incomplete status falls back to rules", async () => {
  await configured(async () => {
    for (const invalid of [
      "Das Unternehmen hat einen Umsatz von 999 Millionen Euro [1].",
      "Gesprächseinstieg: Über eine neue Technologie sprechen [20].",
      "Die Firma ist eindeutig gesund und erfolgreich.",
    ]) {
      globalThis.fetch = async () => complete(invalid);
      const result = await generateBriefing(company);
      assert.equal(result.method, "rules");
      assert.equal(result.providerStatus.status, "error");
    }
    globalThis.fetch = async () => Response.json({ status: "incomplete", output: [] });
    assert.equal((await generateBriefing(company)).method, "rules");
  });
});

test("AI HTTP failures and timeout keep the dossier usable without exposing provider errors", async () => {
  await configured(async () => {
    globalThis.fetch = async () => new Response("sensitive provider error unit-test-token", { status: 429 });
    const rejected = await generateBriefing(company);
    assert.equal(rejected.method, "rules");
    assert.ok(!JSON.stringify(rejected).includes("unit-test-token"));
    globalThis.fetch = async () => { throw new DOMException("Timed out", "TimeoutError"); };
    const timedOut = await generateBriefing(company);
    assert.equal(timedOut.method, "rules");
    assert.equal(timedOut.providerStatus.status, "error");
  });
});

test("No source evidence means no AI request, even if configured", async () => {
  await configured(async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error("must not call"); };
    const result = await generateBriefing({ ...company, signals: [] });
    assert.equal(result.method, "rules");
    assert.equal(result.providerStatus.status, "empty");
    assert.equal(called, false);
  });
});
