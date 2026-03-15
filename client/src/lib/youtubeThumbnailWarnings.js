export const YOUTUBE_CUSTOM_THUMBNAIL_ELIGIBILITY_URL =
  'https://support.google.com/youtube/answer/9890437';

export const YOUTUBE_CUSTOM_THUMBNAIL_HELP_URL =
  'https://support.google.com/youtube/answer/72431?hl=en';

const collapseWhitespace = (value = '') =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

export const getYoutubeThumbnailWarning = (message = '') => {
  const normalizedMessage = collapseWhitespace(message);
  if (!normalizedMessage) {
    return null;
  }

  const lower = normalizedMessage.toLowerCase();
  const isThumbnailWarning =
    lower.includes('thumbnail') ||
    lower.includes('invalidimage') ||
    lower.includes('thumbnails.set') ||
    lower.includes('custom thumbnails') ||
    lower.includes('mediabodyrequired');

  if (!isThumbnailWarning) {
    return null;
  }

  const base = {
    rawMessage: normalizedMessage,
    badgeLabel: 'Published without custom thumbnail',
    helpLabel: 'How to enable custom thumbnails',
    helpUrl: YOUTUBE_CUSTOM_THUMBNAIL_HELP_URL,
    summary: 'YouTube published the video, but it did not apply the custom thumbnail.',
    detail: normalizedMessage,
    type: 'generic',
  };

  if (
    lower.includes('forbidden') ||
    lower.includes('insufficient') ||
    lower.includes('permission') ||
    lower.includes('not have permission') ||
    lower.includes('feature')
  ) {
    return {
      ...base,
      type: 'eligibility',
      helpUrl: YOUTUBE_CUSTOM_THUMBNAIL_ELIGIBILITY_URL,
      summary: 'Enable custom thumbnails in YouTube Studio for this channel before trying again.',
      detail: 'Open YouTube Studio, then go to Settings -> Channel -> Feature eligibility and turn on custom thumbnails for this channel.',
    };
  }

  if (lower.includes('invalidimage') || lower.includes('invalid image')) {
    return {
      ...base,
      type: 'invalid_image',
      summary: 'YouTube rejected this thumbnail image.',
      detail: 'Use a normal JPG or PNG thumbnail at 16:9, ideally 1280x720, then try again.',
    };
  }

  if (lower.includes('uploadratelimitexceeded') || lower.includes('rate limit')) {
    return {
      ...base,
      type: 'rate_limit',
      summary: 'YouTube temporarily blocked another custom thumbnail upload.',
      detail: 'Wait a bit and retry. YouTube can rate-limit custom thumbnail changes.',
    };
  }

  return base;
};
