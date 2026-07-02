// Headless UI smoke test: plays a full demo game through the real React client.
// Uses installed Google Chrome via playwright-core. Run with dev stack up (stub mode).
import { chromium } from 'playwright-core';

const shots = process.argv.includes('--shots');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const snap = async name => { if (shots) await page.screenshot({ path: `/tmp/iwj-${name}.png` }); };
const clickByText = async (text, tag = 'button') => {
  await page.locator(`${tag}:has-text("${text}")`).first().click({ timeout: 8000 });
};

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await snap('01-landing');
console.log('landing title:', await page.title());

// demo mode: pick opposition role
await page.locator('text=Demo').first().click();
await page.locator('text=Opposition').first().click();
const nameInput = page.locator('input[type="text"]').first();
if (await nameInput.isVisible().catch(() => false)) await nameInput.fill('SmokeTester');
await clickByText('Start');
console.log('started demo game');

// briefing
await page.locator('text=/understand|ready/i').first().waitFor({ timeout: 15000 });
await snap('02-briefing');
await page.locator('button', { hasText: /understand|ready/i }).first().click();
console.log('briefing acknowledged');

// turn 0 resolves without us (opposition waits); then act turns 1..2
for (let turn = 1; turn <= 2; turn++) {
  await page.locator('.opt, [class*=opt], label:has(input[type=radio])').first().waitFor({ timeout: 30000 });
  await snap(`03-turn${turn}`);
  // pick first radio of each visible group until submit enables
  const radios = page.locator('input[type=radio]');
  const n = await radios.count();
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const r = radios.nth(i);
    if (!(await r.isVisible().catch(() => false))) continue;
    const group = await r.getAttribute('name');
    if (group && seen.has(group)) continue;
    if (group) seen.add(group);
    await r.check().catch(() => {});
  }
  const submit = page.locator('button', { hasText: /commit|submit/i }).first();
  await submit.waitFor({ timeout: 5000 });
  if (await submit.isDisabled()) throw new Error(`submit still disabled turn ${turn}`);
  await submit.click();
  console.log(`turn ${turn} submitted`);
}

// reveal
await page.locator('text=/willingness/i').first().waitFor({ timeout: 40000 });
await page.waitForTimeout(3200); // chart animation
await snap('04-reveal');
const revealText = await page.locator('body').innerText();
console.log('reveal shows WD banner:', /willingness/i.test(revealText));
console.log('chart svg present:', (await page.locator('svg').count()) > 0);
console.log('play again present:', /play again/i.test(revealText));

if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.forEach(e => console.log('  ', e)); }
else console.log('no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
