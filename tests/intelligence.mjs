import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/index.mjs";
mkdirSync("tmp/intelligence-qa", { recursive: true });
const app = await createApp({ demo: true, dbPath: ":memory:" });
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function login(role, surface, width) {
  const c = await browser.newContext({ viewport: { width, height: 900 } });
  await c.addInitScript(() => {
    localStorage.setItem("doards:language", "en");
    window.SpeechRecognition = class {
      start() {
        window.__speechLang = this.lang;
        this.onresult?.({
          results: [[{ transcript: "Which services are due soon?" }]],
        });
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    };
  });
  assert.equal(
    (
      await c.request.post(origin + "/api/demo", {
        headers: { "X-DOARDS-App": surface },
        data: { role },
      })
    ).status(),
    200,
  );
  const p = await c.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(origin + (surface === "board" ? "/" : "/" + surface));
  await p.locator("main h1").waitFor();
  return { c, p };
}
async function shot(p, name) {
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await p.screenshot({
    path: `tmp/intelligence-qa/${name}.png`,
    fullPage: true,
  });
}
try {
  const { p, c } = await login("admin", "board", 1440);
  await p.locator(".assistant-launch").click();
  await p
    .getByRole("button", { name: "Which services are due soon?", exact: true })
    .click();
  await p.getByRole("button", { name: "Send", exact: true }).click();
  await p.locator(".assistant-turn").waitFor();
  assert(
    (await p.locator(".assistant-answer").innerText()).includes("maintenance"),
  );
  await shot(p, "assistant-desktop");
  await p.getByLabel("I allow voice input;", { exact: false }).check();
  await p.getByRole("button", { name: "Voice input", exact: true }).click();
  assert.equal(
    await p.getByLabel("Your question", { exact: true }).inputValue(),
    "Which services are due soon?",
  );
  assert.equal(await p.evaluate(() => window.__speechLang), "en-US");
  assert.equal(await p.locator(".assistant-turn").count(), 1);
  await p
    .locator(".sidebar nav")
    .getByRole("button", { name: "Automation", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Pending monthly billing", exact: true })
    .waitFor();
  assert((await p.getByText("DEMO-MONTH-1", { exact: true }).count()) > 0);
  await shot(p, "automation-pending");
  await p.getByLabel("Automatically issue monthly invoices").check();
  await p.locator(".automation-errors").waitFor();
  assert((await p.locator(".automation-errors").innerText()).length > 10);
  app.store.put("settings", {
    ...app.store.get("settings", "company"),
    address: "QA address",
    taxId: "TEST-ONLY",
  });
  await c.request.post(origin + "/api/automation", {
    headers: { "X-DOARDS-App": "board" },
    data: { enabled: true },
  });
  await p
    .locator(".page-heading")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await p.waitForFunction(() => !document.querySelector(".automation-errors"));
  const invoices = app.store
    .all("invoices")
    .filter((i) => i.billingKind === "monthly");
  assert(invoices.length >= 2);
  await shot(p, "automation-issued");
  const client = await login("client", "clients", 320);
  await client.p.locator(".assistant-launch").click();
  await client.p.getByLabel("Your question").fill("Show all unpaid invoices");
  await client.p.getByRole("button", { name: "Send", exact: true }).click();
  await client.p
    .getByText("Financial data is unavailable for this role.", { exact: true })
    .waitFor();
  for (const lang of ["bs", "de", "en"]) {
    await client.p.locator(".language-select select").selectOption(lang);
    for (const width of [320, 390, 820]) {
      await client.p.setViewportSize({ width, height: 900 });
      await shot(client.p, `assistant-${lang}-${width}`);
    }
  }
  const w = await login("warehouse", "workshop", 390);
  await w.p.locator(".assistant-launch").click();
  await w.p
    .getByRole("button", { name: "Which parts are low in stock?", exact: true })
    .click();
  await w.p.getByRole("button", { name: "Send", exact: true }).click();
  await w.p.locator(".assistant-turn").waitFor();
  await shot(w.p, "warehouse-assistant");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: assistant queries, editable mocked voice transcript, scoped answers, monthly automation UI, missing-company block, 3 languages at 320/390/820px",
  );
} finally {
  await browser.close();
  await app.close();
}
