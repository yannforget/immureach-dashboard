const { chromium } = require('playwright');
const TARGET_URL = 'http://localhost:5179';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.getByText('Déterminants ménages').first().click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Barres' }).click();
  await page.waitForTimeout(1500);
  const card = page.locator('h3', { hasText: 'Poids des composantes' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await card.screenshot({ path: '/tmp/claude-1000/-home-leape-immureach-dashboard/86cf217b-04a5-4e5c-a5ad-e64a7a03a003/scratchpad/ri-bar.png' });
  const box = await card.boundingBox();
  await page.mouse.move(box.x + 400, box.y + 140);
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/claude-1000/-home-leape-immureach-dashboard/86cf217b-04a5-4e5c-a5ad-e64a7a03a003/scratchpad/ri-bar-hover.png', clip: { x: box.x, y: box.y, width: box.width, height: 400 } });
  await browser.close();
})();
