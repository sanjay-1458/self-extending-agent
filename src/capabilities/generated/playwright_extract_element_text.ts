import { chromium } from 'playwright';

export async function run(input: unknown): Promise<string> {
  if (typeof input !== 'object' || input === null || !('url' in input) || !('elementId' in input)) {
    throw new Error('Input must be an object with url and elementId properties');
  }

  const { url, elementId } = input as { url: string; elementId: string };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url);
    const element = await page.$(`#${elementId}`);
    
    if (!element) {
      throw new Error(`Element with ID '${elementId}' not found on page ${url}`);
    }
    
    const text = await element.textContent();
    return text?.trim() || '';
  } finally {
    await browser.close();
  }
}
