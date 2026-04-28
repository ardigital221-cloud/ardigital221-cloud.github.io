const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const pixelmatch = require("pixelmatch");
const { PNG } = require("pngjs");

const outDir = path.resolve(__dirname, "..", "visual-check");
fs.mkdirSync(outDir, { recursive: true });

async function shot(page, url, file, viewport) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });

  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: file, fullPage: false });
  return errors;
}

function compare(a, b, d) {
  const i1 = PNG.sync.read(fs.readFileSync(a));
  const i2 = PNG.sync.read(fs.readFileSync(b));
  const diff = new PNG({ width: i1.width, height: i1.height });
  const n = pixelmatch(i1.data, i2.data, diff.data, i1.width, i1.height, {
    threshold: 0.12,
  });
  fs.writeFileSync(d, PNG.sync.write(diff));
  const total = i1.width * i1.height;
  return { diffPixels: n, diffPercent: +(100 * n / total).toFixed(2) };
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const pairs = [
    {
      name: "home-desktop",
      remote: "https://carlosprado.dev/",
      local: "http://localhost:4173/",
      viewport: { width: 1440, height: 900 },
    },
    {
      name: "about-mobile",
      remote: "https://carlosprado.dev/about",
      local: "http://localhost:4173/about",
      viewport: { width: 390, height: 844 },
    },
  ];

  const report = [];
  for (const p of pairs) {
    const remoteFile = path.join(outDir, `remote-${p.name}.png`);
    const localFile = path.join(outDir, `local-${p.name}.png`);
    const diffFile = path.join(outDir, `diff-${p.name}.png`);

    const remoteErrors = await shot(page, p.remote, remoteFile, p.viewport);
    const localErrors = await shot(page, p.local, localFile, p.viewport);
    const cmp = compare(remoteFile, localFile, diffFile);

    report.push({
      name: p.name,
      viewport: p.viewport,
      diffPercent: cmp.diffPercent,
      diffPixels: cmp.diffPixels,
      remoteErrors,
      localErrors,
    });
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
