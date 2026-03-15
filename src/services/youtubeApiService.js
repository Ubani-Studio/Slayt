/**
 * YouTube API Service
 *
 * Handles YouTube Data API v3 integration:
 * - OAuth 2.0 authentication
 * - Video uploads
 * - Metadata management
 * - Thumbnail uploads
 * - Scheduled publishing
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { google } = require('googleapis');
const sharp = require('sharp');
const { buildYoutubeUploadTitle } = require('../utils/youtubeUploadTitle');

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Initialize YouTube OAuth2 Client
 */
function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI || `${process.env.API_URL || process.env.BACKEND_PUBLIC_URL || 'http://localhost:3002'}/api/auth/youtube/callback`
  );

  return oauth2Client;
}

/**
 * Get YouTube authorization URL
 */
function getAuthorizationUrl(state = '') {
  const oauth2Client = getOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: state,
    prompt: 'consent select_account' // Force refresh token issuance and account chooser for reconnects
  });

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
async function getTokensFromCode(code) {
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expiry_date - Date.now()))
    };
  } catch (error) {
    console.error('YouTube token exchange error:', error);
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
}

/**
 * Refresh YouTube access token
 */
async function refreshAccessToken(refreshToken) {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date)
    };
  } catch (error) {
    console.error('YouTube token refresh error:', error);
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
}

/**
 * Validate and refresh YouTube credentials if needed
 */
async function validateAndRefreshCredentials(user) {
  const youtube = user.socialAccounts?.youtube || user.socialMedia?.youtube;

  if (!youtube?.accessToken) {
    return {
      valid: false,
      error: 'YouTube not connected',
      needsAuth: true
    };
  }

  // Check if token is expired or expiring soon (within 5 minutes)
  const expiresAt = new Date(youtube.tokenExpiry || youtube.expiresAt);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt <= new Date(now.getTime() + fiveMinutes)) {
    // Token expired or expiring soon - refresh it
    if (!youtube.refreshToken) {
      return {
        valid: false,
        error: 'Refresh token missing - reconnect YouTube',
        needsAuth: true
      };
    }

    try {
      const { accessToken, expiresAt: newExpiresAt } = await refreshAccessToken(youtube.refreshToken);

      // Update user's tokens
      if (user.socialAccounts?.youtube) {
        user.socialAccounts.youtube.accessToken = accessToken;
        user.socialAccounts.youtube.expiresAt = newExpiresAt;
        user.socialAccounts.youtube.tokenExpiry = newExpiresAt;
      }

      if (user.socialMedia?.youtube) {
        user.socialMedia.youtube.accessToken = accessToken;
        user.socialMedia.youtube.tokenExpiry = newExpiresAt;
      }
      await user.save();

      return {
        valid: true,
        accessToken,
        refreshed: true
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to refresh token - reconnect YouTube',
        needsAuth: true,
        needsRefresh: true
      };
    }
  }

  return {
    valid: true,
    accessToken: youtube.accessToken
  };
}

/**
 * Upload video to YouTube
 *
 * @param {Object} user - User with YouTube credentials
 * @param {Object} videoData - Video data and metadata
 * @returns {Object} Upload result with video ID and URL
 */
async function uploadVideo(user, videoData) {
  let tempVideoPath = null;

  try {
    const {
      videoUrl,        // URL or file path to video
      title,
      artistName = '',
      featuringArtists = [],
      description = '',
      tags = [],
      categoryId = '22', // Default: People & Blogs
      privacyStatus = 'private', // 'public', 'private', 'unlisted'
      publishAt = null, // ISO 8601 date for scheduled publishing
      thumbnailUrl = null
    } = videoData;

    // Validate credentials
    const credentialCheck = await validateAndRefreshCredentials(user);
    if (!credentialCheck.valid) {
      throw new Error(credentialCheck.error);
    }

    const accessToken = credentialCheck.accessToken;

    // Initialize OAuth2 client
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: user.socialMedia.youtube.refreshToken
        || user.socialAccounts?.youtube?.refreshToken
    });

    // Initialize YouTube API
    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    const uploadTitle = buildYoutubeUploadTitle({
      title,
      artistName,
      featuringArtists,
      fallbackTitle: 'Untitled Video',
    });

    // Prepare video metadata
    const videoMetadata = {
      snippet: {
        title: uploadTitle, // YouTube max 100 chars
        description: description.substring(0, 5000), // YouTube max 5000 chars
        tags: tags.slice(0, 500), // YouTube max 500 tags
        categoryId: categoryId
      },
      status: {
        privacyStatus: privacyStatus,
        selfDeclaredMadeForKids: false
      }
    };

    // Add scheduled publish time if provided
    if (publishAt && privacyStatus === 'private') {
      videoMetadata.status.publishAt = new Date(publishAt).toISOString();
    }

    // Determine media source
    let media;
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      // Stream remote video to a temp file so large uploads do not sit in memory.
      tempVideoPath = await downloadVideoToTempFile(videoUrl);
      media = {
        body: fs.createReadStream(tempVideoPath)
      };
    } else {
      // Local file path
      media = {
        body: fs.createReadStream(videoUrl)
      };
    }

    // Upload video
    console.log('📤 Uploading video to YouTube:', uploadTitle);
    const uploadResponse = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: videoMetadata,
      media: media
    });

    const videoId = uploadResponse.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    console.log('✅ Video uploaded successfully:', youtubeUrl);

    let thumbnailApplied = false;
    let thumbnailError = null;

    // Upload thumbnail if provided
    if (thumbnailUrl) {
      try {
        await uploadThumbnail(oauth2Client, videoId, thumbnailUrl);
        thumbnailApplied = true;
        console.log('✅ Thumbnail uploaded');
      } catch (thumbError) {
        console.error('❌ Thumbnail upload failed:', thumbError.message);
        thumbnailError = thumbError.message;
      }
    }

    return {
      success: true,
      videoId,
      videoUrl: youtubeUrl,
      title: uploadResponse.data.snippet.title || uploadTitle,
      publishedAt: uploadResponse.data.snippet.publishedAt,
      privacyStatus: uploadResponse.data.status.privacyStatus,
      thumbnailApplied,
      thumbnailError,
    };

  } catch (error) {
    console.error('YouTube upload error:', error);

    // Parse YouTube API errors
    let errorMessage = error.message;
    if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    }

    return {
      success: false,
      error: errorMessage,
      errorCode: error.response?.data?.error?.code || 'UPLOAD_FAILED'
    };
  } finally {
    if (typeof tempVideoPath === 'string' && tempVideoPath) {
      fs.promises.unlink(tempVideoPath).catch(() => {});
    }
  }
}

/**
 * Download video from URL to a temp file
 */
async function downloadVideoToTempFile(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 15 * 60 * 1000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const extension = path.extname(new URL(url).pathname) || '.mp4';
    const tempPath = path.join(os.tmpdir(), `slayt-youtube-${crypto.randomUUID()}${extension}`);
    await pipeline(response.data, fs.createWriteStream(tempPath));
    return tempPath;
  } catch (error) {
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

/**
 * Upload thumbnail to YouTube video
 */
async function uploadThumbnail(oauth2Client, videoId, thumbnailUrl) {
  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    let thumbnailBuffer;
    if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
      // Download thumbnail from URL
      const response = await axios.get(thumbnailUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 12 * 1024 * 1024,
      });
      thumbnailBuffer = Buffer.from(response.data);
    } else if (thumbnailUrl.startsWith('data:')) {
      // Base64 thumbnail
      const base64Data = thumbnailUrl.replace(/^data:image\/\w+;base64,/, '');
      thumbnailBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // Local file
      thumbnailBuffer = await fs.promises.readFile(thumbnailUrl);
    }

    const media = {
      mimeType: 'image/jpeg',
      body: await prepareYoutubeThumbnailBuffer(thumbnailBuffer),
    };

    await youtube.thumbnails.set({
      videoId: videoId,
      media: media
    });

    return { success: true };
  } catch (error) {
    console.error('Thumbnail upload error:', error);
    throw error;
  }
}

async function prepareYoutubeThumbnailBuffer(inputBuffer) {
  const widths = [1280, 960, 720];
  const qualities = [88, 80, 72, 64, 56];

  for (const width of widths) {
    for (const quality of qualities) {
      const output = await sharp(inputBuffer)
        .rotate()
        .resize({
          width,
          height: Math.round((width / 16) * 9),
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: false,
        })
        .jpeg({
          quality,
          mozjpeg: true,
          chromaSubsampling: '4:4:4',
        })
        .toBuffer();

      if (output.length <= YOUTUBE_THUMBNAIL_MAX_BYTES) {
        return output;
      }
    }
  }

  throw new Error('Custom thumbnail exceeds YouTube limits after optimization');
}

/**
 * Update video metadata
 */
async function updateVideoMetadata(user, videoId, updates) {
  try {
    const credentialCheck = await validateAndRefreshCredentials(user);
    if (!credentialCheck.valid) {
      throw new Error(credentialCheck.error);
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: credentialCheck.accessToken,
      refresh_token: user.socialMedia.youtube.refreshToken
        || user.socialAccounts?.youtube?.refreshToken
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    // Get current video details
    const videoResponse = await youtube.videos.list({
      part: ['snippet', 'status'],
      id: [videoId]
    });

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = videoResponse.data.items[0];

    // Update metadata
    if (updates.title) {
      video.snippet.title = updates.title.substring(0, 100);
    }
    if (updates.description !== undefined) {
      video.snippet.description = updates.description.substring(0, 5000);
    }
    if (updates.tags) {
      video.snippet.tags = updates.tags.slice(0, 500);
    }
    if (updates.privacyStatus) {
      video.status.privacyStatus = updates.privacyStatus;
    }

    // Update video
    await youtube.videos.update({
      part: ['snippet', 'status'],
      requestBody: video
    });

    return { success: true };
  } catch (error) {
    console.error('Update metadata error:', error);
    throw error;
  }
}

/**
 * Delete video from YouTube
 */
async function deleteVideo(user, videoId) {
  try {
    const credentialCheck = await validateAndRefreshCredentials(user);
    if (!credentialCheck.valid) {
      throw new Error(credentialCheck.error);
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: credentialCheck.accessToken,
      refresh_token: user.socialMedia.youtube.refreshToken
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    await youtube.videos.delete({
      id: videoId
    });

    return { success: true };
  } catch (error) {
    console.error('Delete video error:', error);
    throw error;
  }
}

/**
 * Get video analytics
 */
async function getVideoAnalytics(user, videoId) {
  try {
    const credentialCheck = await validateAndRefreshCredentials(user);
    if (!credentialCheck.valid) {
      throw new Error(credentialCheck.error);
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: credentialCheck.accessToken,
      refresh_token: user.socialMedia.youtube.refreshToken
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    const response = await youtube.videos.list({
      part: ['statistics', 'snippet', 'contentDetails'],
      id: [videoId]
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = response.data.items[0];

    return {
      success: true,
      analytics: {
        views: parseInt(video.statistics.viewCount || 0),
        likes: parseInt(video.statistics.likeCount || 0),
        comments: parseInt(video.statistics.commentCount || 0),
        title: video.snippet.title,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration
      }
    };
  } catch (error) {
    console.error('Get analytics error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get deep video analytics using YouTube Analytics API v2
 * Falls back to Data API v3 stats if Analytics API fails (missing scope)
 */
async function getVideoAnalyticsDeep(user, videoId) {
  try {
    const credentialCheck = await validateAndRefreshCredentials(user);
    if (!credentialCheck.valid) {
      throw new Error(credentialCheck.error);
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: credentialCheck.accessToken,
      refresh_token: user.socialMedia.youtube.refreshToken
    });

    // First get basic stats from Data API v3
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const basicResponse = await youtube.videos.list({
      part: ['statistics', 'snippet', 'contentDetails'],
      id: [videoId]
    });

    if (!basicResponse.data.items || basicResponse.data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = basicResponse.data.items[0];
    const result = {
      views: parseInt(video.statistics.viewCount || 0),
      likes: parseInt(video.statistics.likeCount || 0),
      comments: parseInt(video.statistics.commentCount || 0),
      title: video.snippet.title,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      // Deep analytics fields — populated if Analytics API succeeds
      shares: null,
      avgViewDuration: null,
      avgViewPercentage: null,
      subscribersGained: null,
      subscribersLost: null,
      estimatedMinutesWatched: null,
      cardClickRate: null
    };

    // Try YouTube Analytics API v2 for deep metrics
    try {
      const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

      const publishedDate = new Date(video.snippet.publishedAt);
      const startDate = publishedDate.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const analyticsResponse = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,shares,estimatedMinutesWatched,cardClickRate',
        filters: `video==${videoId}`
      });

      const rows = analyticsResponse.data.rows;
      if (rows && rows.length > 0) {
        const row = rows[0];
        result.avgViewDuration = row[0];
        result.avgViewPercentage = row[1];
        result.subscribersGained = row[2];
        result.subscribersLost = row[3];
        result.shares = row[4];
        result.estimatedMinutesWatched = row[5];
        result.cardClickRate = row[6];
      }
    } catch (analyticsError) {
      console.log('[YouTube] Analytics API unavailable (missing scope or quota), using Data API only:', analyticsError.message);
    }

    return { success: true, analytics: result };
  } catch (error) {
    console.error('Get deep analytics error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getAuthorizationUrl,
  getTokensFromCode,
  refreshAccessToken,
  validateAndRefreshCredentials,
  uploadVideo,
  updateVideoMetadata,
  deleteVideo,
  getVideoAnalytics,
  getVideoAnalyticsDeep,
  uploadThumbnail
};
