#!/usr/bin/env node
/**
 * Rasterize the logo SVG sources to the PNG icon set consumed by app.json,
 * plus the website images under docs/assets.
 *
 * Usage:  node apps/mobile/assets/logo/render.cjs
 *
 * Uses whatever Playwright Chromium is already installed on the machine. If the
 * import path below is wrong for your setup, point PW_CORE at a playwright-core.
 */
const fs = require('fs');
const path = require('path');

const PW =
  process.env.PW_CORE ||
  '/home/srjn45/dev/sp-treeview-v2/node_modules/playwright-core';
const { chromium } = require(PW);

const HERE = __dirname;
const IMAGES = path.resolve(HERE, '../images');
const DOCS = path.resolve(HERE, '../../../../docs/assets');

// [ source svg, output png, size, transparentBackground ]
const JOBS = [
  ['logo-icon.svg', path.join(IMAGES, 'icon.png'), 1024, false],
  ['logo-icon.svg', path.join(IMAGES, 'favicon.png'), 48, false],
  ['logo-background.svg', path.join(IMAGES, 'android-icon-background.png'), 1024, false],
  ['logo-foreground.svg', path.join(IMAGES, 'android-icon-foreground.png'), 1024, true],
  ['logo-monochrome.svg', path.join(IMAGES, 'android-icon-monochrome.png'), 1024, true],
  ['logo-splash.svg', path.join(IMAGES, 'splash-icon.png'), 1024, true],
  ['logo-icon.svg', path.join(DOCS, 'icon.png'), 1024, false],
  ['logo-icon.svg', path.join(DOCS, 'favicon.png'), 64, false],
];

(async () => {
  const browser = await chromium.launch();
  // render at 2x then let the screenshot downscale → crisp edges at small sizes
  const SCALE = 2;
  for (const [svgName, out, size, transparent] of JOBS) {
    const svg = fs.readFileSync(path.join(HERE, svgName), 'utf8');
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: SCALE,
    });
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>*{margin:0;padding:0}html,body{background:transparent}
       svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'networkidle' }
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: transparent });
    await page.close();
    console.log(`✓ ${path.relative(process.cwd(), out)}  (${size}×${size})`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
