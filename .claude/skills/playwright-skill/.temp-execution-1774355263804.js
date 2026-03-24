const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto(TARGET_URL);
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('✅ Page loaded\n');

  // Clear console logs from page load
  consoleLogs.length = 0;

  // Test 1: Hover over map to see if mouseover events fire
  console.log('📍 Test 1: Hovering over map...');
  const mapCanvas = await page.locator('canvas').first();
  if (await mapCanvas.isVisible()) {
    const box = await mapCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
      await page.waitForTimeout(800);
    }
  }

  const hoverLogs = consoleLogs.filter(log => log.includes('Mouseover') || log.includes('Mouseout'));
  console.log(`\n📋 Hover event logs: ${hoverLogs.length > 0 ? hoverLogs.join(', ') : 'NONE'}\n`);

  // Clear logs
  consoleLogs.length = 0;

  // Test 2: Click on map
  console.log('📍 Test 2: Clicking on map...');
  if (await mapCanvas.isVisible()) {
    const box = await mapCanvas.boundingBox();
    if (box) {
      await page.click('canvas', { position: { x: box.width * 0.35, y: box.height * 0.4 } });
      await page.waitForTimeout(800);
    }
  }

  console.log('\n📋 All console logs from click:');
  consoleLogs.forEach(log => {
    if (log.includes('Click') || log.includes('Raw event') || log.includes('Looking for') || log.includes('Available')) {
      console.log(`   ${log}`);
    }
  });

  if (consoleLogs.length === 0) {
    console.log('   NO EVENTS DETECTED');
  }

  await browser.close();
})();
