import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/index.mjs";

mkdirSync("tmp/desktop-portals-qa", { recursive: true });
const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
try {
  for (const [surface, role] of [
    ["clients", "client"],
    ["clients", "driver"],
    ["workshop", "mechanic"],
    ["workshop", "warehouse"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/${surface}`);
    const frame = page.frameLocator(".portal-mobile-frame");
    await frame.locator(".login-form").waitFor();
    assert.equal(await page.locator(".device-gate").count(), 0);
    await page.screenshot({
      path: `tmp/desktop-portals-qa/${surface}-login.png`,
    });
    const login = await context.request.post(`${origin}/api/demo`, {
      headers: { "X-DOARDS-App": surface },
      data: { role },
    });
    assert.ok(login.ok());
    await page.reload();
    await frame.locator(".portal-app main").waitFor();
    const nav = frame.locator(".portal-bottom-nav");
    for (const width of [1101, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await page.locator(".portal-mobile-frame").boundingBox();
      assert.equal(box.width, 480);
      assert.equal(box.height, 900);
      assert.equal(box.x, (width - 480) / 2);
      assert.ok((await nav.boundingBox()).x >= box.x);
      assert.ok((await nav.boundingBox()).y < 900);
      assert.equal(
        await frame
          .locator("html")
          .evaluate((el) => el.scrollWidth > window.innerWidth),
        false,
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: `tmp/desktop-portals-qa/${surface}-${role}.png`,
    });
    for (let i = 0; i < (await nav.locator("button").count()); i++) {
      await nav.locator("button").nth(i).click();
      assert.equal(
        await frame
          .locator("html")
          .evaluate((el) => el.scrollWidth > window.innerWidth),
        false,
      );
    }
    if (role === "mechanic") {
      await nav.locator("button").nth(1).click();
      await frame.locator(".page-heading .button.primary").click();
      const dialog = frame.getByRole("dialog");
      await dialog.waitFor();
      assert.ok((await dialog.boundingBox()).width <= 480);
      await page.screenshot({
        path: "tmp/desktop-portals-qa/workshop-dialog.png",
      });
      await page.keyboard.press("Escape");
    }
    for (const width of [1100, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator(".portal-app main").waitFor();
      assert.equal(await page.locator("iframe").count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await frame.locator(".portal-app main").waitFor();
    await frame.locator(".portal-account").click();
    for (const link of await frame.locator(".app-switcher a").all()) {
      assert.equal(await link.getAttribute("target"), "_top");
    }
    await context.close();
    console.log(
      `${surface}/${role}: desktop login, navigation, centered mobile layout and resizing passed`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}
