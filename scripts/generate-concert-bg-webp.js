#!/usr/bin/env node
/**
 * Generates concert-bg.webp from concert-bg.png for smaller LCP payload.
 * Run: node scripts/generate-concert-bg-webp.js
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const inputPath = path.join(process.cwd(), "public", "concert-bg.png");
const outputPath = path.join(process.cwd(), "public", "concert-bg.webp");

if (!fs.existsSync(inputPath)) {
  console.error("concert-bg.png not found in public/");
  process.exit(1);
}

sharp(inputPath)
  .webp({ quality: 80 })
  .toFile(outputPath)
  .then((info) => {
    const inputSize = fs.statSync(inputPath).size;
    const savings = ((1 - info.size / inputSize) * 100).toFixed(1);
    console.log(`Generated ${outputPath} (${(info.size / 1024).toFixed(1)}KB, ${savings}% smaller than PNG)`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
