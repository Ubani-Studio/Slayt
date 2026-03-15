/**
 * Thumbnail-to-video matching utility.
 * Matches dropped image files to existing videos by filename ↔ title/source metadata.
 */

/**
 * Normalize a string for fuzzy comparison:
 * strip extension, replace separators with spaces, lowercase, collapse whitespace.
 */
export function normalizeForMatch(str) {
  if (!str) return '';
  return str
    .replace(/\.[^/.]+$/, '')       // strip file extension
    .replace(/[-_]+/g, ' ')         // replace dashes/underscores with spaces
    .toLowerCase()
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

/**
 * Strip common artist prefix patterns like "Artist - Title" → "Title"
 */
function stripArtistPrefix(str) {
  const normalized = normalizeForMatch(str);
  // "artist - title" or "artist  title" after a dash
  const dashIdx = normalized.indexOf(' - ');
  if (dashIdx !== -1 && dashIdx < normalized.length - 3) {
    return normalized.slice(dashIdx + 3).trim();
  }
  return normalized;
}

/**
 * Count overlapping words between two normalized strings.
 * Returns a score 0-1 based on overlap ratio.
 */
function wordOverlapScore(a, b) {
  const wordsA = new Set(a.split(' ').filter(Boolean));
  const wordsB = new Set(b.split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }

  // Score relative to the smaller set
  const minSize = Math.min(wordsA.size, wordsB.size);
  return overlap / minSize;
}

/**
 * Compute match confidence between a file and a video.
 * Returns { confidence: 'exact'|'high'|'medium'|'low'|null, score: number }
 */
function computeMatch(file, video) {
  const fileNorm = normalizeForMatch(file.name);
  const titleNorm = normalizeForMatch(video.title);
  const sourceNorm = normalizeForMatch(video.thumbnailSourceFilename);
  const origNorm = normalizeForMatch(video.originalFilename);

  // 1. Exact match on stored thumbnail source filename (best possible)
  if (sourceNorm && fileNorm === sourceNorm) {
    return { confidence: 'exact', score: 100 };
  }

  // 2. Exact match on originalFilename (legacy metadata)
  if (origNorm && fileNorm === origNorm) {
    return { confidence: 'exact', score: 98 };
  }

  // 3. Exact match on title
  if (fileNorm === titleNorm) {
    return { confidence: 'exact', score: 95 };
  }

  // 4. Source metadata starts with or contains file name (or vice versa)
  if (sourceNorm && (sourceNorm.includes(fileNorm) || fileNorm.includes(sourceNorm))) {
    return { confidence: 'high', score: 88 };
  }

  // 5. Original filename starts with or contains file name (or vice versa)
  if (origNorm && (origNorm.includes(fileNorm) || fileNorm.includes(origNorm))) {
    return { confidence: 'high', score: 85 };
  }

  // 6. Artist-stripped title match
  const fileStripped = stripArtistPrefix(file.name);
  const titleStripped = stripArtistPrefix(video.title);
  if (fileStripped === titleStripped && fileStripped.length > 2) {
    return { confidence: 'high', score: 80 };
  }

  // 7. startsWith / includes on title
  if (titleNorm.startsWith(fileNorm) || fileNorm.startsWith(titleNorm)) {
    return { confidence: 'medium', score: 70 };
  }
  if (titleNorm.includes(fileNorm) || fileNorm.includes(titleNorm)) {
    return { confidence: 'medium', score: 60 };
  }

  // 8. Word overlap
  const overlap = wordOverlapScore(fileNorm, titleNorm);
  if (overlap >= 0.75) {
    return { confidence: 'medium', score: 50 + overlap * 10 };
  }
  if (overlap >= 0.5) {
    return { confidence: 'low', score: 30 + overlap * 10 };
  }

  return { confidence: null, score: 0 };
}

/**
 * Match an array of Files to an array of videos.
 * Each video can be matched at most once (greedy best-match).
 *
 * @param {File[]} files - Image files to match
 * @param {Array} videos - Video objects with { _id, id, title, thumbnailSourceFilename, originalFilename, ... }
 * @returns {{ matched: Array<{ file: File, video: object, confidence: string, score: number }>, unmatched: File[] }}
 */
export function matchFilesToVideos(files, videos) {
  // Build all candidate pairs with scores
  const candidates = [];
  for (const file of files) {
    for (const video of videos) {
      const { confidence, score } = computeMatch(file, video);
      if (confidence) {
        candidates.push({ file, video, confidence, score });
      }
    }
  }

  // Sort by score descending (greedy best-first)
  candidates.sort((a, b) => b.score - a.score);

  const matchedFiles = new Set();
  const matchedVideoIds = new Set();
  const matched = [];

  for (const candidate of candidates) {
    const fileKey = candidate.file.name + candidate.file.size; // unique-ish key
    const videoId = candidate.video._id || candidate.video.id;

    if (matchedFiles.has(fileKey) || matchedVideoIds.has(videoId)) continue;

    matchedFiles.add(fileKey);
    matchedVideoIds.add(videoId);
    matched.push(candidate);
  }

  const unmatched = files.filter(f => !matchedFiles.has(f.name + f.size));

  return { matched, unmatched };
}
