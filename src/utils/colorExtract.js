let Vibrant;

async function loadVibrant() {
  if (!Vibrant) {
    const mod = await import('node-vibrant/node');
    Vibrant = mod.default || mod.Vibrant || mod;
  }
  return Vibrant;
}

/**
 * Extract dominant color using node-vibrant (MMCQ color quantization).
 * Returns the most visually prominent hex color string.
 */
async function extractDominantColor(input) {
  try {
    const V = await loadVibrant();
    const palette = await V.from(input).quality(3).getPalette();

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
    console.error('Color extraction failed:', err.message);
    return null;
  }
}

module.exports = { extractDominantColor };
