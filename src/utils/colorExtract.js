const sharp = require('sharp');

/**
 * Extract dominant color by averaging all pixels at 50x50.
 * Returns hex string like '#a1522f'.
 */
async function extractDominantColor(input) {
  try {
    const { data, info } = await sharp(input)
      .resize(50, 50, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = info.width * info.height;
    let r = 0, g = 0, b = 0;

    for (let i = 0; i < data.length; i += 3) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    r = Math.round(r / pixelCount);
    g = Math.round(g / pixelCount);
    b = Math.round(b / pixelCount);

    return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

module.exports = { extractDominantColor };
