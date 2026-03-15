const SUPPORTED_POSTING_PLATFORMS = ['instagram', 'tiktok', 'youtube'];

const normalizePlatforms = (value) => {
  const items = Array.isArray(value) ? value : [value];
  return [...new Set(
    items
      .map((item) => `${item || ''}`.trim().toLowerCase())
      .filter((item) => SUPPORTED_POSTING_PLATFORMS.includes(item))
  )];
};

const getScheduledPlatforms = (content = {}) => {
  const source = Array.isArray(content.scheduledPlatforms) && content.scheduledPlatforms.length > 0
    ? content.scheduledPlatforms
    : content.scheduledPlatform;

  return normalizePlatforms(source);
};

const setScheduledPlatforms = (content, platforms) => {
  const normalized = normalizePlatforms(platforms);
  content.scheduledPlatforms = normalized;
  content.scheduledPlatform = normalized[0] || undefined;
  return normalized;
};

module.exports = {
  SUPPORTED_POSTING_PLATFORMS,
  normalizePlatforms,
  getScheduledPlatforms,
  setScheduledPlatforms,
};
