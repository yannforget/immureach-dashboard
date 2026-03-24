const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('✅ Page loaded');

  // Take screenshot showing the table with column headers
  await page.screenshot({ path: '/tmp/table-with-headers.png', fullPage: true });
  console.log('📸 Screenshot saved');

  // Check for table headers
  const headers = await page.locator('thead th').allTextContents();
  console.log('\n📋 Table headers found:');
  headers.forEach(h => console.log(`  - ${h}`));

  // Try to get title attributes from headers
  const bcgHeader = await page.locator('thead th:has-text("BCG")').first();
  if (await bcgHeader.isVisible()) {
    const title = await bcgHeader.getAttribute('title');
    console.log(`\n✅ BCG header tooltip: "${title}"`);
  }

  await browser.close();
})();
