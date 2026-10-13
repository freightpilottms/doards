import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const publicDir = new URL("../public/", import.meta.url);
const source = readFileSync(new URL("doards-logo.png", publicDir));
const image = `data:image/png;base64,${source.toString("base64")}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage();
  for (const [file, size, installed] of [
    ["favicon-16.png", 16, false],
    ["favicon-32.png", 32, false],
    ["apple-touch-icon.png", 180, true],
    ["doards-icon-192.png", 192, true],
    ["doards-icon-512.png", 512, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    // Frame the original blue mark; the supplied artwork remains unchanged.
    const viewBox = installed ? "-105 -8 780 780" : "20 120 520 520";
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${installed ? "#132438" : "transparent"}}svg{display:block;width:100%;height:100%}</style>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
        <defs><clipPath id="mark"><rect x="20" y="120" width="520" height="520"/></clipPath></defs>
        <image href="${image}" width="2170" height="725" clip-path="url(#mark)"/>
      </svg>`);
    await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }, image);
    await page.screenshot({
      path: fileURLToPath(new URL(file, publicDir)),
      omitBackground: !installed,
    });
    console.log(file);
  }
} finally {
  await browser.close();
}
