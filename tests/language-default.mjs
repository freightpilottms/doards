import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createApp } from "../server/index.mjs";

const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  for (const [surface, role] of [
    ["board", "admin"],
    ["clients", "client"],
    ["workshop", "mechanic"],
  ]) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      await context.addInitScript(() =>
        localStorage.setItem("doards:language", "bs"),
      );
      const page = await context.newPage();
      const content =
        surface !== "board" && width > 1100
          ? page.frameLocator(".portal-mobile-frame")
          : page;
      await page.goto(origin + (surface === "board" ? "/" : `/${surface}`));
      const language = content.locator(".language-select select");
      await language.waitFor();
      assert.equal(await language.inputValue(), "de");
      await language.selectOption("en");
      assert.equal(await content.locator("html").getAttribute("lang"), "en");
      await page.reload();
      await language.waitFor();
      assert.equal(await language.inputValue(), "de");
      await context.request.post(`${origin}/api/demo`, {
        headers: { "X-DOARDS-App": surface },
        data: { role },
      });
      await page.reload();
      await content.locator("main").waitFor();
      assert.equal(await language.inputValue(), "de");
      await language.selectOption("bs");
      assert.equal(await language.inputValue(), "bs");
      if (surface !== "board")
        await content.locator(".portal-bottom-nav button").nth(1).click();
      assert.equal(await language.inputValue(), "bs");
      await page.reload();
      await content.locator("main").waitFor();
      assert.equal(await language.inputValue(), "de");
      assert.equal(await content.locator("html").getAttribute("lang"), "de");
      await context.close();
      console.log(
        `${surface} ${width}: German default, manual switching and reload passed`,
      );
    }
  }
} finally {
  await browser.close();
  await app.close();
}
