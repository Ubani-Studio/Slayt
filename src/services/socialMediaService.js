const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Profile = require('../models/Profile');

const LOCAL_UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const getApiOrigin = () =>
  `${process.env.API_URL || process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`}`.replace(/\/+$/, '');

const isRemoteUrl = (value = '') => /^https?:\/\//i.test(String(value || ''));

const resolveLocalMediaPath = (mediaPath = '') => {
  if (!mediaPath || isRemoteUrl(mediaPath)) {
    return null;
  }

  if (path.isAbsolute(mediaPath) && fs.existsSync(mediaPath)) {
    return mediaPath;
  }

  const normalizedPath = String(mediaPath).replace(/^\/+/, '');
  if (normalizedPath.startsWith('uploads/')) {
    return path.join(__dirname, '../../', normalizedPath);
  }

  return path.join(LOCAL_UPLOADS_ROOT, path.basename(mediaPath));
};

const loadMediaAsset = async (mediaPath = '') => {
  if (!mediaPath) {
    throw new Error('Media path is missing');
  }

  if (isRemoteUrl(mediaPath)) {
    const response = await axios.get(mediaPath, {
      responseType: 'arraybuffer',
      timeout: 300000,
      maxContentLength: 512 * 1024 * 1024,
    });

    return {
      buffer: Buffer.from(response.data),
      size: Number(response.headers['content-length']) || Buffer.byteLength(response.data),
    };
  }

  const resolvedPath = resolveLocalMediaPath(mediaPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`Media file not found: ${mediaPath}`);
  }

  const buffer = fs.readFileSync(resolvedPath);
  return {
    buffer,
    size: buffer.length,
  };
};

/**
 * Social Media Posting Service
 * Handles posting to Instagram and TikTok platforms
 */

class SocialMediaService {
  /**
   * Get credentials for a profile, resolving to profile's own or parent's credentials
   * @param {string} profileId - Profile ID
   * @param {string} platform - 'instagram' or 'tiktok'
   * @returns {Promise<Object>} Credentials object or null
   */
  async getCredentialsForProfile(profileId, platform) {
    try {
      const profile = await Profile.findById(profileId);
      if (!profile) {
        return null;
      }

      return await profile.getEffectiveConnection(platform);
    } catch (error) {
      console.error('Get credentials for profile error:', error);
      return null;
    }
  }

  /**
   * Post content using profile credentials (resolves to profile or parent user)
   * @param {string} profileId - Profile ID
   * @param {Object} content - Content document to post
   * @param {Object} options - Posting options
   * @returns {Promise<Object>} Post result
   */
  async postWithProfile(profileId, content, options = {}) {
    const profile = await Profile.findById(profileId).populate('userId');
    if (!profile) {
      throw new Error('Profile not found');
    }

    const platform = options.platform || content.platform || 'instagram';

    if (platform === 'youtube') {
      return this.postToYouTube(profile.userId, content, options);
    }

    const credentials = await this.getCredentialsForProfile(profileId, platform);

    if (!credentials || !credentials.connected) {
      throw new Error(`${platform} is not connected for this profile`);
    }

    // Create a mock user object with the resolved credentials
    const userWithCredentials = {
      socialAccounts: {
        [platform]: {
          connected: credentials.connected,
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          userId: credentials.userId,
          username: credentials.username,
          expiresAt: credentials.expiresAt
        }
      }
    };

    if (platform === 'instagram') {
      return await this.postToInstagram(userWithCredentials, content, options);
    } else if (platform === 'tiktok') {
      return await this.postToTikTok(userWithCredentials, content, options);
    } else if (platform === 'both') {
      return await this.postToBothWithProfile(profileId, content, options);
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }

  /**
   * Post to both platforms using profile credentials
   */
  async postToBothWithProfile(profileId, content, options = {}) {
    const results = {
      instagram: null,
      tiktok: null,
      errors: []
    };

    // Post to Instagram
    try {
      results.instagram = await this.postWithProfile(profileId, content, { ...options, platform: 'instagram' });
    } catch (error) {
      results.errors.push({ platform: 'instagram', error: error.message });
    }

    // Post to TikTok
    try {
      results.tiktok = await this.postWithProfile(profileId, content, { ...options, platform: 'tiktok' });
    } catch (error) {
      results.errors.push({ platform: 'tiktok', error: error.message });
    }

    return results;
  }

  /**
   * Post content to Instagram
   * @param {Object} user - User document with Instagram credentials
   * @param {Object} content - Content document to post
   * @param {Object} options - Posting options (caption, location, etc.)
   * @returns {Promise<Object>} Post result with post ID and URL
   */
  async postToInstagram(user, content, options = {}) {
    try {
      if (!user.socialAccounts.instagram.connected) {
        throw new Error('Instagram account not connected');
      }

      if (!user.socialAccounts.instagram.accessToken) {
        throw new Error('Instagram access token missing');
      }

      // Check if token is expired
      if (user.socialAccounts.instagram.expiresAt < new Date()) {
        throw new Error('Instagram access token expired. Please reconnect your account.');
      }

      const accessToken = user.socialAccounts.instagram.accessToken;
      const userId = user.socialAccounts.instagram.userId;

      // Determine media type and post accordingly
      if (content.mediaType === 'image') {
        return await this.postInstagramImage(userId, accessToken, content, options);
      } else if (content.mediaType === 'video') {
        return await this.postInstagramVideo(userId, accessToken, content, options);
      } else if (content.mediaType === 'carousel') {
        return await this.postInstagramCarousel(userId, accessToken, content, options);
      } else {
        throw new Error(`Unsupported media type: ${content.mediaType}`);
      }
    } catch (error) {
      console.error('Instagram posting error:', error);
      throw error;
    }
  }

  /**
   * Post image to Instagram
   */
  async postInstagramImage(userId, accessToken, content, options) {
    try {
      // Step 1: Create media container (with per-platform crop applied)
      const imageUrl = this.getCroppedMediaUrl(content, 'instagram');
      const containerResponse = await axios.post(
        `https://graph.instagram.com/v18.0/${userId}/media`,
        {
          image_url: imageUrl,
          caption: options.caption || content.caption || '',
          access_token: accessToken
        }
      );

      const creationId = containerResponse.data.id;

      // Step 2: Publish the media container
      const publishResponse = await axios.post(
        `https://graph.instagram.com/v18.0/${userId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken
        }
      );

      const postId = publishResponse.data.id;

      // Step 3: Get post permalink
      const permalinkResponse = await axios.get(
        `https://graph.instagram.com/v18.0/${postId}`,
        {
          params: {
            fields: 'permalink',
            access_token: accessToken
          }
        }
      );

      return {
        success: true,
        platform: 'instagram',
        postId: postId,
        postUrl: permalinkResponse.data.permalink,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Instagram image post error:', error.response?.data || error);
      throw new Error(`Instagram posting failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post video to Instagram
   */
  async postInstagramVideo(userId, accessToken, content, options) {
    try {
      // Step 1: Create video container
      const containerResponse = await axios.post(
        `https://graph.instagram.com/v18.0/${userId}/media`,
        {
          media_type: 'REELS',
          video_url: this.getCroppedMediaUrl(content, 'instagram'),
          caption: options.caption || content.caption || '',
          access_token: accessToken
        }
      );

      const creationId = containerResponse.data.id;

      // Step 2: Wait for video processing (poll status)
      let isReady = false;
      let attempts = 0;
      const maxAttempts = 20; // Max 2 minutes (20 * 6 seconds)

      while (!isReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds

        const statusResponse = await axios.get(
          `https://graph.instagram.com/v18.0/${creationId}`,
          {
            params: {
              fields: 'status_code',
              access_token: accessToken
            }
          }
        );

        const statusCode = statusResponse.data.status_code;

        if (statusCode === 'FINISHED') {
          isReady = true;
        } else if (statusCode === 'ERROR') {
          throw new Error('Video processing failed');
        }

        attempts++;
      }

      if (!isReady) {
        throw new Error('Video processing timeout');
      }

      // Step 3: Publish the video
      const publishResponse = await axios.post(
        `https://graph.instagram.com/v18.0/${userId}/media_publish`,
        {
          creation_id: creationId,
          access_token: accessToken
        }
      );

      const postId = publishResponse.data.id;

      // Step 4: Get post permalink
      const permalinkResponse = await axios.get(
        `https://graph.instagram.com/v18.0/${postId}`,
        {
          params: {
            fields: 'permalink',
            access_token: accessToken
          }
        }
      );

      return {
        success: true,
        platform: 'instagram',
        postId: postId,
        postUrl: permalinkResponse.data.permalink,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Instagram video post error:', error.response?.data || error);
      throw new Error(`Instagram video posting failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post carousel to Instagram
   */
  async postInstagramCarousel(userId, accessToken, content, options) {
    try {
      const carouselImages = Array.isArray(content.carouselImages) && content.carouselImages.length > 0
        ? content.carouselImages
        : [content.mediaUrl];
      const mediaUrls = carouselImages
        .map((item) => this.getPublicMediaUrl(item))
        .filter(Boolean);

      if (mediaUrls.length < 2) {
        throw new Error('Instagram carousel requires at least 2 images');
      }
      if (mediaUrls.length > 10) {
        throw new Error('Instagram carousel supports up to 10 images');
      }

      const childIds = [];
      for (const imageUrl of mediaUrls) {
        const childResponse = await axios.post(
          `https://graph.instagram.com/v18.0/${userId}/media`,
          {
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: accessToken,
          }
        );
        childIds.push(childResponse.data.id);
      }

      const carouselResponse = await axios.post(
        `https://graph.instagram.com/v18.0/${userId}/media`,
        {
          media_type: 'CAROUSEL',
          children: childIds.join(','),
          caption: options.caption || content.caption || '',
          access_token: accessToken,
        }
      );

      const publishResponse = await axios.post(
        `https://graph.instagram.com/v18.0/${userId}/media_publish`,
        {
          creation_id: carouselResponse.data.id,
          access_token: accessToken,
        }
      );

      const postId = publishResponse.data.id;
      const permalinkResponse = await axios.get(
        `https://graph.instagram.com/v18.0/${postId}`,
        {
          params: {
            fields: 'permalink',
            access_token: accessToken,
          }
        }
      );

      return {
        success: true,
        platform: 'instagram',
        postId,
        postUrl: permalinkResponse.data.permalink,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Instagram carousel post error:', error.response?.data || error);
      throw new Error(`Instagram carousel posting failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post content to TikTok
   * @param {Object} user - User document with TikTok credentials
   * @param {Object} content - Content document to post
   * @param {Object} options - Posting options
   * @returns {Promise<Object>} Post result
   */
  async postToTikTok(user, content, options = {}) {
    try {
      if (!user.socialAccounts.tiktok.connected) {
        throw new Error('TikTok account not connected');
      }

      if (!user.socialAccounts.tiktok.accessToken) {
        throw new Error('TikTok access token missing');
      }

      const accessToken = user.socialAccounts.tiktok.accessToken;

      // TikTok only supports video content
      if (content.mediaType !== 'video') {
        throw new Error('TikTok only supports video content');
      }

      const creatorInfo = await this.getTikTokCreatorInfo(accessToken);
      const privacyOptions = Array.isArray(creatorInfo.privacy_level_options)
        ? creatorInfo.privacy_level_options.filter(Boolean)
        : [];
      const privacyLevel = privacyOptions.includes(options.privacyLevel)
        ? options.privacyLevel
        : (privacyOptions.includes('SELF_ONLY') ? 'SELF_ONLY' : privacyOptions[0]);

      if (!privacyLevel) {
        throw new Error('TikTok account did not return any allowed privacy settings');
      }

      if (
        typeof creatorInfo.max_video_post_duration_sec === 'number' &&
        typeof content.metadata?.duration === 'number' &&
        content.metadata.duration > creatorInfo.max_video_post_duration_sec
      ) {
        throw new Error(`TikTok video exceeds the allowed duration of ${creatorInfo.max_video_post_duration_sec} seconds`);
      }

      const mediaAsset = await loadMediaAsset(this.getPublicMediaUrl(content.mediaUrl));
      const videoSize = mediaAsset.size || content.metadata?.fileSize || 0;

      // Step 1: Initialize video upload
      const initResponse = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/video/init/',
        {
          post_info: {
            title: (options.caption || content.caption || content.title || 'Untitled video').slice(0, 150),
            privacy_level: privacyLevel,
            disable_duet: options.disableDuet || false,
            disable_comment: options.disableComment || false,
            disable_stitch: options.disableStitch || false,
            video_cover_timestamp_ms: 1000
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
          }
        }
      );

      const publishId = initResponse.data.data.publish_id;
      const uploadUrl = initResponse.data.data.upload_url;

      // Step 2: Upload video file
      await axios.put(uploadUrl, mediaAsset.buffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': videoSize,
          'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
        }
      });

      // Step 3: Check publish status
      let publishComplete = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!publishComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusResponse = await axios.post(
          'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
          {
            publish_id: publishId
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            }
          }
        );

        const status = statusResponse.data.data.status;

        if (status === 'PUBLISH_COMPLETE') {
          publishComplete = true;
        } else if (status === 'FAILED') {
          throw new Error('TikTok publish failed');
        }

        attempts++;
      }

      if (!publishComplete) {
        throw new Error('TikTok publish timeout');
      }

      return {
        success: true,
        platform: 'tiktok',
        postId: publishId,
        postUrl: null,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('TikTok posting error:', error.response?.data || error);
      throw new Error(`TikTok posting failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Post to both platforms
   */
  async postToBoth(user, content, options = {}) {
    const results = {
      instagram: null,
      tiktok: null,
      errors: []
    };

    // Post to Instagram
    try {
      results.instagram = await this.postToInstagram(user, content, options);
    } catch (error) {
      results.errors.push({ platform: 'instagram', error: error.message });
    }

    // Post to TikTok
    try {
      results.tiktok = await this.postToTikTok(user, content, options);
    } catch (error) {
      results.errors.push({ platform: 'tiktok', error: error.message });
    }

    return results;
  }

  /**
   * Get public URL for media (for Instagram API)
   * Note: Instagram requires publicly accessible URLs
   */
  getPublicMediaUrl(mediaPath) {
    if (!mediaPath) {
      return '';
    }

    if (String(mediaPath).startsWith('data:')) {
      return mediaPath;
    }

    // If already a full URL, return as is
    if (isRemoteUrl(mediaPath)) {
      return mediaPath;
    }

    const baseUrl = getApiOrigin();
    if (String(mediaPath).startsWith('/uploads/')) {
      return `${baseUrl}${mediaPath}`;
    }

    return `${baseUrl}/uploads/${path.basename(mediaPath)}`;
  }

  /**
   * Build a Cloudinary URL with per-platform crop/rotation/flip applied.
   * Reads from content.editSettings.platformDrafts[platform].
   * Returns the original URL unchanged if no edits exist for the platform.
   */
  getCroppedMediaUrl(content, platform) {
    const url = this.getPublicMediaUrl(content.mediaUrl);
    const draft = content.editSettings?.platformDrafts?.[platform];
    if (!draft) return url;

    // Only Cloudinary URLs support on-the-fly transforms
    if (!url.includes('cloudinary.com')) return url;

    const transforms = [];

    // 1. Crop (pixel coordinates)
    const cb = draft.cropBox;
    if (cb && typeof cb.left === 'number' && cb.width > 0 && cb.height > 0) {
      transforms.push(`c_crop,x_${Math.round(cb.left)},y_${Math.round(cb.top)},w_${Math.round(cb.width)},h_${Math.round(cb.height)}`);
    }

    // 2. Rotation
    if (draft.rotation) {
      transforms.push(`a_${draft.rotation}`);
    }

    // 3. Flip (Cloudinary: a_hflip / a_vflip via angle, or use e_hflip/e_vflip)
    if (draft.flipH) transforms.push('a_hflip');
    if (draft.flipV) transforms.push('a_vflip');

    if (transforms.length === 0) return url;

    const params = transforms.join('/');
    return url.replace('/upload/', `/upload/${params}/`);
  }

  /**
   * Refresh Instagram access token
   */
  async refreshInstagramToken(user) {
    try {
      const currentToken = user.socialAccounts.instagram.accessToken;

      const response = await axios.get(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: currentToken
          }
        }
      );

      const newToken = response.data.access_token;
      const expiresIn = response.data.expires_in;

      // Update user token
      user.socialAccounts.instagram.accessToken = newToken;
      user.socialAccounts.instagram.expiresAt = new Date(Date.now() + expiresIn * 1000);
      await user.save();

      return newToken;
    } catch (error) {
      console.error('Instagram token refresh error:', error);
      throw error;
    }
  }

  async getTikTokCreatorInfo(accessToken) {
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      },
    );

    return response.data?.data || {};
  }

  /**
   * Post to YouTube
   */
  async postToYouTube(user, content, options = {}) {
    try {
      const youtubeApiService = require('./youtubeApiService');

      // Prepare video data
      const videoData = {
        videoUrl: this.getCroppedMediaUrl(content, 'youtube') || this.getPublicMediaUrl(content.mediaUrl),
        title: options.title || content.title || 'Untitled Video',
        description: options.description || content.caption || '',
        tags: options.tags || content.hashtags || [],
        categoryId: options.categoryId || '22', // People & Blogs
        privacyStatus: options.privacyStatus || 'private',
        publishAt: options.publishAt || null,
        thumbnailUrl: content.thumbnailUrl ? this.getPublicMediaUrl(content.thumbnailUrl) : null
      };

      const result = await youtubeApiService.uploadVideo(user, videoData);

      if (result.success) {
        return {
          success: true,
          platform: 'youtube',
          postId: result.videoId,
          postUrl: result.videoUrl,
          timestamp: new Date()
        };
      } else {
        return {
          success: false,
          platform: 'youtube',
          error: result.error
        };
      }
    } catch (error) {
      console.error('YouTube posting error:', error);
      return {
        success: false,
        platform: 'youtube',
        error: error.message
      };
    }
  }

  /**
   * Validate social media credentials before posting
   */
  async validateCredentials(user, platform) {
    if (platform === 'instagram' || platform === 'both') {
      if (!user.socialAccounts.instagram.connected) {
        return { valid: false, error: 'Instagram not connected' };
      }

      if (user.socialAccounts.instagram.expiresAt < new Date()) {
        return { valid: false, error: 'Instagram token expired', needsRefresh: true };
      }
    }

    if (platform === 'tiktok' || platform === 'both') {
      if (!user.socialAccounts.tiktok.connected) {
        return { valid: false, error: 'TikTok not connected' };
      }

      if (user.socialAccounts.tiktok.expiresAt && user.socialAccounts.tiktok.expiresAt < new Date()) {
        return { valid: false, error: 'TikTok token expired', needsRefresh: true };
      }
    }

    if (platform === 'youtube') {
      const youtube = user.socialAccounts?.youtube || user.socialMedia?.youtube;
      if (!youtube || !youtube.accessToken) {
        return { valid: false, error: 'YouTube not connected' };
      }

      // YouTube token validation is handled by youtubeApiService
      // which will auto-refresh if needed
      return { valid: true };
    }

    return { valid: true };
  }
}

module.exports = new SocialMediaService();
