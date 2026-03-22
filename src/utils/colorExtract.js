let Vibrant;
const sharp = require('sharp');

async function loadVibrant() {
  if (!Vibrant) {
    const mod = await import('node-vibrant/node');
    Vibrant = mod.default || mod.Vibrant || mod;
  }
  return Vibrant;
}

/**
 * Extract dominant color using node-vibrant (MMCQ color quantization).
 * Converts unsupported formats (webp, avif) to PNG via sharp first.
 * Returns the most visually prominent hex color string.
 */
async function extractDominantColor(input) {
  try {
    const V = await loadVibrant();

    // node-vibrant doesn't support webp/avif — convert to PNG buffer via sharp
    let source = input;
    const isWebpOrAvif =
      (typeof input === 'string' && /\.(webp|avif)$/i.test(input)) ||
      (Buffer.isBuffer(input) && input.length > 12 &&
        (input.toString('ascii', 0, 4) === 'RIFF' || input.toString('hex', 4, 8) === '66747970'));

    if (isWebpOrAvif) {
      source = await sharp(input).resize(200, 200, { fit: 'inside' }).png().toBuffer();
    }

    const palette = await V.from(source).quality(3).getPalette();

    // Priority: Vibrant > DarkVibrant > LightVibrant > Muted > DarkMuted > LightMuted
    const swatch =
      palette.Vibrant ||
      palette.DarkVibrant ||
      palette.LightVibrant ||
      palette.Muted ||
      palette.DarkMuted ||
      palette.LightMuted;

    if (!swatch) return null;

    return swatch.hex;
  } catch (err) {
    // If node-vibrant fails on large images, try with a resized buffer
    if (err.message?.includes('maxMemoryUsage') || err.message?.includes('MIME')) {
      try {
        const buf = await sharp(input).resize(200, 200, { fit: 'inside' }).png().toBuffer();
        const V = await loadVibrant();
        const palette = await V.from(buf).quality(3).getPalette();
        const swatch =
          palette.Vibrant || palette.DarkVibrant || palette.LightVibrant ||
          palette.Muted || palette.DarkMuted || palette.LightMuted;
        return swatch ? swatch.hex : null;
      } catch {
        return null;
      }
    }
    console.error('Color extraction failed:', err.message);
    return null;
  }
}

module.exports = { extractDominantColor };
