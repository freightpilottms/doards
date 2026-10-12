import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/index.mjs";
mkdirSync("tmp/portal-qa", { recursive: true });
const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" }),
});
const errors = [];
const contexts = [];
async function context(role, surface, width = 390) {
  const c = await browser.newContext({ viewport: { width, height: 900 } });
  contexts.push(c);
  await c.addInitScript(() => localStorage.setItem("doards:language", "en"));
  const login = await c.request.post(origin + "/api/demo", {
    headers: { "X-DOARDS-App": surface },
    data: { role },
  });
  assert.equal(login.status(), 200);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.stack || e.message));
  p.setDefaultTimeout(10000);
  await p.goto(origin + (surface === "board" ? "/" : "/" + surface));
  await p.locator("main").waitFor();
  return { c, p, surface };
}
const command = async (ctx, action, payload) => {
  const r = await ctx.c.request.post(origin + "/api/action", {
    headers: { "X-DOARDS-App": ctx.surface },
    data: { action, payload },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
const state = async (ctx) =>
  (
    await ctx.c.request.get(origin + "/api/state", {
      headers: { "X-DOARDS-App": ctx.surface },
    })
  ).json();
const overflow = async (p) =>
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
async function shot(p, name) {
  await overflow(p);
  await p.screenshot({ path: `tmp/portal-qa/${name}.png`, fullPage: true });
}
try {
  const board = await context("admin", "board", 1440),
    client = await context("client", "clients"),
    workshop = await context("mechanic", "workshop", 820),
    warehouse = await context("warehouse", "workshop");
  await shot(client.p, "client-home");
  await client.p
    .getByRole("button", { name: "Report damage", exact: true })
    .first()
    .click();
  await client.p
    .getByRole("dialog")
    .getByLabel("Description", { exact: false })
    .fill("Mobile damage report QA");
  await client.p
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await client.p.getByRole("dialog").waitFor({ state: "hidden" });
  assert(
    (await state(board)).damages.some(
      (d) => d.description === "Mobile damage report QA",
    ),
  );
  await shot(workshop.p, "workshop-tablet");
  await shot(warehouse.p, "warehouse-home");
  await board.p
    .locator(".sidebar nav")
    .getByRole("button", { name: "Messages", exact: true })
    .click();
  await client.p
    .locator(".portal-bottom-nav")
    .getByRole("button", { name: "Messages", exact: true })
    .click();
  await client.p
    .locator(".chat-thread")
    .filter({ hasText: "W-CD 9012" })
    .click();
  await board.p
    .locator(".chat-thread")
    .filter({ hasText: "W-CD 9012" })
    .click();
  await client.p
    .getByLabel("Message", { exact: true })
    .fill("Client to board live QA");
  await client.p.getByRole("button", { name: "Send", exact: true }).click();
  await board.p
    .locator(".chat-messages")
    .getByText("Client to board live QA", { exact: true })
    .waitFor();
  await board.p
    .getByLabel("Message", { exact: true })
    .fill("Board to client live QA");
  await board.p.getByRole("button", { name: "Send", exact: true }).click();
  await client.p
    .locator(".chat-messages")
    .getByText("Board to client live QA", { exact: true })
    .waitFor();
  await client.p.locator("input[type=file]").setInputFiles({
    name: "test-note.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nQA"),
  });
  await client.p.getByRole("button", { name: "Send", exact: true }).click();
  await board.p.getByRole("link", { name: "test-note.pdf" }).waitFor();
  await shot(client.p, "client-chat");
  await shot(board.p, "board-chat");
  await board.p
    .locator(".segmented")
    .getByRole("button", { name: "Workshop & inventory", exact: true })
    .click();
  await board.p
    .locator(".chat-thread")
    .filter({ hasText: "W-XY 5678" })
    .click();
  await workshop.p
    .locator(".portal-bottom-nav")
    .getByRole("button", { name: "Messages", exact: true })
    .click();
  await workshop.p
    .locator(".chat-thread")
    .filter({ hasText: "W-XY 5678" })
    .click();
  await workshop.p
    .getByLabel("Message", { exact: true })
    .fill("Workshop to board live QA");
  await workshop.p.getByRole("button", { name: "Send", exact: true }).click();
  await board.p
    .locator(".chat-messages")
    .getByText("Workshop to board live QA", { exact: true })
    .waitFor();
  assert(
    !(await state(client)).messages.some(
      (m) => m.body === "Workshop to board live QA",
    ),
  );
  await client.p
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await client.p
    .getByRole("heading", { name: "Notifications", exact: true })
    .waitFor();
  await client.p.getByRole("button", { name: "Mark all read" }).click();
  await client.p.getByRole("button", { name: "Mark all read" }).waitFor();
  assert((await state(client)).notifications.every((n) => n.read));
  await shot(client.p, "client-notifications");
  await warehouse.p
    .locator(".portal-bottom-nav")
    .getByRole("button", { name: "Workshop", exact: true })
    .click();
  await warehouse.p
    .getByRole("button", { name: "WA-001", exact: true })
    .click();
  assert.equal(
    await warehouse.p
      .getByRole("button", { name: "Add work time", exact: true })
      .count(),
    0,
  );
  await warehouse.p
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await warehouse.p
    .locator(".portal-bottom-nav")
    .getByRole("button", { name: "Parts & inventory", exact: true })
    .click();
  await warehouse.p
    .getByRole("button", { name: "Stock movement", exact: true })
    .first()
    .click();
  await warehouse.p
    .getByRole("dialog")
    .getByLabel("Reason", { exact: false })
    .fill("QA stock count");
  await warehouse.p
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await warehouse.p.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await state(board)).articles.find((a) => a.id === "ART-001").stock,
    43,
  );
  await shot(warehouse.p, "warehouse-inventory");
  const mechanic = (await state(board)).users.find(
    (u) => u.id === "demo-mechanic",
  );
  await command(board, "user.update", {
    ...mechanic,
    access: {
      ...mechanic.access,
      articles: { view: true, edit: false, create: false },
    },
  });
  await workshop.c.request.post(origin + "/api/demo", {
    headers: { "X-DOARDS-App": "workshop" },
    data: { role: "mechanic" },
  });
  await workshop.p.reload();
  await workshop.p.locator("main").waitFor();
  await workshop.p
    .locator(".portal-bottom-nav")
    .getByRole("button", { name: "Parts & inventory", exact: true })
    .click();
  assert.equal(
    await workshop.p
      .getByRole("button", { name: "Stock movement", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await workshop.p
      .getByRole("button", { name: "New part", exact: true })
      .count(),
    0,
  );
  const blocked = await workshop.c.request.post(origin + "/api/action", {
    headers: { "X-DOARDS-App": "workshop" },
    data: {
      action: "stock.move",
      payload: {
        articleId: "ART-001",
        quantity: 1,
        type: "inventory",
        reason: "denied",
      },
    },
  });
  assert.equal(blocked.status(), 403);
  await workshop.p.goto(origin + "/clients");
  await workshop.p.getByRole("heading", { name: "Hello, Adnan." }).waitFor();
  assert.deepEqual(
    (
      await (
        await workshop.c.request.get(origin + "/api/state", {
          headers: { "X-DOARDS-App": "clients" },
        })
      ).json()
    ).vehicles.map((v) => v.id),
    ["DEMO-CLIENT-V1", "DEMO-CLIENT-V2", "V-002"],
  );
  await workshop.p.setViewportSize({ width: 1440, height: 900 });
  await workshop.p
    .getByText(
      "This app is available on phones and tablets. Open this address on your device.",
    )
    .waitFor();
  assert.equal(await workshop.p.locator("main").count(), 0);
  await shot(workshop.p, "desktop-gate");
  for (const name of [
    "Overview",
    "Fleet",
    "Rentals",
    "Customers",
    "Damage",
    "Service & maintenance",
    "Repairs",
    "Workshop",
    "Parts & inventory",
    "Purchasing",
    "Invoices",
    "Payments & deposits",
    "Costs",
    "Reports",
    "Documents",
    "Calendar & tasks",
    "Messages",
    "Locations",
    "Notifications",
    "Users & permissions",
    "Settings",
  ]) {
    await board.p
      .locator(".sidebar nav")
      .getByRole("button", { name, exact: true })
      .click();
    if (name === "Locations")
      await board.p.waitForFunction(
        () => {
          const imgs = Array.from(document.querySelectorAll(".leaflet-tile"));
          return (
            imgs.length > 0 &&
            imgs.every((img) => img.complete && img.naturalWidth > 0)
          );
        },
        {},
        { timeout: 25000 },
      );
    if (name === "Costs")
      for (const input of await board.p
        .locator(".filters input[type=date]")
        .all())
        assert((await input.boundingBox()).width >= 120);
    await shot(board.p, "board-" + name.replace(/\W+/g, "-"));
  }
  for (const width of [320, 390, 820]) {
    await client.p.setViewportSize({ width, height: 900 });
    for (const name of ["Home", "Documents", "Locations", "Messages"]) {
      await client.p
        .locator(".portal-bottom-nav")
        .getByRole("button", { name, exact: true })
        .click();
      await shot(client.p, `client-${name}-${width}`);
    }
    await warehouse.p.setViewportSize({ width, height: 900 });
    for (const name of ["Home", "Workshop", "Parts & inventory", "Messages"]) {
      await warehouse.p
        .locator(".portal-bottom-nav")
        .getByRole("button", { name, exact: true })
        .click();
      await shot(
        warehouse.p,
        `warehouse-${name.replace(/\W+/g, "-")}-${width}`,
      );
    }
  }
  for (const lang of ["bs", "de", "en"]) {
    await client.p.locator(".language-select select").selectOption(lang);
    for (const width of [320, 390, 820]) {
      await client.p.setViewportSize({ width, height: 900 });
      assert(await client.p.locator(".notification-button").isVisible());
      await shot(client.p, `client-${lang}-${width}`);
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live cross-app chat + attachments, private channels, notifications, independent permissions, dual access, desktop gate, 21 board screens and 3 languages at 320/390/820px",
  );
} catch (e) {
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({ path: `tmp/portal-qa/failure-${i}.png`, fullPage: true })
      .catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await app.close();
}
