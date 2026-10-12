import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/index.mjs";

mkdirSync("tmp/client-demo-qa", { recursive: true });
const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.addInitScript(() =>
  localStorage.setItem("doards:language", "de"),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const login = (role, surface) =>
  context.request.post(origin + "/api/demo", {
    headers: { "X-DOARDS-App": surface },
    data: { role },
  });
async function screenshot(name) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  assert.equal(
    await page
      .locator(".client-vehicle-photo img")
      .evaluateAll((images) =>
        images.every((im) => im.complete && im.naturalWidth > 0),
      ),
    true,
  );
  await page.screenshot({
    path: `tmp/client-demo-qa/${name}.png`,
    fullPage: true,
  });
}
try {
  await login("admin", "board");
  await login("client", "clients");
  await page.goto(origin + "/clients");
  await page.locator(".client-vehicle").nth(2).waitFor();
  assert.equal(await page.locator(".client-vehicle").count(), 3);
  assert.equal(await page.locator(".client-schedule-list > button").count(), 3);
  await page.locator(".client-fleet-filters .segmented button").nth(2).click();
  assert.equal(await page.locator(".client-vehicle").count(), 1);
  await page.locator(".client-fleet-filters .segmented button").first().click();
  await page
    .getByRole("textbox", { name: "Modell, Kennzeichen oder Vertrag" })
    .fill("BMW");
  assert.equal(await page.locator(".client-vehicle").count(), 1);
  await page
    .getByRole("textbox", { name: "Modell, Kennzeichen oder Vertrag" })
    .fill("no-match");
  assert.equal(await page.locator(".client-vehicle").count(), 0);
  await page
    .getByRole("textbox", { name: "Modell, Kennzeichen oder Vertrag" })
    .clear();
  await screenshot("client-mobile-de");
  await page.setViewportSize({ width: 820, height: 1024 });
  await screenshot("client-tablet-de");
  await page
    .getByRole("button", { name: "Zugewiesener Fahrer", exact: true })
    .click();
  await page.getByRole("heading", { name: /Amir/ }).waitFor();
  assert.equal(await page.locator(".client-vehicle").count(), 1);
  assert.equal(await page.locator(".portal-documents a").count(), 3);
  await page.setViewportSize({ width: 360, height: 800 });
  await screenshot("driver-mobile-de");
  await page.locator(".client-damage-link").click();
  await page.locator(".vehicle-detail, .vehicle-header").first().waitFor();
  await page.goto(origin + "/clients");
  for (const lang of ["en", "bs"]) {
    await page
      .locator(".language-select select, .language select")
      .selectOption(lang);
    await screenshot(`driver-mobile-${lang}`);
  }
  const board = await (
    await context.request.get(origin + "/api/state", {
      headers: { "X-DOARDS-App": "board" },
    })
  ).json();
  assert.equal(board.user.id, "demo-admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Tablet demo", exact: true }).click();
  const frame = page.frameLocator(".portal-demo-frame");
  await frame.locator(".client-vehicle").waitFor();
  await page.screenshot({
    path: "tmp/client-demo-qa/desktop-tablet-preview.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Client demo: mobile/tablet, three languages, search, reservation filter, roles, documents, board isolation and desktop preview passed.",
  );
} finally {
  await browser.close();
  await app.close();
}
