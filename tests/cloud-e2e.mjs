import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { migrate } from "../server/postgres.mjs";
import { provision } from "../server/migrate-supabase.mjs";
import { createCloudHandler } from "../server/cloud-server.mjs";
import { createApp } from "../server/index.mjs";

mkdirSync("tmp/cloud-qa", { recursive: true });
const db = new PGlite();
const query = (sql, params) =>
  !params?.length && sql.includes("CREATE SCHEMA")
    ? db.exec(sql).then((r) => r.at(-1))
    : db.query(sql, params);
let tail = Promise.resolve();
const pool = {
  query,
  connect: async () => {
    const old = tail;
    let release;
    tail = new Promise((r) => (release = r));
    await old;
    return { query, release };
  },
};
const env = {
  DOARDS_ADMIN_EMAIL: "owner@example.com",
  DOARDS_ADMIN_PASSWORD: "Local-test-owner-123",
  DOARDS_DEMO_PASSWORD: "Local-test-demo-456",
  DOARDS_PRESENTATION: "1",
};
await migrate(pool);
await provision(pool, { demo: true, env });
const staticApp = await createApp({
  dbPath: ":memory:",
  scheduler: false,
  initialize: false,
});
const handler = createCloudHandler({ pool, env });
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/api/")) return staticApp.handler(req, res);
  // Emulate Vercel's parsed Node request body instead of relying on a fresh stream.
  if (req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    req.body = JSON.parse(raw || "{}");
  }
  return handler(req, res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
try {
  for (const [role, surface, width] of [
    ["admin", "board", 1440],
    ["client", "clients", 390],
    ["mechanic", "workshop", 820],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + (surface === "board" ? "/" : "/" + surface));
    await page.locator(".language-select select").selectOption("en");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`${role}@doards.local`);
    await page
      .getByLabel("Password", { exact: true })
      .fill(env.DOARDS_DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.locator("main").waitFor();
    if (surface === "clients")
      await page.locator(".client-vehicle").nth(2).waitFor();
    await page.screenshot({
      path: `tmp/cloud-qa/${surface}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    const state = await (
      await context.request.get(origin + "/api/state", {
        headers: { "X-DOARDS-App": surface },
      })
    ).json();
    if (surface === "board") {
      assert.equal(state.vehicles.length, 21);
      assert.equal(state.invoices.length, 32);
      assert(
        state.invoices.some(
          (i) => i.date.slice(0, 7) === new Date().toISOString().slice(0, 7),
        ),
      );
    }
    if (surface === "clients") {
      assert.equal(state.vehicles.length, 3);
      await page
        .getByRole("button", { name: "Assigned driver", exact: true })
        .click();
      await page.getByRole("heading", { name: /Amir/ }).waitFor();
      assert.equal(await page.locator(".client-vehicle").count(), 1);
    }
    await page.reload();
    await page.locator("main").waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: PostgreSQL-backed cloud API, Vercel-parsed bodies, real login UI, desktop/mobile/tablet, presentation roles and persistent sessions.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await staticApp.close();
  await db.close();
}
