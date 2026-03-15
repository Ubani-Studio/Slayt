const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password only required if not using OAuth
      return !this.googleId && !this.instagramId;
    }
  },
  name: {
    type: String,
    required: true
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values to be non-unique
  },
  instagramId: {
    type: String,
    unique: true,
    sparse: true // Allows null values to be non-unique
  },
  avatar: {
    type: String
  },
  avatarPosition: {
    type: Object,
    default: { x: 0, y: 0 }
  },
  avatarZoom: {
    type: Number,
    default: 1
  },
  // Instagram highlights - stored in cloud for backup
  instagramHighlights: [{
    highlightId: { type: String, required: true },
    name: { type: String, default: 'New' },
    cover: { type: String, default: null }, // Cloudinary URL
    coverPosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 }
    },
    coverZoom: { type: Number, default: 1 },
    stories: [{ type: String }]
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  bio: {
    type: String,
    maxlength: 500
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'instagram'],
    default: 'local'
  },
  socialAccounts: {
    instagram: {
      connected: { type: Boolean, default: false },
      accessToken: String,
      refreshToken: String,
      userId: String,
      username: String,
      expiresAt: Date
    },
    tiktok: {
      connected: { type: Boolean, default: false },
      accessToken: String,
      refreshToken: String,
      userId: String,
      username: String,
      expiresAt: Date
    },
    youtube: {
      connected: { type: Boolean, default: false },
      accessToken: String,
      refreshToken: String,
      userId: String,
      channelId: String,
      channelTitle: String,
      expiresAt: Date,
      tokenExpiry: Date // Alternative field name for compatibility
    }
  },

  // Legacy socialMedia field (for backward compatibility)
  socialMedia: {
    instagram: {
      accessToken: String,
      refreshToken: String,
      tokenExpiry: Date,
      userId: String,
      username: String
    },
    tiktok: {
      accessToken: String,
      refreshToken: String,
      tokenExpiry: Date,
      userId: String,
      username: String
    },
    youtube: {
      accessToken: String,
      refreshToken: String,
      tokenExpiry: Date,
      userId: String,
      channelId: String,
      channelTitle: String
    }
  },
  preferences: {
    defaultGridSize: { type: Number, default: 3 },
    theme: { type: String, default: 'light' }
  },
  clarosa: {
    connected: { type: Boolean, default: false },
    baseUrl: { type: String, default: 'http://127.0.0.1:8000' },
    workspaceId: { type: String, default: 'default' },
    autoSyncOnUpload: { type: Boolean, default: true },
    lastIndexedAt: Date,
    lastIndexedSummary: mongoose.Schema.Types.Mixed,
    lastError: String
  },
  brandKit: {
    colors: {
      primary: { type: String, default: '#000000' },
      secondary: { type: String, default: '#666666' },
      accent: { type: String, default: '#b29674' },
      background: { type: String, default: '#ffffff' },
      text: { type: String, default: '#000000' },
      custom: [{
        id: String,
        name: String,
        value: String
      }]
    },
    fonts: {
      heading: { type: String, default: 'Space Grotesk' },
      body: { type: String, default: 'Space Grotesk' },
      custom: [{
        id: String,
        name: String
      }]
    },
    logos: [{
      id: String,
      name: String,
      url: String,
      type: { type: String, enum: ['primary', 'secondary', 'icon', 'wordmark'] }
    }],
    templates: [{
      id: String,
      name: String,
      previewUrl: String,
      settings: mongoose.Schema.Types.Mixed
    }]
  },
  // AI Taste Profile - learned patterns from content performance
  tasteProfile: {
    performancePatterns: {
      hooks: [{ type: String }],
      sentiment: [{ type: String }],
      structure: [{ type: String }],
      keywords: [{ type: String }]
    },
    aestheticPatterns: {
      dominantTones: [{ type: String }],
      avoidTones: [{ type: String }],
      voice: { type: String, default: 'conversational' },
      complexity: { type: String, default: 'moderate' }
    },
    voiceSignature: {
      sentencePatterns: [{ type: String }],
      rhetoricalDevices: [{ type: String }],
      vocabularyLevel: { type: String }
    },
    confidence: { type: Number, default: 0 },
    itemCount: { type: Number, default: 0 },
    lastUpdated: { type: Date }
  },
  // Full Taste Genome (from Subtaste + Refyn integration)
  tasteGenome: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  }
});

// Hash password before saving (only for local auth)
userSchema.pre('save', async function(next) {
  // Skip hashing if password not modified or using OAuth
  if (!this.isModified('password') || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
