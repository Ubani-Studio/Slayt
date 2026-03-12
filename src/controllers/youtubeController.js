const YoutubeCollection = require('../models/YoutubeCollection');
const YoutubeVideo = require('../models/YoutubeVideo');
const { validateObjectId } = require('../utils/validators');
const cloudinaryService = require('../services/cloudinaryService');

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
    const { name, color, tags, folder, position } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Collection name is required' });
    }

    const collection = new YoutubeCollection({
      userId: req.user._id,
      name: name.trim(),
      color: color || '#6366f1',
      tags: tags || [],
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
        videos
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
    const allowedUpdates = ['name', 'color', 'tags', 'rolloutId', 'sectionId', 'folder', 'position', 'cruciblaProjectId', 'cruciblaProjectName', 'cruciblaProjectType', 'cruciblaEra', 'cruciblaAlbum', 'cruciblaAlbumColor'];

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
    const { title, description, thumbnail, collectionId, status, scheduledDate, position, tags, originalFilename } = req.body;

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
    let thumbnailOriginalUrl = null;
    if (thumbnail && thumbnail.startsWith('data:')) {
      const result = await uploadThumbnailToCloudinary(thumbnail, req.user._id.toString());
      thumbnailUrl = result.url;
      thumbnailOriginalUrl = result.originalUrl;
    }

    const video = new YoutubeVideo({
      userId: req.user._id,
      title: title.trim(),
      description: description || '',
      thumbnail: thumbnailUrl,
      thumbnailOriginalUrl,
      collectionId: collectionId || null,
      status: status || 'draft',
      scheduledDate: scheduledDate || null,
      position: videoPosition || 0,
      tags: tags || [],
      originalFilename: originalFilename || undefined
    });

    await video.save();

    res.status(201).json({
      message: 'Video created successfully',
      video
    });
  } catch (error) {
    console.error('Create YouTube video error:', error);
    res.status(500).json({
      error: 'Failed to create video',
      details: error.message
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
      videos,
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

    res.json({ video });
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

    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'thumbnail', 'thumbnailOriginalUrl', 'collectionId', 'status', 'scheduledDate', 'position', 'tags', 'videoFileName', 'videoFileSize', 'artistName', 'originalFilename'];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        video[field] = updates[field];
      }
    });

    await video.save();

    res.json({
      message: 'Video updated successfully',
      video
    });
  } catch (error) {
    console.error('Update YouTube video error:', error);
    res.status(500).json({ error: 'Failed to update video' });
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
      videos
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
        position: v.position,
        status: v.status,
        artistName: v.artistName || ''
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
          position: snap.position,
          status: snap.status,
          artistName: snap.artistName || ''
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
      videos
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
