import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";

const root = "tmp/layout-qa";
mkdirSync(root, { recursive: true });
const app = await createApp({ dbPath: ":memory:", demo: true });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const results = [],
  errors = [];
let browser;
async function inspect(page, name, screenshot = false) {
  const issues = await page.evaluate(() => {
    const problems = [];
    const visible = (el) =>
      el.getClientRects().length &&
      getComputedStyle(el).visibility !== "hidden";
    const describe = (el) =>
      `${el.tagName}.${el.className}: ${(el.innerText || el.getAttribute("aria-label") || "").slice(0, 65)}`;
    if (document.documentElement.scrollWidth > innerWidth + 1)
      problems.push("page overflow");
    if (innerWidth <= 1100) {
      for (const filters of document.querySelectorAll(".filters")) {
        const dates = [...filters.querySelectorAll('input[type="date"]')];
        if (
          dates.length === 2 &&
          Math.abs(
            dates[0].getBoundingClientRect().top -
              dates[1].getBoundingClientRect().top,
          ) > 1
        )
          problems.push("date range filters split across rows");
      }
    }
    // Actions should only wrap when the title and controls cannot fit together.
    for (const heading of document.querySelectorAll(
      ".page-heading, .collection-heading",
    )) {
      const title = heading.firstElementChild;
      const actions = heading.querySelector(
        ":scope > .actions, :scope > .heading-actions",
      );
      if (!title || !actions || title === actions || !visible(actions))
        continue;
      const controls = [...actions.children].filter(visible);
      if (!controls.length) continue;
      const a = title.getBoundingClientRect();
      const b = actions.getBoundingClientRect();
      const controlsWidth =
        controls.reduce(
          (sum, el) => sum + el.getBoundingClientRect().width,
          0,
        ) +
        Math.max(0, controls.length - 1) *
          (parseFloat(getComputedStyle(actions).columnGap) || 0);
      const needed =
        a.width +
        controlsWidth +
        (parseFloat(getComputedStyle(heading).columnGap) || 0);
      if (needed <= heading.clientWidth - 1 && b.top >= a.bottom)
        problems.push(`unnecessary header wrapping ${describe(title)}`);
      if (
        Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) &&
        Math.abs((a.top + a.bottom - b.top - b.bottom) / 2) > 2
      )
        problems.push(`header vertical alignment ${describe(title)}`);
      if (
        innerWidth === 390 &&
        document.documentElement.lang === "bs" &&
        title.textContent.includes("Radionica") &&
        b.top >= a.bottom
      )
        problems.push("workshop title and actions must share a row at 390px");
    }
    for (const el of document.querySelectorAll(
      ".button, .segmented button, .section-head h2, .page-heading h1, .portal-bottom-nav button",
    )) {
      if (!visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 2)
        problems.push(`text overflow ${describe(el)}`);
    }
    for (const cell of document.querySelectorAll(".vehicle-cell")) {
      if (cell.getBoundingClientRect().height > 100)
        problems.push("collapsed vehicle column");
    }
    for (const group of document.querySelectorAll(
      ".actions, .heading-actions, .form-footer",
    )) {
      const controls = [...group.children].filter(
        (el) => visible(el) && el.matches(".button, .icon-button, select"),
      );
      for (let i = 0; i < controls.length; i++)
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i].getBoundingClientRect(),
            b = controls[j].getBoundingClientRect();
          if (
            Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) &&
            Math.abs((a.top + a.bottom - b.top - b.bottom) / 2) > 2
          )
            problems.push(`vertical alignment ${group.className}`);
        }
    }
    for (const group of document.querySelectorAll(
      ".page-heading, .section-head, .heading-actions, .actions, .filters, .form-footer, .form-grid, .work-order-meta, .topbar, .topbar-right, .vehicle-header, .portal-summary",
    )) {
      if (!visible(group)) continue;
      const children = [...group.children].filter(
        (el) =>
          visible(el) &&
          getComputedStyle(el).position !== "absolute" &&
          getComputedStyle(el).position !== "fixed",
      );
      for (let i = 0; i < children.length; i++)
        for (let j = i + 1; j < children.length; j++) {
          const a = children[i].getBoundingClientRect(),
            b = children[j].getBoundingClientRect();
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
          )
            problems.push(
              `overlap ${group.className}: ${describe(children[i])} / ${describe(children[j])}`,
            );
        }
    }
    return problems;
  });
  results.push({ name, issues });
  if (screenshot || issues.length)
    await page.screenshot({ path: `${root}/${name}.png`, fullPage: false });
}
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  for (const [surface, role] of [
    ["board", "admin"],
    ["clients", "client"],
    ["workshop", "mechanic"],
    ["workshop", "warehouse"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const login = await context.request.post(`${origin}/api/demo`, {
      headers: { "X-DOARDS-App": surface },
      data: { role },
    });
    assert.ok(login.ok());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    for (const lang of ["de", "bs", "en"]) {
      for (const width of surface === "board"
        ? [1440, 1280, 820, 768, 440, 390, 320]
        : [1024, 820, 440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + (surface === "board" ? "/" : `/${surface}`));
        await page.locator("main").waitFor();
        await page.locator(".language-select select").selectOption(lang);
        const nav = page.locator(
          surface === "board"
            ? ".sidebar nav button"
            : ".portal-bottom-nav button",
        );
        const count = await nav.count();
        for (let i = 0; i < count; i++) {
          if (surface === "board" && width <= 760)
            await page.locator(".mobile-menu button").click();
          await nav.nth(i).click();
          if (surface === "board" && i === 19)
            await page.locator(".automation-summary").waitFor();
          if (surface === "board" && width <= 760)
            await page.waitForFunction(
              () =>
                document.querySelector(".sidebar").getBoundingClientRect()
                  .right <= 0,
            );
          await inspect(
            page,
            `${surface}-${role}-${lang}-${width}-${i}`,
            (lang === "de" && [1440, 390, 820].includes(width)) ||
              (lang === "bs" && [390, 440].includes(width)),
          );
          if (
            surface === "board" &&
            lang === "de" &&
            [1440, 390, 320].includes(width)
          ) {
            const add = page
              .locator("main .page-heading .button.primary")
              .first();
            if (await add.count()) {
              await add.click();
              const modal = page.getByRole("dialog");
              if (await modal.count()) {
                await inspect(page, `form-${width}-${i}`, true);
                await modal
                  .locator(".form-footer")
                  .scrollIntoViewIfNeeded()
                  .catch(() => {});
                await inspect(page, `form-footer-${width}-${i}`, true);
                await page.keyboard.press("Escape");
                await modal.waitFor({ state: "hidden" });
              }
            }
            if (i === 1) {
              await page.locator(".vehicle-cell").first().click();
              const tabs = page.locator("main .tabs button");
              for (let tab = 0; tab < (await tabs.count()); tab++) {
                await tabs.nth(tab).click();
                await inspect(page, `vehicle-${width}-${tab}`, true);
              }
            }
          }
        }
        console.log(`${surface} ${role} ${lang} ${width}`);
        writeFileSync(
          `${root}/report.json`,
          JSON.stringify({ screens: results.length, errors, results }, null, 2),
        );
      }
    }
    await context.close();
  }
} finally {
  await browser?.close();
  await app.close();
  writeFileSync(
    `${root}/report.json`,
    JSON.stringify({ screens: results.length, errors, results }, null, 2),
  );
}
const failures = results.filter((r) => r.issues.length);
console.log(
  JSON.stringify({ screens: results.length, failures, errors }, null, 2),
);
if (!process.env.LAYOUT_AUDIT_ONLY) {
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
}
