const YoutubeCollection = require('../models/YoutubeCollection');
const YoutubeVideo = require('../models/YoutubeVideo');
const MuxUploadSession = require('../models/MuxUploadSession');
const { validateObjectId } = require('../utils/validators');
const cloudinaryService = require('../services/cloudinaryService');
const muxService = require('../services/muxService');
const {
  buildMuxVideoUpdates,
  serializeYoutubeVideo,
  syncYoutubeVideo,
} = require('../services/muxVideoService');
const youtubeTitleService = require('../services/youtubeTitleService');
const path = require('path');

const getApiOrigin = () =>
  `${process.env.API_URL || process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`}`.replace(/\/+$/, '');

const normalizeScheduledDate = (scheduledDate) => {
  if (scheduledDate === undefined) return undefined;
  if (!scheduledDate) return null;

  const parsed = new Date(scheduledDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const VALID_PRIVACY_STATUSES = new Set(['private', 'unlisted', 'public']);
const VALID_END_SCREEN_TEMPLATES = new Set(['video_subscribe', 'playlist_subscribe', 'series_push', 'none']);

const normalizePrivacyStatus = (privacyStatus) => {
  if (privacyStatus === undefined) {
    return undefined;
  }

  return VALID_PRIVACY_STATUSES.has(privacyStatus) ? privacyStatus : null;
};

const normalizeEndScreenTemplate = (endScreenTemplate) => {
  if (endScreenTemplate === undefined) {
    return undefined;
  }

  return VALID_END_SCREEN_TEMPLATES.has(endScreenTemplate) ? endScreenTemplate : null;
};

const resolveThumbnailMode = (thumbnailMode, thumbnailUrl = '') => {
  if (thumbnailMode === 'custom' || thumbnailMode === 'auto') {
    return thumbnailMode;
  }
  return thumbnailUrl ? 'custom' : 'auto';
};

const resolveThumbnailStatus = ({ thumbnailStatus, thumbnailMode, thumbnailUrl = '' }) => {
  if (['missing', 'auto', 'custom', 'needs_custom'].includes(thumbnailStatus)) {
    return thumbnailStatus;
  }
  if (!thumbnailUrl) return 'missing';
  return thumbnailMode === 'custom' ? 'custom' : 'auto';
};

const getThumbnailSourceFilename = (payload = {}) => {
  const explicit = typeof payload.thumbnailSourceFilename === 'string'
    ? payload.thumbnailSourceFilename.trim()
    : '';
  if (explicit) return explicit;

  const original = typeof payload.originalFilename === 'string'
    ? payload.originalFilename.trim()
    : '';
  return original || undefined;
};

const normalizeFeaturingArtists = (input) => {
  if (input === undefined) {
    return undefined;
  }

  const values = Array.isArray(input)
    ? input
    : String(input || '')
      .split(',');

  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )].slice(0, 12);
};

const buildUploadedVideoUrl = (file) => {
  if (!file) return '';

  if (file.path) {
    return `${getApiOrigin()}/uploads/${path.basename(file.path)}`;
  }

  return '';
};

const serializeVideoRecord = async (video) => {
  await syncYoutubeVideo(video, { requestMasterAccess: true });
  return serializeYoutubeVideo(video);
};

const serializeVideoCollection = async (videos = []) =>
  Promise.all(videos.map((video) => serializeVideoRecord(video)));

const getUploadSessionState = ({ upload, asset }) => {
  if (upload?.status === 'errored' || asset?.status === 'errored') {
    return 'errored';
  }
  if (asset?.status === 'ready' && asset?.master?.url) {
    return 'ready';
  }
  if (asset?.id) {
    return 'processing';
  }
  if (upload?.asset_id) {
    return 'asset_created';
  }
  return upload?.status || 'waiting';
};

/**
 * Upload base64 thumbnail to Cloudinary
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} userId - User ID for folder organization
 * @returns {Promise<string>} Cloudinary URL
 */
/**
 * Upload base64 thumbnail to Cloudinary.
 * Returns { url, originalUrl } — url is the CDN link, originalUrl is the
 * permanent uncompressed reference (same upload, but stored for re-export).
 */
const uploadThumbnailToCloudinary = async (base64Data, userId) => {
  if (!base64Data || !base64Data.startsWith('data:')) {
    return { url: base64Data, originalUrl: null };
  }

  if (!cloudinaryService.isConfigured()) {
    console.warn('Cloudinary not configured, storing thumbnail as base64');
    return { url: base64Data, originalUrl: null };
  }

  try {
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    // Upload to Cloudinary (no transformation — stores the full 1920x1080 source)
    const result = await cloudinaryService.uploadBuffer(buffer, {
      folder: `slayt/youtube/${userId}`,
      resource_type: 'image',
    });

    return { url: result.secure_url, originalUrl: result.secure_url };
  } catch (error) {
    console.error('Failed to upload thumbnail to Cloudinary:', error);
    return { url: base64Data, originalUrl: null };
  }
};

/**
 * YouTube Collection Controllers
 */

// Create a new collection
exports.createCollection = async (req, res) => {
  try {
    const { name, color, tags, folder, position, themePrompt, folderThemePrompt, descriptionTemplate } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    const collection = new YoutubeCollection({
      userId: req.user._id,
      name: name.trim(),
      color: color || '#6366f1',
      tags: tags || [],
      themePrompt: themePrompt || '',
      folderThemePrompt: folderThemePrompt || '',
      descriptionTemplate: typeof descriptionTemplate === 'string' ? descriptionTemplate : undefined,
      folder: folder || null,
      position: position || 0
    });

    await collection.save();

    res.status(201).json({
      message: 'YouTube collection created successfully',
      collection
    });
  } catch (error) {
    console.error('Create YouTube collection error:', error);
    res.status(500).json({
      error: 'Failed to create collection',
      details: error.message
    });
  }
};

// Get all collections for user
exports.getCollections = async (req, res) => {
  try {
    const collections = await YoutubeCollection.find({ userId: req.user._id })
      .sort({ updatedAt: -1 });

    // Get video counts for each collection
    const collectionsWithCounts = await Promise.all(
      collections.map(async (collection) => {
        const videoCount = await YoutubeVideo.countDocuments({
          collectionId: collection._id,
          userId: req.user._id
        });
        return {
          ...collection.toObject(),
          videoCount
        };
      })
    );

    res.json({
      collections: collectionsWithCounts,
      count: collectionsWithCounts.length
    });
  } catch (error) {
    console.error('Get YouTube collections error:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
};

// Get single collection by ID
exports.getCollection = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Get videos in this collection
    const videos = await YoutubeVideo.find({
      collectionId: id,
      userId: req.user._id
    }).sort({ position: 1 });

    res.json({
      collection: {
        ...collection.toObject(),
        videos: await serializeVideoCollection(videos)
      }
    });
  } catch (error) {
    console.error('Get YouTube collection error:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
};

// Update collection
exports.updateCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'color', 'tags', 'themePrompt', 'folderThemePrompt', 'descriptionTemplate', 'rolloutId', 'sectionId', 'folder', 'position', 'cruciblaProjectId', 'cruciblaProjectName', 'cruciblaProjectType', 'cruciblaEra', 'cruciblaAlbum', 'cruciblaAlbumColor'];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        collection[field] = updates[field];
      }
    });

    await collection.save();

    res.json({
      message: 'Collection updated successfully',
      collection
    });
  } catch (error) {
    console.error('Update YouTube collection error:', error);
    res.status(500).json({ error: 'Failed to update collection' });
  }
};

exports.scheduleCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { entries } = req.body || {};

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Schedule entries are required' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const normalizedEntries = [];
    const seenVideoIds = new Set();

    for (const entry of entries) {
      if (!entry?.videoId || !validateObjectId(entry.videoId)) {
        return res.status(400).json({ error: 'Each schedule entry must include a valid video ID' });
      }

      if (seenVideoIds.has(entry.videoId)) {
        return res.status(400).json({ error: 'Duplicate video IDs are not allowed in a collection schedule request' });
      }

      const resolvedScheduledDate = normalizeScheduledDate(entry.scheduledDate);
      if (!resolvedScheduledDate) {
        return res.status(400).json({ error: 'Each schedule entry must include a valid scheduled date' });
      }

      seenVideoIds.add(entry.videoId);
      normalizedEntries.push({
        videoId: entry.videoId,
        scheduledDate: resolvedScheduledDate,
      });
    }

    const scheduledVideos = await YoutubeVideo.find({
      _id: { $in: normalizedEntries.map((entry) => entry.videoId) },
      collectionId: id,
      userId: req.user._id,
    }).select('_id status');

    if (scheduledVideos.length !== normalizedEntries.length) {
      return res.status(404).json({ error: 'One or more videos could not be found in this collection' });
    }

    const updatedAt = new Date();
    await YoutubeVideo.bulkWrite(
      normalizedEntries.map((entry) => ({
        updateOne: {
          filter: {
            _id: entry.videoId,
            collectionId: id,
            userId: req.user._id,
          },
          update: {
            $set: {
              scheduledDate: entry.scheduledDate,
              status: 'scheduled',
              updatedAt,
            },
          },
        },
      })),
    );

    const videos = await YoutubeVideo.find({
      collectionId: id,
      userId: req.user._id,
    }).sort({ position: 1 });

    res.json({
      message: 'Collection scheduled successfully',
      scheduledCount: normalizedEntries.length,
      videos: await serializeVideoCollection(videos),
    });
  } catch (error) {
    console.error('Schedule YouTube collection error:', error);
    res.status(500).json({ error: 'Failed to schedule collection' });
  }
};

// Delete collection
exports.deleteCollection = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collection = await YoutubeCollection.findOneAndDelete({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Also delete all videos in this collection
    await YoutubeVideo.deleteMany({
      collectionId: id,
      userId: req.user._id
    });

    res.json({ message: 'Collection and its videos deleted successfully' });
  } catch (error) {
    console.error('Delete YouTube collection error:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
};

/**
 * YouTube Video Controllers
 */

// Create a new video
exports.createVideo = async (req, res) => {
  try {
    const {
      title,
      description,
      thumbnail,
      thumbnailOriginalUrl: providedThumbnailOriginalUrl,
      collectionId,
      status,
      privacyStatus,
      scheduledDate,
      position,
      tags,
      originalFilename,
      thumbnailSourceFilename,
      thumbnailMode,
      thumbnailStatus,
      storageProvider,
      videoUrl,
      videoFileName,
      videoFileSize,
      videoMimeType,
      durationSeconds,
      muxUploadId,
      muxUploadStatus,
      muxAssetId,
      muxAssetStatus,
      muxMasterStatus,
      muxMasterAccessExpiresAt,
      artistName,
      featuringArtists,
      endScreenTemplate,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Video title is required' });
    }

    // Validate collectionId if provided
    if (collectionId && !validateObjectId(collectionId)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    // Verify collection belongs to user if provided
    if (collectionId) {
      const collection = await YoutubeCollection.findOne({
        _id: collectionId,
        userId: req.user._id
      });

      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
    }

    // Get the next position if in a collection
    let videoPosition = position;
    if (collectionId && videoPosition === undefined) {
      const lastVideo = await YoutubeVideo.findOne({
        collectionId,
        userId: req.user._id
      }).sort({ position: -1 });
      videoPosition = lastVideo ? lastVideo.position + 1 : 0;
    }

    // Upload thumbnail to Cloudinary if it's base64
    let thumbnailUrl = thumbnail || '';
    let thumbnailOriginalUrl = providedThumbnailOriginalUrl || null;
    if (thumbnail && thumbnail.startsWith('data:')) {
      const result = await uploadThumbnailToCloudinary(thumbnail, req.user._id.toString());
      thumbnailUrl = result.url;
      thumbnailOriginalUrl = result.originalUrl;
    }

    const resolvedThumbnailMode = resolveThumbnailMode(thumbnailMode, thumbnailUrl);
    const resolvedThumbnailStatus = resolveThumbnailStatus({
      thumbnailStatus,
      thumbnailMode: resolvedThumbnailMode,
      thumbnailUrl,
    });
    const resolvedScheduledDate = normalizeScheduledDate(scheduledDate);
    if (scheduledDate && !resolvedScheduledDate) {
      return res.status(400).json({ error: 'Invalid scheduled date' });
    }
    const resolvedPrivacyStatus = normalizePrivacyStatus(privacyStatus);
    if (privacyStatus !== undefined && !resolvedPrivacyStatus) {
      return res.status(400).json({ error: 'Invalid privacy status' });
    }
    const resolvedEndScreenTemplate = normalizeEndScreenTemplate(endScreenTemplate);
    if (endScreenTemplate !== undefined && !resolvedEndScreenTemplate) {
      return res.status(400).json({ error: 'Invalid end screen template' });
    }
    const resolvedFeaturingArtists = normalizeFeaturingArtists(featuringArtists);

    const video = new YoutubeVideo({
      userId: req.user._id,
      title: title.trim(),
      description: description || '',
      thumbnail: thumbnailUrl,
      thumbnailOriginalUrl,
      thumbnailMode: resolvedThumbnailMode,
      thumbnailStatus: resolvedThumbnailStatus,
      collectionId: collectionId || null,
      status: status || 'draft',
      privacyStatus: resolvedPrivacyStatus || 'public',
      endScreenTemplate: resolvedEndScreenTemplate || 'video_subscribe',
      scheduledDate: resolvedScheduledDate || null,
      position: videoPosition || 0,
      tags: tags || [],
      originalFilename: originalFilename || undefined,
      thumbnailSourceFilename: getThumbnailSourceFilename({ originalFilename, thumbnailSourceFilename }),
      storageProvider: storageProvider || (muxAssetId || muxUploadId ? 'mux' : 'legacy'),
      videoUrl: videoUrl || undefined,
      videoFileName: videoFileName || undefined,
      videoFileSize: videoFileSize || undefined,
      videoMimeType: videoMimeType || undefined,
      durationSeconds: durationSeconds || undefined,
      muxUploadId: muxUploadId || undefined,
      muxUploadStatus: muxUploadStatus || undefined,
      muxAssetId: muxAssetId || undefined,
      muxAssetStatus: muxAssetStatus || undefined,
      muxMasterStatus: muxMasterStatus || undefined,
      muxMasterAccessExpiresAt: muxMasterAccessExpiresAt || undefined,
      artistName: artistName || '',
      featuringArtists: resolvedFeaturingArtists || [],
    });

    await video.save();

    res.status(201).json({
      message: 'Video created successfully',
      video: await serializeVideoRecord(video)
    });
  } catch (error) {
    console.error('Create YouTube video error:', error);
    res.status(500).json({
      error: 'Failed to create video',
      details: error.message
    });
  }
};

exports.createUploadUrl = async (req, res) => {
  try {
    if (!muxService.isConfigured()) {
      return res.status(409).json({
        error: 'Mux direct uploads are not configured',
      });
    }

    const {
      fileName,
      fileSize,
      mimeType,
    } = req.body || {};

    if (!fileName || !String(fileName).trim()) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const upload = await muxService.createDirectUpload({
      filename: fileName,
      corsOrigin: muxService.getClientOrigin(),
    });

    await MuxUploadSession.create({
      userId: req.user._id,
      uploadId: upload.id,
      status: upload.status || 'waiting',
      originalFilename: String(fileName).trim(),
      mimeType: mimeType || '',
      fileSize: Number(fileSize) || undefined,
    });

    res.status(201).json({
      message: 'Direct upload created successfully',
      provider: 'mux',
      upload: {
        id: upload.id,
        uploadId: upload.id,
        url: upload.url,
        timeout: upload.timeout || undefined,
        status: upload.status || 'waiting',
      },
    });
  } catch (error) {
    console.error('Create Mux direct upload error:', error);
    res.status(500).json({
      error: 'Failed to create direct upload',
      details: error.message,
    });
  }
};

exports.getUploadStatus = async (req, res) => {
  try {
    const { uploadId } = req.params;

    const session = await MuxUploadSession.findOne({
      uploadId,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    let upload = null;
    let asset = null;

    if (muxService.isConfigured()) {
      upload = await muxService.getUpload(session.uploadId);
      if (upload?.asset_id) {
        session.assetId = upload.asset_id;
      }

      if (session.assetId) {
        asset = await muxService.getAsset(session.assetId);
        if (asset?.status === 'ready' && !asset?.master?.url && asset?.master?.status !== 'preparing') {
          asset = await muxService.enableTemporaryMasterAccess(session.assetId);
        }
      }
    }

    const muxFields = buildMuxVideoUpdates({
      upload,
      asset,
      currentVideo: {},
    });

    session.status = getUploadSessionState({ upload, asset });
    if (session.status === 'errored') {
      session.errorMessage = asset?.errors?.messages?.join(', ') || upload?.error || session.errorMessage || 'Mux processing failed';
    } else {
      session.errorMessage = '';
    }
    await session.save();

    const assetRecord = serializeYoutubeVideo({
      storageProvider: 'mux',
      ...muxFields,
      videoFileName: session.originalFilename || '',
      videoFileSize: session.fileSize || undefined,
      videoMimeType: session.mimeType || '',
      durationSeconds: muxFields.durationSeconds || undefined,
    });

    res.json({
      upload: {
        id: session.uploadId,
        uploadId: session.uploadId,
        assetId: session.assetId || null,
        status: session.status,
        errorMessage: session.errorMessage || '',
      },
      asset: assetRecord,
    });
  } catch (error) {
    console.error('Get Mux upload status error:', error);
    res.status(500).json({
      error: 'Failed to fetch upload status',
      details: error.message,
    });
  }
};

exports.uploadVideoAsset = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    let uploadedVideoUrl = '';
    let durationSeconds = null;

    if (req.file.buffer && cloudinaryService.isConfigured()) {
      const result = await cloudinaryService.uploadBuffer(req.file.buffer, {
        folder: `slayt/youtube/${req.user._id.toString()}/videos`,
        resourceType: 'video',
      });
      uploadedVideoUrl = result.secure_url;
      durationSeconds = typeof result.duration === 'number' ? result.duration : null;
    } else {
      uploadedVideoUrl = buildUploadedVideoUrl(req.file);
    }

    res.status(201).json({
      message: 'Video asset uploaded successfully',
      asset: serializeYoutubeVideo({
        storageProvider: 'legacy',
        videoUrl: uploadedVideoUrl,
        videoFileName: req.file.originalname,
        videoFileSize: req.file.size,
        videoMimeType: req.file.mimetype,
        durationSeconds,
      }),
    });
  } catch (error) {
    console.error('Upload YouTube video asset error:', error);
    res.status(500).json({
      error: 'Failed to upload video asset',
      details: error.message,
    });
  }
};

// Get videos (with optional collection filter)
exports.getVideos = async (req, res) => {
  try {
    const { collectionId, status } = req.query;

    const filter = { userId: req.user._id };

    if (collectionId) {
      if (!validateObjectId(collectionId)) {
        return res.status(400).json({ error: 'Invalid collection ID' });
      }
      filter.collectionId = collectionId;
    }

    if (status) {
      filter.status = status;
    }

    const videos = await YoutubeVideo.find(filter)
      .sort({ position: 1, createdAt: -1 });

    res.json({
      videos: await serializeVideoCollection(videos),
      count: videos.length
    });
  } catch (error) {
    console.error('Get YouTube videos error:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
};

// Get single video by ID
exports.getVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const video = await YoutubeVideo.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ video: await serializeVideoRecord(video) });
  } catch (error) {
    console.error('Get YouTube video error:', error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
};

// Update video
exports.updateVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const video = await YoutubeVideo.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Validate new collectionId if provided
    if (updates.collectionId && updates.collectionId !== video.collectionId?.toString()) {
      if (!validateObjectId(updates.collectionId)) {
        return res.status(400).json({ error: 'Invalid collection ID' });
      }

      const collection = await YoutubeCollection.findOne({
        _id: updates.collectionId,
        userId: req.user._id
      });

      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
    }

    // Upload new thumbnail to Cloudinary if it's base64
    if (updates.thumbnail && updates.thumbnail.startsWith('data:')) {
      const base64Data = updates.thumbnail;
      const videoId = video._id;
      const userId = req.user._id.toString();

      // Save base64 immediately — respond fast, upload to Cloudinary in background
      // User sees thumbnail instantly; Cloudinary URL replaces it async
      setImmediate(() => {
        uploadThumbnailToCloudinary(base64Data, userId)
          .then(({ url, originalUrl }) => {
            if (url !== base64Data) {
              const $set = { thumbnail: url };
              if (originalUrl) $set.thumbnailOriginalUrl = originalUrl;
              YoutubeVideo.updateOne(
                { _id: videoId, thumbnail: base64Data },
                { $set }
              ).catch(err => console.error('Failed to persist Cloudinary URL:', err));
            }
          })
          .catch(err => console.error('Background Cloudinary upload failed:', err));
      });
      // Keep base64 as thumbnail for now (gets saved below)
    }

    // Validate title if being updated (required field)
    if (updates.title !== undefined && !updates.title.trim()) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }

    const resolvedThumbnailSourceFilename = getThumbnailSourceFilename(updates);
    if (resolvedThumbnailSourceFilename) {
      updates.thumbnailSourceFilename = resolvedThumbnailSourceFilename;
    }

    if (updates.scheduledDate !== undefined) {
      const resolvedScheduledDate = normalizeScheduledDate(updates.scheduledDate);
      if (updates.scheduledDate && !resolvedScheduledDate) {
        return res.status(400).json({ error: 'Invalid scheduled date' });
      }
      updates.scheduledDate = resolvedScheduledDate;
    }

    if (updates.privacyStatus !== undefined) {
      const resolvedPrivacyStatus = normalizePrivacyStatus(updates.privacyStatus);
      if (!resolvedPrivacyStatus) {
        return res.status(400).json({ error: 'Invalid privacy status' });
      }
      updates.privacyStatus = resolvedPrivacyStatus;
    }

    if (updates.endScreenTemplate !== undefined) {
      const resolvedEndScreenTemplate = normalizeEndScreenTemplate(updates.endScreenTemplate);
      if (!resolvedEndScreenTemplate) {
        return res.status(400).json({ error: 'Invalid end screen template' });
      }
      updates.endScreenTemplate = resolvedEndScreenTemplate;
    }

    if (updates.featuringArtists !== undefined) {
      updates.featuringArtists = normalizeFeaturingArtists(updates.featuringArtists);
    }

    if (updates.thumbnail !== undefined || updates.thumbnailMode !== undefined || updates.thumbnailStatus !== undefined) {
      const nextThumbnail = updates.thumbnail !== undefined ? updates.thumbnail : video.thumbnail;
      const nextMode = resolveThumbnailMode(updates.thumbnailMode || video.thumbnailMode, nextThumbnail);
      updates.thumbnailMode = nextMode;
      updates.thumbnailStatus = resolveThumbnailStatus({
        thumbnailStatus: updates.thumbnailStatus,
        thumbnailMode: nextMode,
        thumbnailUrl: nextThumbnail,
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'title',
      'description',
      'thumbnail',
      'thumbnailOriginalUrl',
      'thumbnailMode',
      'thumbnailStatus',
      'collectionId',
      'status',
      'privacyStatus',
      'endScreenTemplate',
      'scheduledDate',
      'position',
      'tags',
      'storageProvider',
      'videoUrl',
      'videoFileName',
      'videoFileSize',
      'videoMimeType',
      'durationSeconds',
      'muxUploadId',
      'muxUploadStatus',
      'muxAssetId',
      'muxAssetStatus',
      'muxMasterStatus',
      'muxMasterAccessExpiresAt',
      'artistName',
      'featuringArtists',
      'originalFilename',
      'thumbnailSourceFilename',
      'publishedAt',
      'youtubeVideoId',
      'youtubeVideoUrl',
      'lastError',
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        video[field] = updates[field];
      }
    });

    await video.save();

    res.json({
      message: 'Video updated successfully',
      video: await serializeVideoRecord(video)
    });
  } catch (error) {
    console.error('Update YouTube video error:', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
};

// Suggest themed titles for uploaded assets or existing videos
exports.suggestTitles = async (req, res) => {
  try {
    const {
      collectionId,
      prompt = '',
      folder = '',
      collectionName = '',
      files = [],
    } = req.body;

    let resolvedCollection = null;
    if (collectionId) {
      if (!validateObjectId(collectionId)) {
        return res.status(400).json({ error: 'Invalid collection ID' });
      }

      resolvedCollection = await YoutubeCollection.findOne({
        _id: collectionId,
        userId: req.user._id
      });

      if (!resolvedCollection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
    }

    const suggestions = await youtubeTitleService.suggestTitles({
      prompt: prompt || resolvedCollection?.themePrompt || resolvedCollection?.folderThemePrompt || '',
      collectionName: collectionName || resolvedCollection?.name || '',
      folder: folder || resolvedCollection?.folder || '',
      files,
    });

    res.json({ suggestions });
  } catch (error) {
    console.error('Suggest YouTube titles error:', error);
    res.status(500).json({ error: 'Failed to suggest titles' });
  }
};

// Delete video
exports.deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const video = await YoutubeVideo.findOneAndDelete({
      _id: id,
      userId: req.user._id
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete YouTube video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};

// Reorder videos in a collection
exports.reorderVideos = async (req, res) => {
  try {
    const { collectionId, videoIds } = req.body;

    if (!collectionId || !validateObjectId(collectionId)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Video IDs array is required' });
    }

    // Verify collection belongs to user
    const collection = await YoutubeCollection.findOne({
      _id: collectionId,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Update positions for all videos
    const updatePromises = videoIds.map((videoId, index) => {
      if (!validateObjectId(videoId)) {
        throw new Error(`Invalid video ID: ${videoId}`);
      }
      return YoutubeVideo.findOneAndUpdate(
        { _id: videoId, userId: req.user._id, collectionId },
        { position: index },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    // Fetch updated videos
    const videos = await YoutubeVideo.find({
      collectionId,
      userId: req.user._id
    }).sort({ position: 1 });

    res.json({
      message: 'Videos reordered successfully',
      videos: await serializeVideoCollection(videos)
    });
  } catch (error) {
    console.error('Reorder YouTube videos error:', error);
    res.status(500).json({ error: 'Failed to reorder videos' });
  }
};

/**
 * Collection Version Controllers
 */

// Save a version (snapshot) of the current collection state
exports.saveVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Cap at 20 versions
    if (collection.versions && collection.versions.length >= 20) {
      return res.status(400).json({ error: 'Maximum of 20 versions reached. Delete an older version first.' });
    }

    // Fetch current videos in this collection
    const videos = await YoutubeVideo.find({
      collectionId: id,
      userId: req.user._id
    }).sort({ position: 1 });

    const versionName = name || `v${(collection.versions?.length || 0) + 1}`;

    const snapshot = {
      name: versionName,
      savedAt: new Date(),
      videos: videos.map(v => ({
        videoId: v._id,
        title: v.title,
        description: v.description || '',
        thumbnail: v.thumbnail || '',
        thumbnailOriginalUrl: v.thumbnailOriginalUrl || '',
        originalFilename: v.originalFilename || '',
        thumbnailSourceFilename: v.thumbnailSourceFilename || '',
        position: v.position,
        status: v.status,
        artistName: v.artistName || '',
        featuringArtists: v.featuringArtists || [],
        endScreenTemplate: v.endScreenTemplate || 'video_subscribe',
      }))
    };

    if (!collection.versions) {
      collection.versions = [];
    }
    collection.versions.push(snapshot);
    await collection.save();

    res.status(201).json({
      message: 'Version saved successfully',
      version: {
        name: snapshot.name,
        savedAt: snapshot.savedAt,
        videoCount: snapshot.videos.length
      },
      index: collection.versions.length - 1
    });
  } catch (error) {
    console.error('Save version error:', error);
    res.status(500).json({ error: 'Failed to save version' });
  }
};

// Get list of versions for a collection
exports.getVersions = async (req, res) => {
  try {
    const { id } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const versions = (collection.versions || []).map((v, i) => ({
      index: i,
      name: v.name,
      savedAt: v.savedAt,
      videoCount: v.videos?.length || 0
    }));

    res.json({ versions });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
};

// Restore a version — update existing videos to match snapshot
exports.restoreVersion = async (req, res) => {
  try {
    const { id, index } = req.params;
    const versionIndex = parseInt(index, 10);

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    if (isNaN(versionIndex) || versionIndex < 0) {
      return res.status(400).json({ error: 'Invalid version index' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    if (!collection.versions || versionIndex >= collection.versions.length) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const version = collection.versions[versionIndex];

    // Update each video that still exists
    for (const snap of version.videos) {
      await YoutubeVideo.findOneAndUpdate(
        { _id: snap.videoId, userId: req.user._id, collectionId: id },
        {
          title: snap.title,
          description: snap.description,
          thumbnail: snap.thumbnail || '',
          thumbnailOriginalUrl: snap.thumbnailOriginalUrl || '',
          originalFilename: snap.originalFilename || '',
          thumbnailSourceFilename: snap.thumbnailSourceFilename || '',
          position: snap.position,
          status: snap.status,
          artistName: snap.artistName || '',
          featuringArtists: snap.featuringArtists || [],
          endScreenTemplate: snap.endScreenTemplate || 'video_subscribe',
        }
      );
    }

    // Fetch updated videos
    const videos = await YoutubeVideo.find({
      collectionId: id,
      userId: req.user._id
    }).sort({ position: 1 });

    res.json({
      message: 'Version restored successfully',
      videos: await serializeVideoCollection(videos)
    });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
};

// Delete a version by index
exports.deleteVersion = async (req, res) => {
  try {
    const { id, index } = req.params;
    const versionIndex = parseInt(index, 10);

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }

    if (isNaN(versionIndex) || versionIndex < 0) {
      return res.status(400).json({ error: 'Invalid version index' });
    }

    const collection = await YoutubeCollection.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    if (!collection.versions || versionIndex >= collection.versions.length) {
      return res.status(404).json({ error: 'Version not found' });
    }

    collection.versions.splice(versionIndex, 1);
    await collection.save();

    res.json({ message: 'Version deleted successfully' });
  } catch (error) {
    console.error('Delete version error:', error);
    res.status(500).json({ error: 'Failed to delete version' });
  }
};

module.exports = exports;
