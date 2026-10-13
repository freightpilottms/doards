import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/index.mjs";

mkdirSync("tmp/branding-qa", { recursive: true });
const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  for (const [surface, role, width] of [
    ["board", "admin", 1440],
    ["clients", "client", 320],
    ["workshop", "mechanic", 820],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const login = await context.request.post(`${origin}/api/demo`, {
      headers: { "X-DOARDS-App": surface },
      data: { role },
    });
    assert.ok(login.ok());
    const page = await context.newPage();
    await page.goto(origin + (surface === "board" ? "/" : `/${surface}`));
    await page.locator(".app-footer").waitFor();
    await page.locator(".brand:visible img").first().evaluate(async (img) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      if (ctx.getImageData(0, 0, 1, 1).data[3] !== 0)
        throw new Error("Logo background is not transparent");
    });
    assert.match(await page.locator(".app-footer").innerText(), /AK Solutions \| ZEDA'S Group LTD/);
    assert.equal(await page.locator('.app-footer a[href="/credits.html"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator(".brand:visible").first().screenshot({ path: `tmp/branding-qa/${surface}-logo.png` });
    await page.locator(".app-footer").screenshot({ path: `tmp/branding-qa/${surface}-footer.png` });
    await context.close();
  }
  console.log("PASS: transparent logo, copyright and layout on desktop, mobile and tablet");
} finally {
  await browser?.close();
  await app.close();
}
