const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1911, height: 1037 } });
  const errs = [];

  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => errs.push(`REQFAIL ${r.url()}`));

  await page.goto("http://localhost:4190/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const canvas = page.locator("canvas[aria-label='Project gallery']").first();
  await canvas.click({ position: { x: 300, y: 300 } });
  await page.waitForTimeout(1800);

  const url = page.url();
  await page.screenshot({ path: "visual-check/click-after-fix.png" });

  console.log(
    JSON.stringify(
      { url, errsCount: errs.length, errs: errs.slice(0, 10) },
      null,
      2
    )
  );

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
