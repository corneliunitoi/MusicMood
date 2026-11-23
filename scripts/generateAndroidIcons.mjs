/**
 * generateAndroidIcons.mjs: renders the MusicMood app icon (branding/*.svg) into every Android size.
 *
 *   node scripts/generateAndroidIcons.mjs
 *
 * Needs Playwright (not a project dependency; install it yourself or run where it already exists).
 * Writes, for each density folder in android/app/src/main/res/mipmap-*:
 *   ic_launcher_background.png / ic_launcher_foreground.png  adaptive layers (108 dp canvas)
 *   ic_launcher.png / ic_launcher_round.png                  legacy icons (48 dp, rounded square / circle)
 * and branding/play-store-icon-512.png for Google Play.
 *
 * Edit the three SVGs in branding/ (icon-background, icon-foreground, icon-full) and run this again.
 * The gem is drawn inside Android's 66 dp safe circle so round and squircle masks never crop it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(import.meta.dirname, '..');
const res = path.join(root, 'android/app/src/main/res');
const read = (name) => fs.readFileSync(path.join(root, 'branding', name), 'utf8');
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const foreground = read('icon-foreground.svg');
const background = read('icon-background.svg');
const full = inner(read('icon-full.svg'));

// density -> [adaptive layer px (108 dp), legacy icon px (48 dp)]
const DENSITIES = { mdpi: [108, 48], hdpi: [162, 72], xhdpi: [216, 96], xxhdpi: [324, 144], xxxhdpi: [432, 192] };

// Legacy icons and the store icon show the central 72 x 72 dp of the 108 dp canvas (what a phone mask shows).
const crop = (shape) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72" width="100%" height="100%">
  <defs><clipPath id="m">${shape}</clipPath></defs><g clip-path="url(#m)">${full}</g></svg>`;
const roundedSquare = crop('<rect x="18" y="18" width="72" height="72" rx="15"/>');
const circle = crop('<circle cx="54" cy="54" r="36"/>');
const square = crop('<rect x="18" y="18" width="72" height="72"/>');

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, size, outFile, { transparent = true } = {}) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace(/<svg /, `<svg style="display:block;width:${size}px;height:${size}px" `)}</div></body></html>`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await page.screenshot({ path: outFile, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`  ${path.relative(root, outFile)} (${size}x${size})`);
}

for (const [density, [layer, legacy]] of Object.entries(DENSITIES)) {
    const dir = path.join(res, `mipmap-${density}`);
    await render(foreground, layer, path.join(dir, 'ic_launcher_foreground.png'));
    await render(background, layer, path.join(dir, 'ic_launcher_background.png'), { transparent: false });
    await render(roundedSquare, legacy, path.join(dir, 'ic_launcher.png'));
    await render(circle, legacy, path.join(dir, 'ic_launcher_round.png'));
}
await render(square, 512, path.join(root, 'branding/play-store-icon-512.png'), { transparent: false });

await browser.close();
