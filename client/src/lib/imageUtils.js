/**
 * Compress an image File into a 16:9 JPEG data URL for YouTube thumbnails.
 * Always outputs a 1920x1080 canvas. Vertical/non-16:9 images are centered
 * with black bars (pillarboxing/letterboxing) — never cropped.
 *
 * @param {File} file - Image file to compress
 * @param {number} canvasWidth - Output width (default 1920)
 * @param {number} canvasHeight - Output height (default 1080)
 * @param {number} quality - JPEG quality 0-1 (default 0.95)
 * @returns {Promise<string>} Compressed base64 data URL
 */
export async function compressImageFile(file, canvasWidth = 1920, canvasHeight = 1080, quality = 0.95) {
  const bitmap = await createImageBitmap(file);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');

  // Black background — pillarbox/letterbox for non-16:9 sources
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Fit image within canvas, preserving aspect ratio (never crop)
  const scale = Math.min(canvasWidth / bitmap.width, canvasHeight / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const x = Math.round((canvasWidth - w) / 2);
  const y = Math.round((canvasHeight - h) / 2);

  ctx.drawImage(bitmap, x, y, w, h);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Compress an image from a data URL into a 16:9 JPEG.
 * Same 1920x1080 canvas with black bars for non-16:9 sources.
 * Kept for backward compatibility (single-file thumbnail editor, etc.)
 *
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {number} canvasWidth - Output width (default 1920)
 * @param {number} canvasHeight - Output height (default 1080)
 * @param {number} quality - JPEG quality 0-1 (default 0.95)
 * @returns {Promise<string>} Compressed base64 data URL
 */
export function compressImage(dataUrl, canvasWidth = 1920, canvasHeight = 1080, quality = 0.95) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = '';
      reject(new Error('Image load timed out'));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext('2d');

      // Black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Fit image within canvas, preserving aspect ratio
      const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const x = Math.round((canvasWidth - w) / 2);
      const y = Math.round((canvasHeight - h) / 2);

      ctx.drawImage(img, x, y, w, h);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load image'));
    };
    img.src = dataUrl;
  });
}
