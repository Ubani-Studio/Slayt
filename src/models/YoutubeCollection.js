const mongoose = require('mongoose');

/**
 * YouTube Collection Model
 * A collection represents a group of planned YouTube videos
 */
const youtubeCollectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    default: '#6366f1' // Default indigo color
  },
  tags: [{
    type: String,
    trim: true
  }],
  themePrompt: {
    type: String,
    trim: true,
    default: ''
  },
  folderThemePrompt: {
    type: String,
    trim: true,
    default: ''
  },
  descriptionTemplate: {
    type: String,
    trim: true,
    default: `{artist} - {title}
{featuring}

From the {collection} collection.

Listen / follow:
{links}

Credits:
{credits}

{cta}`
  },
  folder: {
    type: String,
    trim: true,
    default: null // null = root/no folder
  },
  position: {
    type: Number,
    default: 0 // For ordering within folders
  },
  rolloutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rollout',
    index: true
  },
  sectionId: {
    type: String // References a section within a rollout
  },
  scheduleSource: {
    type: String,
    enum: ['manual', 'rollout', 'crucibla'],
    default: 'manual'
  },
  cruciblaProjectId: {
    type: String,
    default: null
  },
  cruciblaProjectName: {
    type: String,
    default: null
  },
  cruciblaProjectType: {
    type: String,
    default: null
  },
  cruciblaEra: {
    type: String,
    default: null
  },
  cruciblaAlbum: {
    type: String,
    default: null
  },
  cruciblaAlbumColor: {
    type: String,
    default: null
  },
  versions: [{
    name: String,
    savedAt: { type: Date, default: Date.now },
    videos: [{
      videoId: mongoose.Schema.Types.ObjectId,
      title: String,
      description: String,
      thumbnail: String,
      thumbnailOriginalUrl: String,
      originalFilename: String,
      thumbnailSourceFilename: String,
      position: Number,
      status: String,
      artistName: String,
      featuringArtists: [String],
      endScreenTemplate: String
    }]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
youtubeCollectionSchema.index({ userId: 1, rolloutId: 1 });

// Update the updatedAt timestamp before saving
youtubeCollectionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for video count (populated via aggregation)
youtubeCollectionSchema.virtual('videos', {
  ref: 'YoutubeVideo',
  localField: '_id',
  foreignField: 'collectionId'
});

// Method to add a tag
youtubeCollectionSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
  return this.save();
};

// Method to remove a tag
youtubeCollectionSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

// Static method to find by user
youtubeCollectionSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ updatedAt: -1 });
};

// Static method to find by rollout
youtubeCollectionSchema.statics.findByRollout = function(rolloutId, userId) {
  return this.find({ rolloutId, userId }).sort({ updatedAt: -1 });
};

// Enable virtuals in JSON
youtubeCollectionSchema.set('toJSON', { virtuals: true });
youtubeCollectionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('YoutubeCollection', youtubeCollectionSchema);
