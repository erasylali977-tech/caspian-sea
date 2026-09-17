import { chromium } from "playwright";

const url = process.argv[2];
const out = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 780 }, deviceScaleFactor: 1 });
page.on("console", (m) => console.log("[console]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(process.argv[4] || 3500));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("saved", out);
