const axios = require('axios');

const DEFAULT_CLAROSA_BASE_URL = process.env.CLAROSA_API_URL || 'http://127.0.0.1:8000';

const normalizeClarosaBaseUrl = (baseUrl = DEFAULT_CLAROSA_BASE_URL) => {
  const rawValue = `${baseUrl || DEFAULT_CLAROSA_BASE_URL}`.trim();
  if (!rawValue) {
    return DEFAULT_CLAROSA_BASE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `http://${rawValue}`;
  const withoutTrailingSlash = withProtocol.replace(/\/+$/, '');
  return withoutTrailingSlash.replace(/\/api\/v1$/i, '');
};

const resolveClarosaConnection = (user = {}) => {
  const clarosa = user?.clarosa;
  if (!clarosa?.connected) {
    return null;
  }

  const workspaceId = `${clarosa.workspaceId || 'default'}`.trim();
  if (!workspaceId) {
    return null;
  }

  const baseUrl = normalizeClarosaBaseUrl(clarosa.baseUrl);

  return {
    workspaceId,
    baseUrl,
    apiBaseUrl: `${baseUrl}/api/v1`,
    autoSyncOnUpload: clarosa.autoSyncOnUpload !== false,
  };
};

const getClarosaErrorMessage = (error) =>
  error?.response?.data?.detail
  || error?.response?.data?.error
  || error?.message
  || 'Clarosa request failed';

const createClarosaSnapshot = (connection, contentHash, match = null, error = null) => {
  if (!connection || !contentHash) {
    return null;
  }

  const now = new Date();
  const hasMatch = Boolean(match);

  return {
    connected: true,
    workspaceId: connection.workspaceId,
    baseUrl: connection.baseUrl,
    contentHash,
    status: error ? 'lookup_failed' : hasMatch ? 'matched' : 'unmatched',
    hasMatch,
    rating: typeof match?.rating === 'number' ? match.rating : null,
    favorite: Boolean(match?.favorite),
    markedForDelete: Boolean(match?.marked_for_delete),
    deleteReason: match?.delete_reason || null,
    notes: match?.notes || null,
    colorCategory: match?.color_category || null,
    dominantColor: match?.dominant_color || null,
    remoteUpdatedAt: match?.updated_at ? new Date(match.updated_at) : null,
    matchedAt: hasMatch ? now : null,
    lastSyncedAt: now,
    lastError: error ? `${error}`.slice(0, 500) : null,
  };
};

const lookupContentHashes = async (connection, contentHashes = []) => {
  if (!connection || !Array.isArray(contentHashes) || contentHashes.length === 0) {
    return {};
  }

  const dedupedHashes = [...new Set(contentHashes.filter(Boolean))];
  if (dedupedHashes.length === 0) {
    return {};
  }

  const { data } = await axios.post(
    `${connection.apiBaseUrl}/ratings/lookup`,
    {
      user_id: connection.workspaceId,
      content_hashes: dedupedHashes,
    },
    {
      timeout: 15000,
    },
  );

  return data?.ratings || {};
};

const lookupSingleContentHash = async (connection, contentHash) => {
  const results = await lookupContentHashes(connection, [contentHash]);
  return results?.[contentHash] || null;
};

const indexClarosaLibrary = async (connection) => {
  if (!connection) {
    throw new Error('Clarosa is not connected');
  }

  const { data } = await axios.post(
    `${connection.apiBaseUrl}/ratings/index-library`,
    {
      user_id: connection.workspaceId,
    },
    {
      timeout: 60000,
    },
  );

  return data;
};

const pushRatingToClarosa = async (connection, contentHash, rating) => {
  if (!connection || !contentHash) return false;

  try {
    await axios.put(
      `${connection.apiBaseUrl}/ratings/sync`,
      {
        user_id: connection.workspaceId,
        ratings: [{ content_hash: contentHash, rating }],
      },
      { timeout: 10000 },
    );
    return true;
  } catch (error) {
    console.error('Failed to push rating to Clarosa:', getClarosaErrorMessage(error));
    return false;
  }
};

module.exports = {
  DEFAULT_CLAROSA_BASE_URL,
  normalizeClarosaBaseUrl,
  resolveClarosaConnection,
  getClarosaErrorMessage,
  createClarosaSnapshot,
  lookupContentHashes,
  lookupSingleContentHash,
  indexClarosaLibrary,
  pushRatingToClarosa,
};
