const { chromium } = require("playwright");

async function run(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1911, height: 1037 } });
  const bad = [];
  page.on("response", (r) => {
    if (r.status() >= 400) bad.push({ status: r.status(), url: r.url() });
  });
  page.on("requestfailed", (r) => {
    bad.push({ status: "FAILED", url: r.url(), error: r.failure()?.errorText || "unknown" });
  });
  page.on("pageerror", (e) => bad.push({ status: "PAGEERROR", url, error: e.message }));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "visual-check/live-pages.png", fullPage: false });
  await browser.close();
  return bad;
}

run(process.argv[2] || "https://ardigital221-cloud.github.io/carlos3/")
  .then((bad) => {
    console.log(JSON.stringify(bad, null, 2));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
