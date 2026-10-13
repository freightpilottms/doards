import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("tmp", { recursive: true });
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";
const app = await createApp({ demo: true, dbPath: ":memory:" });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" }),
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  geolocation: { latitude: 48.2082, longitude: 16.3738, accuracy: 15 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const go = async (name) =>
  page
    .locator(".sidebar nav")
    .getByRole("button", { name, exact: true })
    .click();
const button = (name) => page.getByRole("button", { name, exact: true });
const dialog = () => page.getByRole("dialog");
const fieldName = (name) =>
  new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?: \\*)?$");
const fill = async (name, value) =>
  dialog().getByLabel(fieldName(name)).fill(String(value));
const select = async (name, value) =>
  dialog().getByLabel(fieldName(name)).selectOption(value);
const save = async () => {
  await dialog().getByRole("button", { name: "Save", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
};
const state = async () =>
  await (await ctx.request.get(origin + "/api/state")).json();
const command = async (action, payload) => {
  const res = await ctx.request.post(origin + "/api/action", {
    data: { action, payload },
  });
  assert.equal(res.status(), 200, await res.text());
  return res.json();
};
async function sign() {
  const canvas = dialog().locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + 35, b.y + 55);
  await page.mouse.down();
  await page.mouse.move(b.x + 85, b.y + 30);
  await page.mouse.move(b.x + 130, b.y + 90);
  await page.mouse.move(b.x + 220, b.y + 50);
  await page.mouse.up();
}
try {
  await page.goto(origin);
  await page.locator(".language-select select").selectOption("bs");
  await button("Otvori demo").click();
  await page.getByRole("heading", { name: "Dobar dan, Admir." }).waitFor();
  await page.locator(".language-select select").selectOption("en");
  await command("settings.save", {
    name: "QA S&S",
    address: "Teststraße 1, Wien",
    taxId: "DEMO-UID",
    email: "qa@example.com",
    iban: "DEMO",
    tax: 20,
    terms: "Test terms",
    invoicePrefix: "QA",
  });
  await go("Fleet");
  await button("New vehicle").click();
  for (const [key, value] of [
    ["Make", "QA"],
    ["Model", "Integration"],
    ["Year", 2025],
    ["Plate", "QA-123"],
    ["VIN / chassis number", "WBA12345678901234"],
    ["Odometer", 1000],
    ["Daily rate (net)", 70],
    ["Location", "Wien"],
    ["Roadworthiness inspection", "2027-12-01"],
    ["Insurance expiry", "2027-12-01"],
  ])
    await fill(key, value);
  await save();
  console.log("vehicle create ok");
  await page.getByRole("button", { name: /QA Integration/ }).click();
  await page
    .locator(".photo-actions input[type=file]")
    .setInputFiles("public/vehicle-bmw.jpg");
  await page.locator(".photo-inner>img").waitFor();
  await button("Mark damage").click();
  await page.locator(".photo-inner").click({ position: { x: 170, y: 170 } });
  await fill("Description", "QA marked damage");
  await save();
  await page.locator(".damage-pin").waitFor();
  console.log("photo upload, protected media and damage marker ok");
  const vehicle = (await state()).vehicles.find((v) => v.plate === "QA-123");
  assert(vehicle.photos.front.startsWith("/api/media/"));
  await button("New rental").click();
  await dialog().getByRole("button", { name: "Next", exact: true }).click();
  await select("Customer", "K-001");
  await select("Driver", "demo-driver");
  await dialog().getByRole("button", { name: "Next", exact: true }).click();
  await dialog().getByRole("button", { name: "Next", exact: true }).click();
  await dialog().getByRole("button", { name: "Next", exact: true }).click();
  await dialog().getByRole("button", { name: "Create", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  let rental = (await state()).rentals.find((r) => r.vehicleId === vehicle.id);
  assert.equal(rental.total, 210);
  await go("Rentals");
  await button(rental.id).click();
  await button("Vehicle handover").click();
  await dialog().getByRole("checkbox").check();
  for (const sel of await dialog().locator(".checklist select").all())
    await sel.selectOption("pass");
  await sign();
  await dialog().getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(
    (await state()).rentals.find((r) => r.id === rental.id).handoverDamages
      .length,
    1,
  );
  console.log("rental wizard, signature and inherited damage ok");
  await button(rental.id).click();
  await button("Vehicle return").click();
  await fill("Odometer", 1700);
  await fill("Cleaning", 20);
  await dialog().getByRole("checkbox").check();
  for (const sel of await dialog().locator(".checklist select").all())
    await sel.selectOption("pass");
  await sign();
  await dialog().getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  rental = (await state()).rentals.find((r) => r.id === rental.id);
  assert.equal(rental.total, 260);
  assert.equal(rental.extraKm, 100);
  await button(rental.id).click();
  await button("New invoice").click();
  await save();
  const invoice = (await state()).invoices.find(
    (i) => i.rentalId === rental.id,
  );
  assert.equal(invoice.gross, 312);
  await go("Invoices");
  await button(invoice.number).click();
  await button("Record payment").click();
  await save();
  assert.equal((await state()).invoices.find(i=>i.id===invoice.id).status, "paid");
  console.log("return charges, invoice VAT and payment ok");
  await button(invoice.number).click();
  await button("Print / PDF").click();
  await page.screenshot({ path: "tmp/invoice-preview.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "tmp/qa-invoice.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  await go("Workshop");
  await button("New work order").click();
  await select("Vehicle", vehicle.id);
  await fill("Description", "QA service");
  await save();
  const order = (await state()).workOrders.find(
    (w) => w.vehicleId === vehicle.id,
  );
  await button(order.id).click();
  await button("Issue part").click();
  await select("Part", "ART-002");
  await fill("Quantity", 1);
  await save();
  assert.equal(
    (await state()).articles.find((a) => a.id === "ART-002").stock,
    2,
  );
  await button(order.id).click();
  await button("Add work time").click();
  await fill("Work hours", 2);
  await save();
  await button(order.id).click();
  await button("Complete work order").click();
  await page
    .getByRole("dialog")
    .getByText("Completed", { exact: true })
    .waitFor();
  assert.equal(
    (await state()).costs.find((c) => c.workOrderId === order.id).net,
    91,
  );
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  console.log("workshop, stock, time and costs ok");
  await go("Locations");
  await page.getByLabel("Vehicle", { exact: true }).selectOption(vehicle.id);
  await page.getByRole("checkbox").check();
  await button("Share location").click();
  await page.getByText("48.208200, 16.373800", { exact: true }).waitFor();
  await button("Stop sharing").click();
  assert((await state()).locations.some((l) => l.vehicleId === vehicle.id));
  console.log("consent-based phone GPS ok");
  for (const language of ["de", "bs", "en"]) {
    await page.locator(".language-select select").selectOption(language);
    await page.screenshot({
      path: `tmp/locations-${language}.png`,
      fullPage: true,
    });
  }
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
    "Users & permissions",
    "Settings",
  ]) {
    await go(name);
    assert.equal(await page.locator("main").count(), 1);
  }
  await go("Overview");
  await page.screenshot({ path: "tmp/qa-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "tmp/qa-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await ctx.request.post(origin + "/api/logout", { data: {} });
  await ctx.request.post(origin + "/api/demo", { data: { role: "driver" } });
  await page.goto(origin+'/clients');
  await page.locator(".language-select select").selectOption("en");
  await page.getByRole("heading", { name: /Hello, Amir/ }).waitFor();
  let driverState = await state();
  assert.deepEqual(
    driverState.vehicles.map((v) => v.id),
    ["V-002"],
  );
  assert.equal(driverState.invoices.length, 0);
  assert.equal(
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: "Invoices", exact: true })
      .count(),
    0,
  );
  const denied = await ctx.request.post(origin + "/api/action", {
    data: {
      action: "location.report",
      payload: {
        vehicleId: vehicle.id,
        latitude: 1,
        longitude: 1,
        accuracy: 1,
      },
    },
  });
  assert.equal(denied.status(), 403);
  await page.screenshot({ path: "tmp/driver-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "all screens, 3 languages, mobile overflow and driver isolation ok",
  );
} catch (error) {
  await page.screenshot({ path: "tmp/e2e-failure.png", fullPage: true });
  console.error("E2E FAILURE", error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await app.close();
}
