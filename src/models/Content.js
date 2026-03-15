const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: 'Untitled Content'
  },
  caption: {
    type: String,
    maxlength: 2200
  },
  mediaUrl: {
    type: String,
    required: true
  },
  originalMediaUrl: {
    type: String,
    default: function defaultOriginalUrl() {
      return this.mediaUrl;
    }
  },
  thumbnailUrl: String,
  contentHash: {
    type: String,
    index: true
  },
  clarosa: {
    connected: {
      type: Boolean,
      default: false
    },
    workspaceId: String,
    baseUrl: String,
    contentHash: String,
    status: {
      type: String,
      enum: ['matched', 'unmatched', 'lookup_failed'],
      default: 'unmatched'
    },
    hasMatch: {
      type: Boolean,
      default: false
    },
    rating: Number,
    favorite: {
      type: Boolean,
      default: false
    },
    markedForDelete: {
      type: Boolean,
      default: false
    },
    deleteReason: String,
    notes: String,
    colorCategory: String,
    dominantColor: String,
    remoteUpdatedAt: Date,
    matchedAt: Date,
    lastSyncedAt: Date,
    lastError: String
  },
  // Non-destructive edit settings per platform (Instagram/TikTok/Twitter)
  editSettings: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Carousel images - array of URLs for carousel posts
  carouselImages: [{
    type: String
  }],
  mediaType: {
    type: String,
    enum: ['image', 'video', 'carousel'],
    required: true
  },
  platform: {
    type: String,
    enum: ['instagram', 'tiktok', 'youtube'],
    required: true
  },
  // AI Scoring
  aiScores: {
    viralityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    engagementScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    aestheticScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    trendScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    // BLUE OCEAN: Conviction Score (Taste + Performance + Brand Alignment)
    convictionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    tasteAlignment: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    brandConsistency: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    analyzedAt: Date
  },

  // BLUE OCEAN: Conviction Gating
  conviction: {
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    tier: {
      type: String,
      enum: ['low', 'medium', 'high', 'exceptional'],
      default: 'medium'
    },
    archetypeMatch: {
      designation: String,
      glyph: String,
      confidence: Number
    },
    gatingStatus: {
      type: String,
      enum: ['approved', 'warning', 'blocked', 'override'],
      default: 'approved'
    },
    gatingReason: String,
    userOverride: {
      type: Boolean,
      default: false
    },
    overrideReason: String,
    calculatedAt: Date
  },
  // Performance Metrics (actual results from platforms)
  performanceMetrics: {
    contentId: String,
    platform: String,
    postedAt: Date,
    metrics: {
      instagram: {
        likes: Number,
        comments: Number,
        views: Number,
        reach: Number,
        saved: Number,
        shares: Number,
        follows: Number,
        profileVisits: Number,
        reelAvgWatchTime: Number,
        isReel: Boolean,
        timestamp: Date,
        url: String,
        error: String
      },
      tiktok: {
        likes: Number,
        comments: Number,
        shares: Number,
        views: Number,
        timestamp: Date,
        url: String,
        error: String
      },
      youtube: {
        views: Number,
        likes: Number,
        comments: Number,
        shares: Number,
        avgViewDuration: Number,
        avgViewPercentage: Number,
        subscribersGained: Number,
        subscribersLost: Number,
        estimatedMinutesWatched: Number,
        cardClickRate: Number,
        timestamp: Date,
        url: String,
        error: String
      }
    },
    engagementScore: Number, // Legacy composite score 0-100
    audienceDepthScore: Number, // ADS: post-vanity metric 0-100
    audienceDepthBreakdown: mongoose.Schema.Types.Mixed, // Per-signal scores
    fetchHistory: [{
      fetchedAt: Date,
      audienceDepthScore: Number,
      rawMetrics: mongoose.Schema.Types.Mixed
    }],
    fetchedAt: Date
  },
  // Conviction Validation (predicted vs actual)
  convictionValidation: {
    contentId: String,
    predicted: {
      convictionScore: Number,
      tier: String,
      breakdown: {
        performance: Number,
        taste: Number,
        brand: Number
      },
      archetypeMatch: {
        designation: String,
        glyph: String,
        confidence: Number
      }
    },
    actual: {
      engagementScore: Number,
      metrics: Object,
      postedAt: Date
    },
    validation: {
      accuracy: Number, // 0-100
      predictionQuality: String, // excellent, good, fair, poor, very_poor
      componentAnalysis: Object
    },
    feedback: {
      shouldUpdateGenome: Boolean,
      weight: Number,
      signals: [Object]
    },
    calculatedAt: Date
  },
  lastMetricsFetch: Date,
  platformPostIds: {
    instagram: String,
    tiktok: String,
    youtube: String
  },
  // Platform-specific post data (after publishing)
  platformPosts: {
    instagram: {
      postId: String,
      postUrl: String,
      postedAt: Date
    },
    tiktok: {
      postId: String,
      postUrl: String,
      postedAt: Date
    },
    youtube: {
      postId: String,
      postUrl: String,
      postedAt: Date
    }
  },
  // AI Suggestions
  aiSuggestions: {
    recommendedType: {
      type: String,
      enum: ['post', 'carousel', 'reel', 'story', 'video'],
    },
    reason: String,
    improvements: [String],
    bestTimeToPost: String,
    targetAudience: String,
    hashtagSuggestions: [String],
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100
    },
    platformRecommendation: String,
    platformConfidence: {
      type: Number,
      min: 0,
      max: 100
    },
    platformReason: String,
    captionIdeas: [String],
    hookIdeas: [String],
    actionItems: [String],
    similarCreators: [{
      name: String,
      handle: String,
      overlap: String,
      performanceNote: String
    }],
    creatorInsights: mongoose.Schema.Types.Mixed
  },
  // Multiple versions for A/B testing
  versions: [{
    versionName: String,
    mediaUrl: String,
    thumbnailUrl: String,
    caption: String,
    aiScores: {
      viralityScore: Number,
      engagementScore: Number,
      aestheticScore: Number,
      trendScore: Number,
      overallScore: Number,
      convictionScore: Number,
      tasteAlignment: Number
    },
    conviction: {
      score: Number,
      tier: String,
      gatingStatus: String
    },
    isSelected: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Metadata
  metadata: {
    width: Number,
    height: Number,
    aspectRatio: String,
    fileSize: Number,
    duration: Number, // for videos
    format: String,
    dominantColors: [String]
  },
  // Scheduling and Publishing
  scheduledFor: Date,
  scheduledTime: Date, // Alias for scheduledFor (frontend compatibility)
  scheduledPlatform: String, // Platform(s) for scheduled post
  scheduledPlatforms: [{
    type: String,
    enum: ['instagram', 'tiktok', 'youtube']
  }],
  scheduledProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    default: undefined,
  },
  autoPost: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  platformPostUrl: String, // Direct link to post on Instagram/TikTok
  platformPostId: String,  // Platform-specific post ID
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'failed'],
    default: 'draft'
  },
  hashtags: [String],
  mentions: [String],
  location: String,
  audioTrack: String, // For reels - song or audio name

  // Content DNA Analysis (from Intelligence Service)
  analysis: {
    performanceDNA: {
      hooks: [{ type: String }],
      structure: { type: String },
      keywords: [{ type: String }],
      sentiment: { type: String },
      predictedScore: { type: Number },
      format: { type: String },
      niche: { type: String },
      targetAudience: { type: String }
    },
    aestheticDNA: {
      tone: [{ type: String }],
      voice: { type: String },
      complexity: { type: String },
      style: [{ type: String }],
      tasteScore: { type: Number },
      emotionalTriggers: [{ type: String }],
      pacing: { type: String }
    },
    analyzedAt: { type: Date }
  },

  // Performance Analysis (post-publish comparison)
  performanceAnalysis: {
    predicted: { type: Number },
    actual: {
      views: { type: Number },
      likes: { type: Number },
      comments: { type: Number },
      shares: { type: Number },
      saves: { type: Number },
      engagementRate: { type: Number }
    },
    gap: { type: Number },
    insights: [{
      type: { type: String },
      message: { type: String },
      learnings: [{ type: String }]
    }],
    analyzedAt: { type: Date }
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
contentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate overall score from individual scores
contentSchema.methods.calculateOverallScore = function() {
  const scores = this.aiScores;
  const total = scores.viralityScore + scores.engagementScore +
                scores.aestheticScore + scores.trendScore;
  this.aiScores.overallScore = Math.round(total / 4);
  return this.aiScores.overallScore;
};

/**
 * BLUE OCEAN: Calculate Conviction Score
 * IMPROVED FORMULA (Post Stress-Test):
 * Conviction = [(Taste * 0.5) + (Performance * 0.3) + (Brand * 0.2)] × Temporal Factor
 *
 * Temporal Factor penalizes trend-chasing, rewards evergreen quality
 */
contentSchema.methods.calculateConvictionScore = function() {
  const scores = this.aiScores;

  // Performance potential (average of existing scores)
  const performancePotential = (
    scores.viralityScore +
    scores.engagementScore +
    scores.aestheticScore +
    scores.trendScore
  ) / 4;

  const tasteAlignment = scores.tasteAlignment || 0;
  const brandConsistency = scores.brandConsistency || 85; // Default to 85 if not set

  // Temporal decay: penalize over-reliance on trends (only affects trend scores >80)
  // IMPROVED: More aggressive penalty for extreme trend-chasing
  const trendScore = scores.trendScore || 0;
  let temporalFactor = 1.0;

  if (trendScore > 90) {
    // EXTREME trend dependency (90-100): 15-20% penalty
    temporalFactor = Math.max(0.80, 1.0 - ((trendScore - 90) / 50));
  } else if (trendScore > 80) {
    // High trend dependency (80-90): 5-10% penalty
    temporalFactor = Math.max(0.90, 1.0 - ((trendScore - 80) / 100));
  }

  // IMPROVED weights: Taste-first (50%), Performance (30%), Brand (20%)
  const baseConvictionScore = (
    (performancePotential * 0.3) +
    (tasteAlignment * 0.5) +
    (brandConsistency * 0.2)
  );

  // Apply temporal factor
  const convictionScore = Math.round(baseConvictionScore * temporalFactor);

  // Update both locations
  this.aiScores.convictionScore = convictionScore;

  if (!this.conviction) {
    this.conviction = {};
  }
  this.conviction.score = convictionScore;
  this.conviction.tier = this.getConvictionTier(convictionScore);
  this.conviction.calculatedAt = new Date();

  return convictionScore;
};

/**
 * BLUE OCEAN: Get Conviction Tier
 */
contentSchema.methods.getConvictionTier = function(score) {
  if (score >= 85) return 'exceptional';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
};

/**
 * BLUE OCEAN: Check Conviction Gating
 * Returns gating status based on conviction score thresholds
 */
contentSchema.methods.checkConvictionGating = function(threshold = 70, strictMode = false) {
  const score = this.conviction?.score || this.aiScores?.convictionScore || 0;

  let status = 'approved';
  let reason = null;

  if (score < 50) {
    status = strictMode ? 'blocked' : 'warning';
    reason = `Low conviction score (${score}/100). Content may underperform. Consider revisions.`;
  } else if (score < threshold) {
    status = 'warning';
    reason = `Below conviction threshold (${score}/${threshold}). Review suggested improvements before scheduling.`;
  } else if (score >= 85) {
    status = 'approved';
    reason = `High-conviction content (${score}/100). Predicted to perform well.`;
  } else {
    status = 'approved';
    reason = `Conviction score: ${score}/100`;
  }

  // Update conviction object
  if (!this.conviction) {
    this.conviction = {};
  }

  this.conviction.gatingStatus = this.conviction.userOverride ? 'override' : status;
  this.conviction.gatingReason = reason;

  return {
    status: this.conviction.gatingStatus,
    reason,
    score,
    canSchedule: status !== 'blocked' || this.conviction.userOverride,
    requiresReview: status === 'warning' && !this.conviction.userOverride
  };
};

/**
 * BLUE OCEAN: Override Conviction Gating
 * Allows user to bypass conviction warnings with a reason
 */
contentSchema.methods.overrideConvictionGating = function(reason) {
  if (!this.conviction) {
    this.conviction = {};
  }

  this.conviction.userOverride = true;
  this.conviction.overrideReason = reason || 'User override';
  this.conviction.gatingStatus = 'override';

  return this.conviction;
};

module.exports = mongoose.model('Content', contentSchema);
