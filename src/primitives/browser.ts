import { chromium, type Browser } from "playwright";
import { env } from "../config.js";
import { checkAccess } from "./permissions.js";
import { logger } from "../logging/logger.js";

let browser: Browser | null = null;

async function getBrowser() {
  const access = checkAccess({
    task: "browser automation",
    resumeStep: "browser_action",
    requiredPermissions: ["browser", "internet"],
  });
  if (!access.ok) throw new Error(`ACCESS_REQUIRED:${JSON.stringify(access.blocker)}`);
  if (!browser) browser = await chromium.launch({ headless: env.playwrightHeadless });
  return browser;
}

export async function browserRead(url: string) {
  logger.info({ url }, "[browser] read");
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return {
      url: page.url(),
      title: await page.title(),
      text: (await page.locator("body").innerText()).slice(0, 30_000),
    };
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
}
