/**
 * Generate PNG icons from SVG for PWA manifest.
 * Run: node scripts/generate-icons.js
 * Requires: npm install sharp (dev dependency)
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icons/icon.svg');
const outDir = resolve(__dirname, '../public/icons');

async function generate() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('⚠️  sharp not installed. Generating placeholder PNGs instead.');
    console.log('   Run: npm install --save-dev sharp');
    console.log('   Then: node scripts/generate-icons.js');
    // Create minimal placeholder PNGs (1x1 green pixel) so manifest doesn't 404
    const { writeFileSync } = await import('fs');
    // Minimal valid PNG (1x1 green pixel)
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png']) {
      writeFileSync(resolve(outDir, name), png1x1);
      console.log(`  → ${name} (placeholder)`);
    }
    return;
  }

  const svg = readFileSync(svgPath);

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    await sharp(svg).resize(size, size).png().toFile(resolve(outDir, name));
    console.log(`  ✓ ${name}`);
  }

  // Maskable icons (with padding — 10% safe zone)
  for (const { name, size } of [
    { name: 'icon-maskable-192.png', size: 192 },
    { name: 'icon-maskable-512.png', size: 512 },
  ]) {
    const innerSize = Math.round(size * 0.8);
    const padding = Math.round((size - innerSize) / 2);
    const inner = await sharp(svg).resize(innerSize, innerSize).png().toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 46, g: 204, b: 113, alpha: 1 } }
    })
      .composite([{ input: inner, top: padding, left: padding }])
      .png()
      .toFile(resolve(outDir, name));
    console.log(`  ✓ ${name}`);
  }

  console.log('\nDone! Icons generated in public/icons/');
}

generate().catch(console.error);
