const Content = require('../models/Content');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const cloudinaryService = require('../services/cloudinaryService');
const { useCloudStorage, uploadDir, thumbnailDir } = require('../middleware/upload');
const approvalGateService = require('../services/approvalGateService');
const { computeContentHashFromUpload } = require('../utils/contentHash');
const { extractDominantColor } = require('../utils/colorExtract');
const {
  resolveClarosaConnection,
  lookupSingleContentHash,
  lookupContentHashes,
  createClarosaSnapshot,
  getClarosaErrorMessage,
  pushRatingToClarosa,
} = require('../services/clarosaService');

const PHONE_IMAGE_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const PHONE_IMAGE_EXTENSIONS = new Set(['heic', 'heif']);

const getFileExtension = (filename = '') => path.extname(filename).replace('.', '').toLowerCase();

const isPhoneImageFile = (file = {}) =>
  PHONE_IMAGE_MIME_TYPES.has(file.mimetype) || PHONE_IMAGE_EXTENSIONS.has(getFileExtension(file.originalname));

const isImageUpload = (file = {}) => (file.mimetype || '').startsWith('image/') || isPhoneImageFile(file);

const isVideoUpload = (file = {}) => (file.mimetype || '').startsWith('video/');

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const prepareCloudImageUpload = async (file, logLabel = 'content') => {
  if (isPhoneImageFile(file)) {
    return {
      uploadBuffer: file.buffer,
      uploadOptions: { format: 'jpg' },
      outputFormat: 'jpg',
    };
  }

  let uploadBuffer = file.buffer;
  const needsCompress = uploadBuffer.length > 9 * 1024 * 1024;

  if (needsCompress) {
    console.log(`[${logLabel}] Compressing image: ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB`);
  }

  let pipeline = sharp(uploadBuffer).rotate();
  if (needsCompress) {
    pipeline = pipeline.resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true });
  }

  uploadBuffer = await pipeline
    .jpeg({ quality: needsCompress ? 85 : 92, mozjpeg: true })
    .toBuffer();

  if (needsCompress) {
    console.log(`[${logLabel}] Compressed to: ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB`);
  }

  return {
    uploadBuffer,
    uploadOptions: {},
    outputFormat: 'jpg',
  };
};

const resolveClarosaForUpload = async (user, file, isImage) => {
  if (!isImage) {
    return { contentHash: null, clarosa: null };
  }

  let contentHash = null;
  try {
    contentHash = await computeContentHashFromUpload(file);
  } catch (error) {
    console.error('Content hash computation failed:', error);
    return { contentHash: null, clarosa: null };
  }

  const clarosaConnection = resolveClarosaConnection(user);

  if (!clarosaConnection || clarosaConnection.autoSyncOnUpload === false) {
    return { contentHash, clarosa: null };
  }

  try {
    const match = await lookupSingleContentHash(clarosaConnection, contentHash);
    return {
      contentHash,
      clarosa: createClarosaSnapshot(clarosaConnection, contentHash, match),
    };
  } catch (error) {
    return {
      contentHash,
      clarosa: createClarosaSnapshot(
        clarosaConnection,
        contentHash,
        null,
        getClarosaErrorMessage(error),
      ),
    };
  }
};

// Create new content
exports.createContent = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, caption, platform, mediaType } = req.body;
    const isImage = isImageUpload(req.file);
    const isVideo = isVideoUpload(req.file);

    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'Unsupported media file. Upload an image or video.' });
    }

    let mediaUrl;
    let thumbnailUrl = null;
    let metadata = {};
    const { contentHash, clarosa } = await resolveClarosaForUpload(req.user, req.file, isImage);

    // Check if using cloud storage (Cloudinary)
    if (useCloudStorage()) {
      let uploadBuffer = req.file.buffer;
      let uploadOptions = {};
      let normalizedImageFormat = null;

      if (isImage) {
        const preparedImage = await prepareCloudImageUpload(req.file, 'createContent');
        uploadBuffer = preparedImage.uploadBuffer;
        uploadOptions = preparedImage.uploadOptions;
        normalizedImageFormat = preparedImage.outputFormat;
      }

      const uploadResult = await cloudinaryService.uploadBuffer(uploadBuffer, {
        folder: isVideo ? 'slayt/videos' : 'slayt/images',
        resourceType: isVideo ? 'video' : 'image',
        ...uploadOptions,
      });

      mediaUrl = uploadResult.secure_url;

      // Generate thumbnail for images
      if (isImage) {
        // Use Cloudinary transformation for thumbnail
        thumbnailUrl = cloudinaryService.getOptimizedUrl(uploadResult.public_id, {
          width: 400,
          height: 400,
          crop: 'fill',
        });

        const dominantColor = await extractDominantColor(uploadBuffer);
        metadata = {
          width: uploadResult.width,
          height: uploadResult.height,
          aspectRatio: `${uploadResult.width}:${uploadResult.height}`,
          fileSize: uploadResult.bytes,
          format: normalizedImageFormat || uploadResult.format,
          cloudinaryPublicId: uploadResult.public_id,
          dominantColors: dominantColor ? [dominantColor] : [],
        };
      } else if (isVideo) {
        // For videos, Cloudinary can auto-generate thumbnail
        thumbnailUrl = uploadResult.secure_url.replace(/\.[^/.]+$/, '.jpg');
        metadata = {
          width: uploadResult.width,
          height: uploadResult.height,
          duration: uploadResult.duration,
          fileSize: uploadResult.bytes,
          format: uploadResult.format,
          cloudinaryPublicId: uploadResult.public_id,
        };
      }
    } else {
      if (isPhoneImageFile(req.file)) {
        throw createHttpError('HEIC and HEIF uploads need cloud storage enabled on this server.');
      }

      // Local storage fallback
      mediaUrl = `/uploads/${req.file.filename}`;

      // Generate thumbnail for images
      if (isImage) {
        const thumbnailFilename = `thumb-${req.file.filename}`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

        await sharp(req.file.path)
          .resize(400, 400, { fit: 'cover' })
          .toFile(thumbnailPath);

        thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
      }

      // Get image metadata
      if (isImage) {
        const imageMetadata = await sharp(req.file.path).metadata();
        const dominantColor = await extractDominantColor(req.file.path);
        metadata = {
          width: imageMetadata.width,
          height: imageMetadata.height,
          aspectRatio: `${imageMetadata.width}:${imageMetadata.height}`,
          fileSize: req.file.size,
          format: imageMetadata.format,
          dominantColors: dominantColor ? [dominantColor] : [],
        };
      }
    }

    const content = new Content({
      userId: req.userId,
      title: title || 'Untitled Content',
      caption,
      mediaUrl,
      originalMediaUrl: mediaUrl,
      thumbnailUrl,
      contentHash,
      clarosa,
      mediaType: mediaType || (isVideo ? 'video' : 'image'),
      platform: platform || 'instagram',
      metadata
    });

    await content.save();

    res.status(201).json({
      message: 'Content created successfully',
      content
    });
  } catch (error) {
    console.error('Create content error:', error);
    const statusCode = error.statusCode || error.http_code || 500;
    const msg = error.message?.includes('HEIC and HEIF uploads')
      ? error.message
      : error.http_code === 400 && error.message?.includes('File size')
      ? `Image too large (${(req.file.size / 1024 / 1024).toFixed(1)}MB). Please use a smaller file.`
      : 'Failed to create content';
    res.status(statusCode).json({ error: msg });
  }
};

// Create new reel (video with client-generated thumbnail)
exports.createReel = async (req, res) => {
  try {
    const videoFile = req.files?.media?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    if (!videoFile) {
      return res.status(400).json({ error: 'Video file required' });
    }

    const { title, duration, width, height, isReel, recommendedType } = req.body;

    let mediaUrl;
    let thumbnailUrl = null;
    let cloudinaryPublicId = null;
    let thumbnailCloudinaryId = null;

    // Check if using cloud storage (Cloudinary)
    if (useCloudStorage()) {
      // Upload video to Cloudinary
      const videoUploadResult = await cloudinaryService.uploadBuffer(videoFile.buffer, {
        folder: 'slayt/videos',
        resourceType: 'video',
      });

      mediaUrl = videoUploadResult.secure_url;
      cloudinaryPublicId = videoUploadResult.public_id;

      // Upload thumbnail to Cloudinary if provided
      if (thumbnailFile) {
        const thumbUploadResult = await cloudinaryService.uploadBuffer(thumbnailFile.buffer, {
          folder: 'slayt/thumbnails',
          resourceType: 'image',
        });
        thumbnailUrl = thumbUploadResult.secure_url;
        thumbnailCloudinaryId = thumbUploadResult.public_id;
      } else {
        // Use Cloudinary auto-generated video thumbnail
        thumbnailUrl = videoUploadResult.secure_url.replace(/\.[^/.]+$/, '.jpg');
      }
    } else {
      // Local storage fallback
      mediaUrl = `/uploads/${videoFile.filename}`;

      // Use the client-generated thumbnail if provided
      if (thumbnailFile) {
        // Move thumbnail to thumbnails directory
        const thumbnailFilename = `thumb-${videoFile.filename.replace(/\.[^/.]+$/, '')}.jpg`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

        // Copy the uploaded thumbnail to the thumbnails directory
        await fs.copyFile(thumbnailFile.path, thumbnailPath);
        // Remove the original uploaded thumbnail from uploads directory
        await fs.unlink(thumbnailFile.path);

        thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
      }
    }

    // Parse metadata
    const metadata = {
      duration: parseFloat(duration) || 0,
      width: parseInt(width) || 0,
      height: parseInt(height) || 0,
      isReel: isReel === 'true' || isReel === true,
      fileSize: videoFile.size,
      cloudinaryPublicId,
      thumbnailCloudinaryId,
    };

    const content = new Content({
      userId: req.userId,
      title: title || 'Untitled Reel',
      mediaUrl,
      originalMediaUrl: mediaUrl,
      thumbnailUrl,
      mediaType: 'video',
      platform: 'instagram',
      metadata,
      aiSuggestions: {
        recommendedType: recommendedType || 'reel'
      }
    });

    await content.save();

    res.status(201).json({
      message: 'Reel created successfully',
      content
    });
  } catch (error) {
    console.error('Create reel error:', error);
    res.status(500).json({ error: 'Failed to create reel' });
  }
};

// Get all content for user
exports.getAllContent = async (req, res) => {
  try {
    const { platform, status, mediaType, limit = 50, offset = 0 } = req.query;

    const filter = { userId: req.userId };
    if (platform) filter.platform = platform;
    if (status) filter.status = status;
    if (mediaType) filter.mediaType = mediaType;

    const content = await Content.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Content.countDocuments(filter);

    res.json({
      content,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get content' });
  }
};

// Get content by ID
exports.getContentById = async (req, res) => {
  try {
    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({ content });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get content' });
  }
};

// Update content
exports.updateContent = async (req, res) => {
  try {
    const { title, caption, hashtags, location, status, mentions, audioTrack, scheduledFor, carouselImages, mediaUrl, editSettings, originalMediaUrl } = req.body;

    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    if (title !== undefined) content.title = title;
    if (caption !== undefined) content.caption = caption;
    if (hashtags !== undefined) content.hashtags = hashtags;
    if (location !== undefined) content.location = location;
    if (mentions !== undefined) content.mentions = mentions;
    if (audioTrack !== undefined) content.audioTrack = audioTrack;
    if (editSettings !== undefined) {
      // Deep merge to preserve existing fields (e.g. platformDrafts from other surfaces)
      content.editSettings = content.editSettings
        ? { ...content.editSettings, ...editSettings }
        : editSettings;
      content.markModified('editSettings');
    }
    if (originalMediaUrl !== undefined) content.originalMediaUrl = originalMediaUrl;
    if (scheduledFor !== undefined) {
      content.scheduledFor = scheduledFor;
      content.scheduledTime = scheduledFor; // Keep in sync for scheduling service
      // Update status to scheduled if a date is set
      if (scheduledFor) {
        content.status = 'scheduled';
      }
    }
    // Also accept scheduledTime directly
    if (req.body.scheduledTime !== undefined) {
      content.scheduledTime = req.body.scheduledTime;
      if (!content.scheduledFor) content.scheduledFor = req.body.scheduledTime;
    }
    if (req.body.scheduledPlatforms !== undefined) {
      content.scheduledPlatforms = req.body.scheduledPlatforms;
    }
    if (req.body.autoPost !== undefined) {
      content.autoPost = req.body.autoPost;
    }
    if (status) content.status = status;
    // Handle carousel images update
    if (carouselImages !== undefined) {
      content.carouselImages = carouselImages;
      // Update mediaType to carousel if multiple images
      if (carouselImages.length > 1) {
        content.mediaType = 'carousel';
      }
      // Update main media URL to first carousel image
      if (carouselImages.length > 0 && !mediaUrl) {
        content.mediaUrl = carouselImages[0];
      }
    }
    if (mediaUrl !== undefined) content.mediaUrl = mediaUrl;

    await content.save();

    res.json({
      message: 'Content updated successfully',
      content
    });
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Failed to update content' });
  }
};

// Update thumbnail for content (e.g., reel)
exports.updateThumbnail = async (req, res) => {
  try {
    const thumbnailFile = req.file;

    if (!thumbnailFile) {
      return res.status(400).json({ error: 'Thumbnail file required' });
    }

    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    let thumbnailUrl;

    // Check if using cloud storage (Cloudinary)
    if (useCloudStorage()) {
      // Delete old thumbnail from Cloudinary if it exists
      if (content.metadata?.thumbnailCloudinaryId) {
        try {
          await cloudinaryService.deleteFile(content.metadata.thumbnailCloudinaryId);
        } catch (err) {
          console.error('Could not delete old Cloudinary thumbnail:', err.message);
        }
      }

      // Upload new thumbnail to Cloudinary
      const uploadResult = await cloudinaryService.uploadBuffer(thumbnailFile.buffer, {
        folder: 'slayt/thumbnails',
        resourceType: 'image',
      });

      thumbnailUrl = uploadResult.secure_url;
      content.metadata = {
        ...content.metadata,
        thumbnailCloudinaryId: uploadResult.public_id,
      };
    } else {
      // Local storage fallback
      // Delete old thumbnail if exists
      if (content.thumbnailUrl && !content.thumbnailUrl.includes('cloudinary')) {
        try {
          const oldThumbnailPath = path.join(__dirname, '../../uploads', content.thumbnailUrl.replace('/uploads/', ''));
          await fs.unlink(oldThumbnailPath);
        } catch (err) {
          console.error('Could not delete old thumbnail:', err.message);
        }
      }

      // Move new thumbnail to thumbnails directory
      const thumbnailFilename = `thumb-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
      const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

      // Copy the uploaded thumbnail to the thumbnails directory
      await fs.copyFile(thumbnailFile.path, thumbnailPath);
      // Remove the original uploaded file from uploads directory
      await fs.unlink(thumbnailFile.path);

      thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
    }

    // Update content with new thumbnail URL
    content.thumbnailUrl = thumbnailUrl;
    await content.save();

    res.json({
      message: 'Thumbnail updated successfully',
      content
    });
  } catch (error) {
    console.error('Update thumbnail error:', error);
    res.status(500).json({ error: 'Failed to update thumbnail' });
  }
};

// Update media (edited image) for content
exports.updateMedia = async (req, res) => {
  try {
    const mediaFile = req.file;

    if (!mediaFile) {
      return res.status(400).json({ error: 'Media file required' });
    }

    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const isImage = isImageUpload(mediaFile);
    const isVideo = isVideoUpload(mediaFile);

    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'Unsupported media file. Upload an image or video.' });
    }

    let mediaUrl;
    let thumbnailUrl = content.thumbnailUrl;
    const { contentHash, clarosa } = await resolveClarosaForUpload(req.user, mediaFile, isImage);

    // Check if using cloud storage (Cloudinary)
    if (useCloudStorage()) {
      let uploadBuffer = mediaFile.buffer;
      let uploadOptions = {};
      let normalizedImageFormat = content.metadata?.format;

      if (isImage) {
        const preparedImage = await prepareCloudImageUpload(mediaFile, 'updateMedia');
        uploadBuffer = preparedImage.uploadBuffer;
        uploadOptions = preparedImage.uploadOptions;
        normalizedImageFormat = preparedImage.outputFormat;
      }

      const uploadResult = await cloudinaryService.uploadBuffer(uploadBuffer, {
        folder: isImage ? 'slayt/images' : 'slayt/videos',
        resourceType: isImage ? 'image' : 'video',
        ...uploadOptions,
      });

      mediaUrl = uploadResult.secure_url;

      // Generate new thumbnail for images
      if (isImage) {
        thumbnailUrl = cloudinaryService.getOptimizedUrl(uploadResult.public_id, {
          width: 400,
          height: 400,
          crop: 'fill',
        });
      }

      // Update metadata with new Cloudinary ID
      content.metadata = {
        ...content.metadata,
        cloudinaryPublicId: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
        fileSize: uploadResult.bytes,
        aspectRatio: uploadResult.width && uploadResult.height
          ? `${uploadResult.width}:${uploadResult.height}`
          : content.metadata?.aspectRatio,
        format: isImage ? (normalizedImageFormat || uploadResult.format) : uploadResult.format,
      };
    } else {
      if (isPhoneImageFile(mediaFile)) {
        return res.status(400).json({ error: 'HEIC and HEIF uploads need cloud storage enabled on this server.' });
      }

      // Local storage fallback
      mediaUrl = `/uploads/${mediaFile.filename}`;

      // Generate new thumbnail for images
      if (isImage) {
        const thumbnailFilename = `thumb-${mediaFile.filename}`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

        await sharp(mediaFile.path)
          .resize(400, 400, { fit: 'cover' })
          .toFile(thumbnailPath);

        thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;

        // Get updated metadata
        const imageMetadata = await sharp(mediaFile.path).metadata();
        content.metadata = {
          ...content.metadata,
          width: imageMetadata.width,
          height: imageMetadata.height,
          fileSize: mediaFile.size,
          aspectRatio: `${imageMetadata.width}:${imageMetadata.height}`,
          format: imageMetadata.format,
        };
      }
    }

    // Update content with new media URL
    content.mediaUrl = mediaUrl;
    content.thumbnailUrl = thumbnailUrl;
    content.mediaType = isVideo ? 'video' : 'image';
    content.contentHash = contentHash;
    content.clarosa = clarosa;

    // thumbnailOnly: saving a rendered crop (e.g. Instagram 1:1 grid thumbnail)
    // — do NOT reset originalMediaUrl or editSettings
    // Otherwise: uploading a brand new source image — reset everything
    const thumbnailOnly = req.body?.thumbnailOnly === 'true';
    if (!thumbnailOnly) {
      content.originalMediaUrl = mediaUrl;
      content.editSettings = null;
      content.markModified('editSettings');
    }

    await content.save();

    res.json({
      message: 'Media updated successfully',
      content
    });
  } catch (error) {
    console.error('Update media error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update media' });
  }
};

exports.syncClarosaInsights = async (req, res) => {
  try {
    const clarosaConnection = resolveClarosaConnection(req.user);
    if (!clarosaConnection) {
      return res.status(400).json({ error: 'Clarosa is not linked for this account' });
    }

    const hashedImages = await Content.find({
      userId: req.userId,
      mediaType: 'image',
      contentHash: { $exists: true, $nin: [null, ''] },
    }).select('_id contentHash');

    const skippedWithoutHash = await Content.countDocuments({
      userId: req.userId,
      mediaType: 'image',
      $or: [
        { contentHash: { $exists: false } },
        { contentHash: null },
        { contentHash: '' },
      ],
    });

    if (hashedImages.length === 0) {
      return res.json({
        message: 'No hashed images are ready for Clarosa sync yet',
        summary: {
          scanned: 0,
          updated: 0,
          matched: 0,
          unmatched: 0,
          skippedWithoutHash,
        },
      });
    }

    const lookupResults = await lookupContentHashes(
      clarosaConnection,
      hashedImages.map((item) => item.contentHash),
    );

    const operations = [];
    let matched = 0;

    hashedImages.forEach((item) => {
      const match = lookupResults[item.contentHash] || null;
      if (match) {
        matched += 1;
      }

      operations.push({
        updateOne: {
          filter: { _id: item._id, userId: req.userId },
          update: {
            $set: {
              clarosa: createClarosaSnapshot(clarosaConnection, item.contentHash, match),
            },
          },
        },
      });
    });

    if (operations.length > 0) {
      await Content.bulkWrite(operations);
    }

    res.json({
      message: 'Clarosa insights synced',
      summary: {
        scanned: hashedImages.length,
        updated: operations.length,
        matched,
        unmatched: operations.length - matched,
        skippedWithoutHash,
      },
    });
  } catch (error) {
    const detail = getClarosaErrorMessage(error);
    console.error('Sync Clarosa insights error:', error);
    res.status(error.response?.status || 502).json({ error: detail });
  }
};

// Rate content (bidirectional Clarosa sync)
exports.rateContent = async (req, res) => {
  try {
    const { rating } = req.body;

    if (rating !== null && (typeof rating !== 'number' || rating < 0 || rating > 5 || (rating % 0.5 !== 0))) {
      return res.status(400).json({ error: 'Rating must be 0-5 in 0.5 increments, or null to clear' });
    }

    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const ratingValue = rating === null ? null : rating;

    await Content.updateOne(
      { _id: content._id },
      { $set: { 'clarosa.rating': ratingValue } },
    );

    let synced = false;
    const clarosaConnection = resolveClarosaConnection(req.user);
    if (clarosaConnection && content.contentHash) {
      synced = await pushRatingToClarosa(clarosaConnection, content.contentHash, ratingValue);
    }

    res.json({ rating: ratingValue, synced });
  } catch (error) {
    console.error('Rate content error:', error);
    res.status(500).json({ error: 'Failed to rate content' });
  }
};

// Backfill dominant colors for existing images
exports.backfillColors = async (req, res) => {
  try {
    const items = await Content.find({
      userId: req.userId,
      mediaType: 'image',
      $or: [
        { 'metadata.dominantColors': { $exists: false } },
        { 'metadata.dominantColors': { $size: 0 } },
      ],
    }).select('_id mediaUrl metadata');

    if (items.length === 0) {
      return res.json({ processed: 0, skipped: 0, failed: 0 });
    }

    let processed = 0;
    let failed = 0;
    const BATCH = 10;

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);

      await Promise.all(batch.map(async (item) => {
        try {
          let input;
          if (item.mediaUrl?.startsWith('/uploads/')) {
            input = path.join(__dirname, '../../public', item.mediaUrl);
          } else if (item.mediaUrl?.startsWith('http')) {
            const axios = require('axios');
            const response = await axios.get(item.mediaUrl, {
              responseType: 'arraybuffer',
              timeout: 15000,
            });
            input = Buffer.from(response.data);
          } else {
            failed++;
            return;
          }

          const color = await extractDominantColor(input);
          if (color) {
            await Content.updateOne(
              { _id: item._id },
              { $set: { 'metadata.dominantColors': [color] } },
            );
            processed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }));
    }

    res.json({
      processed,
      skipped: 0,
      failed,
      total: items.length,
    });
  } catch (error) {
    console.error('Backfill colors error:', error);
    res.status(500).json({ error: 'Failed to backfill colors' });
  }
};

// Delete content
exports.deleteContent = async (req, res) => {
  try {
    const content = await Content.findOneAndDelete({ _id: req.params.id, userId: req.userId });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Delete associated files
    try {
      const mediaPath = path.join(__dirname, '../../public', content.mediaUrl);
      await fs.unlink(mediaPath);

      if (content.thumbnailUrl) {
        const thumbnailPath = path.join(__dirname, '../../public', content.thumbnailUrl);
        await fs.unlink(thumbnailPath);
      }
    } catch (fileError) {
      console.error('Error deleting files:', fileError);
    }

    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Failed to delete content' });
  }
};

// Add version to content
exports.addVersion = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { versionName, caption } = req.body;

    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const mediaUrl = `/uploads/${req.file.filename}`;
    let thumbnailUrl = null;

    if (req.file.mimetype.startsWith('image/')) {
      const thumbnailFilename = `thumb-${req.file.filename}`;
      const thumbnailPath = path.join(__dirname, '../../uploads/thumbnails', thumbnailFilename);

      await sharp(req.file.path)
        .resize(400, 400, { fit: 'cover' })
        .toFile(thumbnailPath);

      thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
    }

    content.versions.push({
      versionName: versionName || `Version ${content.versions.length + 1}`,
      mediaUrl,
      thumbnailUrl,
      caption,
      isSelected: false
    });

    await content.save();

    res.status(201).json({
      message: 'Version added successfully',
      content
    });
  } catch (error) {
    console.error('Add version error:', error);
    res.status(500).json({ error: 'Failed to add version' });
  }
};

// Select version
exports.selectVersion = async (req, res) => {
  try {
    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const version = content.versions.id(req.params.versionId);
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Deselect all versions
    content.versions.forEach(v => v.isSelected = false);

    // Select the specified version
    version.isSelected = true;

    // Update main content with selected version
    content.mediaUrl = version.mediaUrl;
    content.thumbnailUrl = version.thumbnailUrl;
    if (version.caption) content.caption = version.caption;
    if (version.aiScores) content.aiScores = version.aiScores;

    await content.save();

    res.json({
      message: 'Version selected successfully',
      content
    });
  } catch (error) {
    console.error('Select version error:', error);
    res.status(500).json({ error: 'Failed to select version' });
  }
};

// Delete version
exports.deleteVersion = async (req, res) => {
  try {
    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    content.versions.id(req.params.versionId).remove();
    await content.save();

    res.json({
      message: 'Version deleted successfully',
      content
    });
  } catch (error) {
    console.error('Delete version error:', error);
    res.status(500).json({ error: 'Failed to delete version' });
  }
};

// Schedule content
exports.scheduleContent = async (req, res) => {
  try {
    const { scheduledFor } = req.body;

    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const gate = await approvalGateService.evaluateContentGate({
      content,
      user: req.user,
      action: 'schedule',
    });
    if (!gate.allowed) {
      return res.status(409).json({
        error: 'Approval gate blocked scheduling',
        code: gate.code,
        gate,
      });
    }

    content.scheduledFor = new Date(scheduledFor);
    content.status = 'scheduled';

    await content.save();

    res.json({
      message: 'Content scheduled successfully',
      content
    });
  } catch (error) {
    console.error('Schedule content error:', error);
    res.status(500).json({ error: 'Failed to schedule content' });
  }
};

// Publish content
exports.publishContent = async (req, res) => {
  try {
    const content = await Content.findOne({ _id: req.params.id, userId: req.userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const gate = await approvalGateService.evaluateContentGate({
      content,
      user: req.user,
      action: 'publish',
    });
    if (!gate.allowed) {
      return res.status(409).json({
        error: 'Approval gate blocked publishing',
        code: gate.code,
        gate,
      });
    }

    // Here you would integrate with Instagram/TikTok APIs to publish
    // For now, we'll just mark it as published

    content.publishedAt = new Date();
    content.status = 'published';

    await content.save();

    res.json({
      message: 'Content published successfully',
      content
    });
  } catch (error) {
    console.error('Publish content error:', error);
    res.status(500).json({ error: 'Failed to publish content' });
  }
};
