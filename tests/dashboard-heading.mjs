import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createApp } from "../server/index.mjs";

mkdirSync("tmp/dashboard-heading-qa", { recursive: true });
const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext();
  await context.request.post(`${origin}/api/demo`, {
    headers: { "X-DOARDS-App": "board" },
    data: { role: "admin" },
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator(".dashboard-heading").waitFor();
  assert.match(
    await page.locator(".dashboard-heading h1").innerText(),
    /Admir/,
  );
  for (const lang of ["bs", "de", "en"]) {
    await page.locator(".language-select select").selectOption(lang);
    for (const width of [320, 390, 440, 760, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const iconOffsets = await page
        .locator(".stat-top svg")
        .evaluateAll((icons) =>
          icons.map((icon) => {
            const card = icon.closest(".stat");
            const style = getComputedStyle(card);
            return (
              card.getBoundingClientRect().right -
              parseFloat(style.borderRightWidth) -
              parseFloat(style.paddingRight) -
              icon.getBoundingClientRect().right
            );
          }),
        );
      assert.ok(iconOffsets.length >= 2);
      assert.ok(
        iconOffsets.every((offset) => Math.abs(offset) < 1),
        JSON.stringify({ lang, width, iconOffsets }),
      );
      const select = page.locator(".dashboard-period select");
      for (const period of ["month", "year", "allTime"]) {
        await select.selectOption(period);
        const metrics = await page
          .locator(".dashboard-heading")
          .evaluate((heading) => {
            const select = heading.querySelector("select");
            const a = select.getBoundingClientRect();
            const b = heading
              .querySelector(".button.primary")
              .getBoundingClientRect();
            const h = heading.getBoundingClientRect();
            const style = getComputedStyle(select);
            const button = heading.querySelector(".button.primary");
            const text = [...button.childNodes].find(
              (node) =>
                node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
            );
            const range = document.createRange();
            range.selectNodeContents(text);
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            ctx.font = style.font;
            return {
              widthDiff: a.width - b.width,
              heightDiff: a.height - b.height,
              compact:
                b.height ===
                parseFloat(
                  getComputedStyle(button).getPropertyValue("--control-height"),
                ),
              singleLine: range.getClientRects().length === 1,
              buttonFits: button.scrollWidth <= button.clientWidth,
              topDiff: a.top - b.top,
              left: a.left - h.left,
              right: b.right - h.right,
              align: style.textAlignLast,
              textFits:
                ctx.measureText(select.selectedOptions[0].text).width <=
                select.clientWidth -
                  parseFloat(style.paddingLeft) -
                  parseFloat(style.paddingRight),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
        assert.ok(
          Math.abs(metrics.widthDiff) < 1,
          JSON.stringify({ lang, width, period, metrics }),
        );
        assert.ok(Math.abs(metrics.heightDiff) < 1);
        assert.ok(
          metrics.compact && metrics.singleLine && metrics.buttonFits,
          JSON.stringify({ lang, width, period, metrics }),
        );
        assert.ok(Math.abs(metrics.topDiff) < 1);
        assert.equal(metrics.align, "center");
        assert.ok(
          metrics.textFits,
          JSON.stringify({ lang, width, period, metrics }),
        );
        assert.equal(metrics.overflow, false);
        if (width <= 760) {
          assert.ok(Math.abs(metrics.left) < 1);
          assert.ok(Math.abs(metrics.right) < 1);
        }
      }
      await select.selectOption("month");
      await page.screenshot({
        path: `tmp/dashboard-heading-qa/${lang}-${width}.png`,
      });
    }
  }
  await page.locator(".dashboard-heading .button.primary").click();
  await page.getByRole("dialog").waitFor();
  console.log(
    "Dashboard: Admir greeting; equal controls; centered period text; mobile edge alignment; all 3 languages and 6 widths passed.",
  );
} finally {
  await browser.close();
  await app.close();
}
