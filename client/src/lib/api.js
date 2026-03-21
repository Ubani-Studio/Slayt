import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';
const MUX_UPLOAD_POLL_INTERVAL_MS = 2000;
const MUX_UPLOAD_POLL_TIMEOUT_MS = 2 * 60 * 1000;

// Create axios instance with defaults
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 60000, // 60s default — prevents infinite hangs on slow uploads
});

// Request interceptor for auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login if we had a token that expired
    // Don't redirect if user is in demo mode (no token)
    if (error.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildUploadProgress = ({ loaded = 0, total = 0, startedAt = Date.now() }) => {
  const safeTotal = Number(total) || 0;
  const safeLoaded = Number(loaded) || 0;
  const percent = safeTotal > 0 ? Math.min(100, (safeLoaded / safeTotal) * 100) : 0;
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
  const bytesPerSecond = safeLoaded / elapsedSeconds;
  const remainingBytes = Math.max(safeTotal - safeLoaded, 0);
  const etaSeconds = bytesPerSecond > 0 && safeTotal > 0 ? remainingBytes / bytesPerSecond : null;

  return {
    phase: 'uploading',
    loaded: safeLoaded,
    total: safeTotal,
    percent,
    etaSeconds,
  };
};

async function uploadFileToDirectUrl(url, file, onProgress) {
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();

    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(buildUploadProgress({
          loaded: event.loaded,
          total: event.total,
          startedAt,
        }));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({
          phase: 'processing',
          loaded: file.size,
          total: file.size,
          percent: 100,
          etaSeconds: 0,
        });
        resolve();
        return;
      }

      reject(new Error(`Direct upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Direct upload failed'));
    xhr.onabort = () => reject(new Error('Direct upload was cancelled'));
    xhr.send(file);
  });
}

async function pollMuxUploadStatus(uploadId, onProgress) {
  const startedAt = Date.now();
  let latest = null;

  while (Date.now() - startedAt < MUX_UPLOAD_POLL_TIMEOUT_MS) {
    const { data } = await api.get(`/api/youtube/videos/uploads/${uploadId}`);
    latest = data;

    if (data?.upload?.status === 'errored' || data?.asset?.videoAssetState === 'errored') {
      throw new Error(data?.upload?.errorMessage || 'Video processing failed');
    }

    if (data?.asset?.videoAssetState === 'ready') {
      onProgress?.({ phase: 'ready', percent: 100, etaSeconds: 0 });
      return latest;
    }

    const hasMuxAssetReference = Boolean(data?.upload?.assetId || data?.asset?.muxAssetId);
    if (hasMuxAssetReference && Date.now() - startedAt >= 15 * 1000) {
      onProgress?.({ phase: 'processing', percent: 100, etaSeconds: null });
      return latest;
    }

    onProgress?.({ phase: 'processing', percent: 100, etaSeconds: null });
    await sleep(MUX_UPLOAD_POLL_INTERVAL_MS);
  }

  return latest;
}

// Auth API
export const authApi = {
  async login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password });
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    return data;
  },

  async register(email, password, name) {
    const { data } = await api.post('/api/auth/register', { email, password, name });
    return data;
  },

  async logout() {
    localStorage.removeItem('token');
    await api.post('/api/auth/logout');
  },

  async getMe() {
    const { data } = await api.get('/api/auth/me');
    return data;
  },

  async getGoogleAuthUrl() {
    const { data } = await api.get('/api/auth/google');
    return data.url;
  },

  async updateProfile(profileData) {
    const { data } = await api.put('/api/auth/profile', profileData);
    return data;
  },

  async updateClarosaConnection(connectionData) {
    const { data } = await api.put('/api/auth/clarosa', connectionData);
    return data;
  },

  async indexClarosaLibrary() {
    const { data } = await api.post('/api/auth/clarosa/index-library');
    return data;
  },

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const { data } = await api.put('/api/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async uploadAvatarFromDataUrl(dataUrl, filename = 'avatar.png') {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    return this.uploadAvatar(file);
  },
};

// YouTube API
export const youtubeApi = {
  // Auth & Connection
  async getAuthUrl() {
    const { data } = await api.get('/api/auth/youtube/connect');
    return data.authUrl;
  },
  async getStatus() {
    const { data } = await api.get('/api/auth/youtube/status');
    return data;
  },
  async disconnect() {
    const { data } = await api.post('/api/auth/youtube/disconnect');
    return data;
  },

  // Collections
  async getCollections() {
    const { data } = await api.get('/api/youtube/collections');
    return data;
  },
  async getCollection(id) {
    const { data } = await api.get(`/api/youtube/collections/${id}`);
    return data;
  },
  async createCollection(collectionData) {
    const { data } = await api.post('/api/youtube/collections', collectionData);
    return data;
  },
  async updateCollection(id, updates) {
    const { data } = await api.put(`/api/youtube/collections/${id}`, updates);
    return data;
  },
  async scheduleCollection(id, entries) {
    const { data } = await api.post(`/api/youtube/collections/${id}/schedule`, { entries });
    return data;
  },
  async deleteCollection(id) {
    const { data } = await api.delete(`/api/youtube/collections/${id}`);
    return data;
  },

  // Videos
  async getVideos(collectionId) {
    const params = collectionId ? { collectionId } : {};
    const { data } = await api.get('/api/youtube/videos', { params });
    return data;
  },
  async getVideo(id) {
    const { data } = await api.get(`/api/youtube/videos/${id}`);
    return data;
  },
  async createVideo(videoData) {
    const { data } = await api.post('/api/youtube/videos', videoData);
    return data;
  },
  async uploadVideoAsset(file, options = {}) {
    const { onProgress } = options;
    try {
      const { data } = await api.post('/api/youtube/videos/upload-url', {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      if (data?.provider === 'mux' && data?.upload?.url) {
        await uploadFileToDirectUrl(data.upload.url, file, onProgress);
        const statusData = await pollMuxUploadStatus(data.upload.uploadId || data.upload.id, onProgress);
        return {
          message: 'Video asset uploaded successfully',
          asset: {
            ...(statusData?.asset || {}),
            videoFileName: statusData?.asset?.videoFileName || file.name,
            videoFileSize: statusData?.asset?.videoFileSize || file.size,
            videoMimeType: statusData?.asset?.videoMimeType || file.type,
          },
        };
      }
    } catch (error) {
      const status = error?.response?.status;
      const shouldFallback = status && [404, 409, 501, 503].includes(status);
      if (!shouldFallback) {
        throw error;
      }
    }

    const formData = new FormData();
    formData.append('video', file);
    const uploadStartedAt = Date.now();
    const { data } = await api.post('/api/youtube/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 10 * 60 * 1000,
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(buildUploadProgress({
            loaded: event.loaded,
            total: event.total,
            startedAt: uploadStartedAt,
          }));
        }
      },
    });
    onProgress?.({ phase: 'ready', percent: 100, etaSeconds: 0 });
    return data;
  },
  async suggestTitles(payload) {
    const { data } = await api.post('/api/youtube/titles/suggest', payload);
    return data;
  },
  async updateVideo(id, updates) {
    // Server saves base64 immediately and uploads to Cloudinary in background,
    // so no extra timeout needed for thumbnail updates
    const { data } = await api.put(`/api/youtube/videos/${id}`, updates);
    return data;
  },
  async deleteVideo(id) {
    const { data } = await api.delete(`/api/youtube/videos/${id}`);
    return data;
  },
  async reorderVideos(collectionId, videoIds) {
    const { data } = await api.post('/api/youtube/videos/reorder', { collectionId, videoIds });
    return data;
  },

  // Versions
  async saveVersion(collectionId, name) {
    const { data } = await api.post(`/api/youtube/collections/${collectionId}/versions`, { name });
    return data;
  },
  async getVersions(collectionId) {
    const { data } = await api.get(`/api/youtube/collections/${collectionId}/versions`);
    return data;
  },
  async restoreVersion(collectionId, index) {
    const { data } = await api.post(`/api/youtube/collections/${collectionId}/versions/${index}/restore`);
    return data;
  },
  async deleteVersion(collectionId, index) {
    const { data } = await api.delete(`/api/youtube/collections/${collectionId}/versions/${index}`);
    return data;
  },

  // Conviction
  async scoreVideoConviction(id) {
    const { data } = await api.post(`/api/youtube/videos/${id}/conviction`);
    return data;
  },
  async scoreCollectionConviction(id) {
    const { data } = await api.post(`/api/youtube/collections/${id}/conviction`);
    return data;
  },
  async overrideVideoConviction(id, reason) {
    const { data } = await api.post(`/api/youtube/videos/${id}/conviction/override`, { reason });
    return data;
  },
};

// Crucibla API (ecosystem proxy)
export const cruciblaApi = {
  async getProjects() {
    const { data } = await api.get('/api/crucibla/projects');
    return data.projects || [];
  },
};

// Rollout API
export const rolloutApi = {
  // Rollouts
  async getAll() {
    const { data } = await api.get('/api/rollout');
    return data;
  },
  async getById(id) {
    const { data } = await api.get(`/api/rollout/${id}`);
    return data;
  },
  async create(rolloutData) {
    const { data } = await api.post('/api/rollout', rolloutData);
    return data;
  },
  async update(id, updates) {
    const { data } = await api.put(`/api/rollout/${id}`, updates);
    return data;
  },
  async delete(id) {
    const { data } = await api.delete(`/api/rollout/${id}`);
    return data;
  },

  // Sections
  async addSection(rolloutId, sectionData) {
    const { data } = await api.post(`/api/rollout/${rolloutId}/sections`, sectionData);
    return data;
  },
  async updateSection(rolloutId, sectionId, updates) {
    const { data } = await api.put(`/api/rollout/${rolloutId}/sections/${sectionId}`, updates);
    return data;
  },
  async deleteSection(rolloutId, sectionId) {
    const { data } = await api.delete(`/api/rollout/${rolloutId}/sections/${sectionId}`);
    return data;
  },
  async reorderSections(rolloutId, sectionIds) {
    const { data } = await api.post(`/api/rollout/${rolloutId}/sections/reorder`, { sectionIds });
    return data;
  },

  // Collections in sections
  async addCollectionToSection(rolloutId, sectionId, collectionId) {
    const { data } = await api.post(`/api/rollout/${rolloutId}/sections/${sectionId}/collections`, { collectionId });
    return data;
  },
  async removeCollectionFromSection(rolloutId, sectionId, collectionId) {
    const { data } = await api.delete(`/api/rollout/${rolloutId}/sections/${sectionId}/collections/${collectionId}`);
    return data;
  },

  // Scheduling
  async scheduleRollout(rolloutId, scheduleData) {
    const { data } = await api.put(`/api/rollout/${rolloutId}/schedule`, scheduleData);
    return data;
  },
  async setSectionDeadline(rolloutId, sectionId, deadlineData) {
    const { data } = await api.put(`/api/rollout/${rolloutId}/sections/${sectionId}/deadline`, deadlineData);
    return data;
  },
  async getScheduledRollouts(startDate, endDate) {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const { data } = await api.get('/api/rollout/calendar/scheduled', { params });
    return data;
  },

  // BLUE OCEAN: Rollout Intelligence
  async getIntelligence(rolloutId) {
    const { data } = await api.get(`/api/rollout/${rolloutId}/intelligence`);
    return data;
  },
  async getSectionReadiness(rolloutId, sectionId) {
    const { data } = await api.get(`/api/rollout/${rolloutId}/sections/${sectionId}/readiness`);
    return data;
  },
  async getPacingRecommendations(rolloutId) {
    const { data } = await api.get(`/api/rollout/${rolloutId}/pacing`);
    return data;
  },
  async getStanVelocityPrediction(rolloutId) {
    const { data } = await api.get(`/api/rollout/${rolloutId}/velocity`);
    return data;
  },

  // Release Coordinator
  async getReleaseArchetype() {
    const { data } = await api.get('/api/rollout/release-archetype');
    return data;
  },
  async getSeasonalWindows(startDate, endDate) {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const { data } = await api.get('/api/rollout/seasonal-windows', { params });
    return data;
  },
};

// Content API
export const contentApi = {
  async getAll(params = {}) {
    const { data } = await api.get('/api/content', { params });
    return data;
  },

  async getById(id) {
    const { data } = await api.get(`/api/content/${id}`);
    return data;
  },

  async upload(file, metadata = {}) {
    const formData = new FormData();
    formData.append('media', file);
    Object.entries(metadata).forEach(([key, value]) => {
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
    });

    const { data } = await api.post('/api/content', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async uploadReel(videoFile, thumbnailBlob, metadata = {}) {
    const formData = new FormData();
    formData.append('media', videoFile);
    formData.append('thumbnail', thumbnailBlob, 'thumbnail.jpg');
    Object.entries(metadata).forEach(([key, value]) => {
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
    });

    const { data } = await api.post('/api/content/reel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async update(id, updates) {
    const { data } = await api.put(`/api/content/${id}`, updates);
    return data;
  },

  async delete(id) {
    const { data } = await api.delete(`/api/content/${id}`);
    return data;
  },

  async addVersion(id, versionData) {
    const { data } = await api.post(`/api/content/${id}/versions`, versionData);
    return data;
  },

  async updateMedia(id, file, options = {}) {
    const formData = new FormData();
    formData.append('media', file);
    if (options.thumbnailOnly) {
      formData.append('thumbnailOnly', 'true');
    }

    const { data } = await api.put(`/api/content/${id}/media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async updateMediaFromBlob(id, blob, filename = 'edited-image.png', options = {}) {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    return this.updateMedia(id, file, options);
  },

  async updateMediaFromDataUrl(id, dataUrl, filename = 'edited-image.png', options = {}) {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return this.updateMediaFromBlob(id, blob, filename, options);
  },

  async rate(id, rating) {
    const { data } = await api.put(`/api/content/${id}/rate`, { rating });
    return data;
  },

  async syncClarosa() {
    const { data } = await api.post('/api/content/sync-clarosa');
    return data;
  },
};

// Grid API
export const gridApi = {
  async getAll(profileId = null) {
    const params = profileId ? { profileId } : {};
    const { data } = await api.get('/api/grid', { params });
    return data;
  },

  async getById(id) {
    const { data } = await api.get(`/api/grid/${id}`);
    return data;
  },

  async create(gridData) {
    const { data } = await api.post('/api/grid', gridData);
    return data;
  },

  async update(id, updates) {
    const { data } = await api.put(`/api/grid/${id}`, updates);
    return data;
  },

  async delete(id) {
    const { data } = await api.delete(`/api/grid/${id}`);
    return data;
  },

  async addContent(gridId, contentId, position, columns = 3) {
    let row, col;
    if (typeof position === 'object') {
      row = position.row;
      col = position.col;
    } else {
      row = Math.floor(position / columns);
      col = position % columns;
    }
    const { data } = await api.post(`/api/grid/${gridId}/add-content`, { contentId, row, col });
    return data;
  },

  async removeContent(gridId, contentId) {
    const { data } = await api.post(`/api/grid/${gridId}/remove-content`, { contentId });
    return data;
  },

  async reorder(gridId, items) {
    const { data } = await api.post(`/api/grid/${gridId}/reorder`, { items });
    return data;
  },

  async assignCharacter(gridId, row, col, characterId) {
    const { data } = await api.post(`/api/grid/${gridId}/assign-character`, { row, col, characterId });
    return data;
  },
};

// AI API
export const aiApi = {
  async analyzeContent(contentId) {
    const { data } = await api.post('/api/ai/analyze', { contentId });
    return data;
  },

  async generateCaption(idea, tone = 'casual', options = {}) {
    const { data } = await api.post('/api/alchemy/captions', { idea, tone, ...options });
    return data.captions || [];
  },

  async generateCaptionForContent(contentId, options = {}) {
    const { tone = 'casual', length = 'medium', creatorProfile = null, profileId = null } = options;
    const { data } = await api.post('/api/ai/generate-caption', { contentId, tone, length, creatorProfile, profileId });
    return data.captions || [];
  },

  async generateHashtags(contentId, count = 20) {
    const { data } = await api.post('/api/ai/generate-hashtags', { contentId, count });
    return data.hashtags || [];
  },

  async suggestContentType(contentId) {
    const { data } = await api.post('/api/ai/suggest-type', { contentId });
    return data;
  },

  async generateIdeas(niche, examples = []) {
    const { data } = await api.post('/api/alchemy/ideas', { niche, examples });
    return data.ideas || [];
  },

  async compareVersions(contentId, versionIds) {
    const { data } = await api.post('/api/ai/compare-versions', { contentId, versionIds });
    return data;
  },

  async getOptimalTiming(platform, contentType) {
    const { data } = await api.post('/api/ai/optimal-timing', { platform, contentType });
    return data;
  },

  async upscaleImage(contentId, provider = 'replicate') {
    const { data } = await api.post('/api/ai/upscale', { contentId, provider });
    return data;
  },
};

// Collection/Scheduling API
export const collectionApi = {
  async getAll() {
    const { data } = await api.get('/api/collection');
    return data;
  },

  async getById(id) {
    const { data } = await api.get(`/api/collection/${id}`);
    return data;
  },

  async create(collectionData) {
    const { data } = await api.post('/api/collection', collectionData);
    return data;
  },

  async update(id, updates) {
    const { data } = await api.put(`/api/collection/${id}`, updates);
    return data;
  },

  async delete(id) {
    const { data } = await api.delete(`/api/collection/${id}`);
    return data;
  },

  async schedule(id, scheduleData) {
    const { data } = await api.post(`/api/collection/${id}/schedule`, scheduleData);
    return data;
  },

  async pause(id) {
    const { data } = await api.post(`/api/collection/${id}/pause`);
    return data;
  },

  async resume(id) {
    const { data } = await api.post(`/api/collection/${id}/resume`);
    return data;
  },
};

// Posting API
export const postingApi = {
  async postNow(contentId, platforms, options = {}) {
    const { data } = await api.post('/api/post/now', { contentId, platforms, ...options });
    return data;
  },

  async schedulePost(contentId, platforms, scheduledAt, options = {}) {
    const { data } = await api.post('/api/post/schedule', {
      contentId,
      platforms,
      scheduledAt,
      ...options
    });
    return data;
  },

  async cancelScheduled(postId) {
    const { data } = await api.post(`/api/post/${postId}/cancel`);
    return data;
  },

  async getScheduled() {
    const { data } = await api.get('/api/post/scheduled');
    return data;
  },

  async getHistory(params = {}) {
    const { data } = await api.get('/api/post/history', { params });
    return data;
  },
};

// Platform Connection API
export const platformApi = {
  async getConnections() {
    const { data } = await api.get('/api/auth/connections');
    return data;
  },

  async getConnectionAudit() {
    const { data } = await api.get('/api/auth/connections/audit');
    return data;
  },

  async getInstagramAuthUrl() {
    const { data } = await api.get('/api/auth/instagram');
    return data.url;
  },

  async getTikTokAuthUrl() {
    const { data } = await api.get('/api/auth/tiktok');
    return data.url;
  },

  async disconnect(platform) {
    const { data } = await api.post(`/api/auth/${platform}/disconnect`);
    return data;
  },

  async refreshToken(platform) {
    const { data } = await api.post(`/api/auth/${platform}/refresh`);
    return data;
  },
};

// Profile API
export const profileApi = {
  // Get all profiles for user
  async getAll() {
    const { data } = await api.get('/api/profile');
    return data.profiles || [];
  },

  // Get current/active profile (creates default if needed)
  async getCurrent() {
    const { data } = await api.get('/api/profile/current');
    return data.profile;
  },

  // Get profile by ID
  async getById(id) {
    const { data } = await api.get(`/api/profile/${id}`);
    return data.profile;
  },

  // Create a new profile
  async create(profileData) {
    const { data } = await api.post('/api/profile', profileData);
    return data.profile;
  },

  // Update a profile
  async update(id, updates) {
    const { data } = await api.put(`/api/profile/${id}`, updates);
    return data.profile;
  },

  // Delete a profile
  async delete(id) {
    await api.delete(`/api/profile/${id}`);
  },

  // Activate a profile (set as current working profile)
  async activate(id) {
    const { data } = await api.post(`/api/profile/${id}/activate`);
    return data.profile;
  },

  // Set as default profile
  async setDefault(id) {
    const { data } = await api.post(`/api/profile/${id}/set-default`);
    return data.profile;
  },

  // Get social connection status for a profile
  async getSocialStatus(id) {
    const { data } = await api.get(`/api/profile/${id}/social/status`);
    return data;
  },

  // Instagram connection
  async connectInstagram(profileId) {
    const { data } = await api.post(`/api/profile/${profileId}/instagram/connect`);
    return data.url;
  },

  async useParentInstagram(profileId) {
    const { data } = await api.post(`/api/profile/${profileId}/instagram/use-parent`);
    return data;
  },

  async disconnectInstagram(profileId) {
    const { data } = await api.post(`/api/profile/${profileId}/instagram/disconnect`);
    return data;
  },

  // TikTok connection
  async connectTiktok(profileId) {
    const { data } = await api.post(`/api/profile/${profileId}/tiktok/connect`);
    return data.url;
  },

  async useParentTiktok(profileId) {
    const { data } = await api.post(`/api/profile/${profileId}/tiktok/use-parent`);
    return data;
  },

  async disconnectTiktok(profileId) {
    const { data } = await api.post(`/api/profile/${profileId}/tiktok/disconnect`);
    return data;
  },
};

// Reel Collection API
export const reelCollectionApi = {
  async getAll(platform) {
    const params = platform ? { platform } : {};
    const { data } = await api.get('/api/reel-collections', { params });
    return data.collections || [];
  },

  async get(id) {
    const { data } = await api.get(`/api/reel-collections/${id}`);
    return data.collection;
  },

  async create(collectionData) {
    const { data } = await api.post('/api/reel-collections', collectionData);
    return data.collection;
  },

  async update(id, updates) {
    const { data } = await api.put(`/api/reel-collections/${id}`, updates);
    return data.collection;
  },

  async delete(id) {
    await api.delete(`/api/reel-collections/${id}`);
  },

  async addReel(collectionId, contentId) {
    const { data } = await api.post(`/api/reel-collections/${collectionId}/reel`, { contentId });
    return data.collection;
  },

  async removeReel(collectionId, contentId) {
    const { data } = await api.delete(`/api/reel-collections/${collectionId}/reel`, { data: { contentId } });
    return data.collection;
  },

  async reorderReels(collectionId, reelIds) {
    const { data } = await api.post(`/api/reel-collections/${collectionId}/reorder`, { reelIds });
    return data.collection;
  },

  async bulkAddReels(collectionId, contentIds) {
    const { data } = await api.post(`/api/reel-collections/${collectionId}/bulk-add`, { contentIds });
    return data.collection;
  },
};

// Character API - Boveda characters via proxy + generation
export const characterApi = {
  async getAll() {
    const { data } = await api.get('/api/boveda/characters');
    return data.characters || [];
  },

  // Generate content in a character's voice (character data passed inline)
  async generate(character, options = {}) {
    const { data } = await api.post('/api/characters/generate', { character, ...options });
    return data;
  },
};

// Intelligence API - AI content scoring and generation
export const intelligenceApi = {
  // Analyze content and extract DNA patterns
  async analyze(content) {
    const { data } = await api.post('/api/intelligence/analyze', content);
    return data;
  },

  // Score content against taste profile
  async score(content, profileId = null) {
    const { data } = await api.post('/api/intelligence/score', { content, profileId });
    return data;
  },

  // Generate content variants in creator's voice
  async generate(topic, options = {}) {
    const { data } = await api.post('/api/intelligence/generate', { topic, ...options });
    return data;
  },

  // Get user's taste profile
  async getProfile(profileId = null) {
    const params = profileId ? `?profileId=${profileId}` : '';
    const { data } = await api.get(`/api/intelligence/profile${params}`);
    return data;
  },

  // Update taste profile with performance data
  async updateProfile(contentId, actualMetrics, profileId = null) {
    const { data } = await api.post('/api/intelligence/profile/update', {
      contentId,
      actualMetrics,
      profileId
    });
    return data;
  },

  // Analyze why content performed well or poorly
  async analyzePerformance(contentId, actualMetrics) {
    const { data } = await api.post('/api/intelligence/performance', {
      contentId,
      actualMetrics
    });
    return data;
  },

  // Get trending topics in niche
  async getTrending(niche = 'general', platform = 'instagram') {
    const { data } = await api.get(`/api/intelligence/trending?niche=${niche}&platform=${platform}`);
    return data;
  },

  // Batch score multiple content items
  async batchScore(contentIds, profileId = null) {
    const { data } = await api.post('/api/intelligence/batch-score', { contentIds, profileId });
    return data;
  },

  // Rate a generated content variant (Refyn-style taste learning)
  async rate(content, rating, feedback = {}, context = {}, wasApplied = false, profileId = null) {
    const { data } = await api.post('/api/intelligence/rate', {
      content,
      rating,
      feedback,
      context,
      wasApplied,
      profileId
    });
    return data;
  },

  // Get rating history and stats
  async getRatings(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    if (options.platform) params.append('platform', options.platform);
    if (options.minRating) params.append('minRating', options.minRating);
    const { data } = await api.get(`/api/intelligence/ratings?${params.toString()}`);
    return data;
  },

  // Generate YouTube content (titles, descriptions, tags)
  async generateYouTube(topic, options = {}) {
    const { data } = await api.post('/api/intelligence/generate-youtube', { topic, ...options });
    return data;
  }
};

// Conviction API - Scoring and gating
export const convictionApi = {
  async calculateSingle(contentId, profileId) {
    const { data } = await api.post('/api/conviction/calculate', {
      contentId, profileId
    });
    return data;
  },

  async batchCalculate(contentIds, profileId) {
    const { data } = await api.post('/api/conviction/batch-calculate', {
      contentIds, profileId
    });
    return data;
  },

  async getStats(profileId) {
    const { data } = await api.get('/api/conviction/stats', {
      params: { profileId }
    });
    return data;
  },

  async checkGating(contentId, threshold, strictMode = false) {
    const { data } = await api.post('/api/conviction/check-gating', {
      contentId, threshold, strictMode
    });
    return data;
  },

  async getReport(contentId, profileId) {
    const { data } = await api.get(`/api/conviction/report/${contentId}`, {
      params: { profileId }
    });
    return data;
  },

  // Audience Depth Score
  async getAudienceDepth(contentId) {
    const { data } = await api.get(`/api/conviction/audience-depth/${contentId}`);
    return data;
  },

  async refreshAudienceDepth(contentId) {
    const { data } = await api.post(`/api/conviction/audience-depth/${contentId}/refresh`);
    return data;
  },

  async getAudienceDepthStats() {
    const { data } = await api.get('/api/conviction/audience-depth-stats');
    return data;
  },

  async getAccuracyStats() {
    const { data } = await api.get('/api/conviction/accuracy-stats');
    return data;
  }
};

// Template API - Designer Vault
export const templateApi = {
  async createFromGrid(gridId, templateData) {
    const { data } = await api.post('/api/templates/create-from-grid', {
      gridId,
      ...templateData
    });
    return data;
  },

  async applyTemplate(templateId, contentIds) {
    const { data } = await api.post(`/api/templates/apply/${templateId}`, {
      contentIds
    });
    return data;
  },

  async getMyTemplates(filters = {}) {
    const { data } = await api.get('/api/templates/my-templates', { params: filters });
    return data.templates || [];
  },

  async getPublicLibrary(filters = {}) {
    const { data } = await api.get('/api/templates/library', { params: filters });
    return data.templates || [];
  },

  async getById(templateId) {
    const { data } = await api.get(`/api/templates/${templateId}`);
    return data.template;
  },

  async update(templateId, updates) {
    const { data } = await api.put(`/api/templates/${templateId}`, updates);
    return data.template;
  },

  async delete(templateId) {
    const { data } = await api.delete(`/api/templates/${templateId}`);
    return data;
  },

  async rate(templateId, rating) {
    const { data} = await api.post(`/api/templates/${templateId}`, { rating });
    return data.template;
  },

  async getStats() {
    const { data } = await api.get('/api/templates/stats/summary');
    return data;
  }
};

// Performance API - Conviction Loop (Performance Tracking & Genome Feedback)
export const performanceApi = {
  async fetchMetrics(contentId) {
    const { data } = await api.post(`/api/performance/fetch/${contentId}`);
    return data;
  },

  async validateConviction(contentId) {
    const { data } = await api.post(`/api/performance/validate/${contentId}`);
    return data;
  },

  async applyFeedback(validation, profileId) {
    const { data } = await api.post('/api/performance/apply-feedback', {
      validation,
      profileId
    });
    return data;
  },

  async processLoop(contentId, profileId) {
    const { data } = await api.post(`/api/performance/process-loop/${contentId}`, {
      profileId
    });
    return data;
  },

  async batchFetch(contentIds) {
    const { data } = await api.post('/api/performance/batch-fetch', {
      contentIds
    });
    return data;
  },

  async getLearningProgress(profileId) {
    const { data } = await api.get(`/api/performance/learning-progress?profileId=${profileId}`);
    return data;
  },

  async getValidationHistory(profileId, options = {}) {
    const { data } = await api.get(`/api/performance/validations/${profileId}`, {
      params: options // timeRange, limit, offset
    });
    return data;
  },

  async getGenomeHistory(profileId, options = {}) {
    const { data } = await api.get(`/api/performance/genome-history/${profileId}`, {
      params: options // timeRange
    });
    return data;
  },

  async resetLearning(profileId) {
    const { data } = await api.post(`/api/performance/reset-learning/${profileId}`);
    return data;
  }
};

export default api;
