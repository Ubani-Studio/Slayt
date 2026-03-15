export const MAX_YOUTUBE_UPLOAD_TITLE_LENGTH = 100;

const collapseWhitespace = (value = '') =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegex = (value = '') =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeNameList = (values = []) => {
  const source = Array.isArray(values) ? values : [values];
  return Array.from(new Set(
    source
      .map((value) => collapseWhitespace(value))
      .filter(Boolean)
  ));
};

const titleAlreadyIncludesArtist = (title = '', artistName = '') => {
  const cleanTitle = collapseWhitespace(title);
  const cleanArtist = collapseWhitespace(artistName);

  if (!cleanTitle || !cleanArtist) {
    return false;
  }

  if (cleanTitle.toLowerCase() === cleanArtist.toLowerCase()) {
    return true;
  }

  const artistPattern = new RegExp(`^${escapeRegex(cleanArtist)}(?:\\s*[-:|]\\s*|\\s+)`, 'i');
  return artistPattern.test(cleanTitle);
};

const titleAlreadyIncludesFeaturing = (title = '', featuringArtists = []) => {
  const cleanTitle = collapseWhitespace(title).toLowerCase();
  if (!cleanTitle) {
    return false;
  }

  if (/\b(feat(?:\.|uring)?|ft\.?)\b/i.test(cleanTitle)) {
    return true;
  }

  const cleanFeaturingArtists = normalizeNameList(featuringArtists);
  return cleanFeaturingArtists.some((name) => cleanTitle.includes(name.toLowerCase()));
};

const appendFeaturingClause = (baseTitle = '', featuringArtists = []) => {
  const cleanBaseTitle = collapseWhitespace(baseTitle);
  const cleanFeaturingArtists = normalizeNameList(featuringArtists);

  if (!cleanBaseTitle || cleanFeaturingArtists.length === 0) {
    return cleanBaseTitle;
  }

  if (titleAlreadyIncludesFeaturing(cleanBaseTitle, cleanFeaturingArtists)) {
    return cleanBaseTitle;
  }

  return `${cleanBaseTitle} feat. ${cleanFeaturingArtists.join(', ')}`;
};

const buildRawYoutubeUploadTitle = ({
  title = '',
  artistName = '',
  featuringArtists = [],
  fallbackTitle = 'Untitled Video',
} = {}) => {
  const cleanTitle = collapseWhitespace(title);
  const cleanArtist = collapseWhitespace(artistName);
  const fallback = collapseWhitespace(fallbackTitle) || 'Untitled Video';

  if (!cleanTitle && !cleanArtist) {
    return fallback;
  }

  if (!cleanArtist) {
    return appendFeaturingClause(cleanTitle || fallback, featuringArtists);
  }

  if (!cleanTitle) {
    return appendFeaturingClause(cleanArtist, featuringArtists);
  }

  if (titleAlreadyIncludesArtist(cleanTitle, cleanArtist)) {
    return appendFeaturingClause(cleanTitle, featuringArtists);
  }

  return appendFeaturingClause(`${cleanArtist} - ${cleanTitle}`, featuringArtists);
};

const clipYoutubeUploadTitle = (rawTitle = '', maxLength = MAX_YOUTUBE_UPLOAD_TITLE_LENGTH) => {
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return collapseWhitespace(rawTitle);
  }

  const normalized = collapseWhitespace(rawTitle);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trimEnd();
};

export const getYoutubeUploadTitleInfo = ({
  title = '',
  artistName = '',
  featuringArtists = [],
  fallbackTitle = 'Untitled Video',
  maxLength = MAX_YOUTUBE_UPLOAD_TITLE_LENGTH,
} = {}) => {
  const rawTitle = buildRawYoutubeUploadTitle({
    title,
    artistName,
    featuringArtists,
    fallbackTitle,
  });
  const uploadTitle = clipYoutubeUploadTitle(rawTitle, maxLength);

  return {
    rawTitle,
    uploadTitle,
    maxLength,
    wasTruncated: rawTitle !== uploadTitle,
  };
};

export const buildYoutubeUploadTitle = (options = {}) =>
  getYoutubeUploadTitleInfo(options).uploadTitle;
