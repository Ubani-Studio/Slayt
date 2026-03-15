const Profile = require('../models/Profile');
const User = require('../models/User');
const Grid = require('../models/Grid');
const Collection = require('../models/Collection');
const ReelCollection = require('../models/ReelCollection');

const BACKEND_BASE_URL = `${process.env.API_URL || process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`}`.replace(/\/+$/, '');

/**
 * Get all profiles for the authenticated user
 */
exports.getProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find({ userId: req.userId })
      .sort({ isDefault: -1, updatedAt: -1 });

    res.json({
      profiles,
      count: profiles.length
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
};

/**
 * Get current/active profile
 */
exports.getCurrentProfile = async (req, res) => {
  try {
    // Get user to check for existing data
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get or create default profile
    const profile = await Profile.getOrCreateDefault(req.userId, {
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      brandName: user.brandName,
      pronouns: user.pronouns,
      instagramHighlights: user.instagramHighlights
    });

    res.json({ profile });
  } catch (error) {
    console.error('Get current profile error:', error);
    res.status(500).json({ error: 'Failed to fetch current profile' });
  }
};

/**
 * Get profile by ID
 */
exports.getProfileById = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

/**
 * Create a new profile
 */
exports.createProfile = async (req, res) => {
  try {
    const { name, username, avatar, bio, platform, color } = req.body;

    // Check profile limit (optional - could be based on subscription tier)
    const existingCount = await Profile.countDocuments({ userId: req.userId });
    const MAX_PROFILES = 10;
    if (existingCount >= MAX_PROFILES) {
      return res.status(400).json({
        error: `Maximum of ${MAX_PROFILES} profiles allowed`
      });
    }

    // If no profiles exist, make this one default
    const isDefault = existingCount === 0;

    const profile = new Profile({
      userId: req.userId,
      name: name || 'New Profile',
      username,
      avatar,
      bio,
      platform: platform || 'both',
      color: color || '#8b5cf6',
      isDefault,
      isActive: true,
      socialAccounts: {
        instagram: { useParentConnection: true },
        tiktok: { useParentConnection: true }
      }
    });

    await profile.save();

    res.status(201).json({
      message: 'Profile created successfully',
      profile
    });
  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
};

/**
 * Update a profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const allowedUpdates = [
      'name', 'username', 'avatar', 'avatarPosition', 'avatarZoom',
      'bio', 'brandName', 'pronouns', 'platform', 'color', 'isActive', 'instagramHighlights'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        profile[field] = req.body[field];
      }
    });

    await profile.save();

    res.json({
      message: 'Profile updated successfully',
      profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * Delete a profile
 */
exports.deleteProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Cannot delete the default profile if it's the only one
    const profileCount = await Profile.countDocuments({ userId: req.userId });
    if (profileCount <= 1) {
      return res.status(400).json({
        error: 'Cannot delete the last profile'
      });
    }

    // If deleting default profile, make another one default
    if (profile.isDefault) {
      const anotherProfile = await Profile.findOne({
        userId: req.userId,
        _id: { $ne: profile._id }
      });
      if (anotherProfile) {
        anotherProfile.isDefault = true;
        await anotherProfile.save();
      }
    }

    // Optionally: migrate or delete associated data
    // For now, we'll keep the data but clear the profileId
    await Grid.updateMany(
      { profileId: profile._id },
      { $unset: { profileId: 1 } }
    );
    await Collection.updateMany(
      { profileId: profile._id },
      { $unset: { profileId: 1 } }
    );
    await ReelCollection.updateMany(
      { profileId: profile._id },
      { $unset: { profileId: 1 } }
    );

    await profile.deleteOne();

    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
};

/**
 * Set a profile as the active/current profile
 */
exports.activateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // We don't actually change isDefault here - that's a separate action
    // This is more about session state. For now, we just return the profile.
    // In a production app, you might store the active profileId in the user's session or JWT.

    res.json({
      message: 'Profile activated',
      profile
    });
  } catch (error) {
    console.error('Activate profile error:', error);
    res.status(500).json({ error: 'Failed to activate profile' });
  }
};

/**
 * Set a profile as the default profile
 */
exports.setDefaultProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    profile.isDefault = true;
    await profile.save(); // This will trigger the pre-save hook to unset others

    res.json({
      message: 'Profile set as default',
      profile
    });
  } catch (error) {
    console.error('Set default profile error:', error);
    res.status(500).json({ error: 'Failed to set default profile' });
  }
};

/**
 * Get effective social connection status for a profile
 */
exports.getSocialStatus = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const instagramConnection = await profile.getEffectiveConnection('instagram');
    const tiktokConnection = await profile.getEffectiveConnection('tiktok');

    res.json({
      instagram: {
        connected: instagramConnection.connected,
        useParent: instagramConnection.useParent,
        username: instagramConnection.username || null,
        expiresAt: instagramConnection.expiresAt || null
      },
      tiktok: {
        connected: tiktokConnection.connected,
        useParent: tiktokConnection.useParent,
        username: tiktokConnection.username || null,
        expiresAt: tiktokConnection.expiresAt || null
      }
    });
  } catch (error) {
    console.error('Get social status error:', error);
    res.status(500).json({ error: 'Failed to get social status' });
  }
};

/**
 * Set profile to use parent's Instagram connection
 */
exports.useParentInstagram = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    profile.socialAccounts.instagram = {
      connected: false,
      useParentConnection: true
    };
    await profile.save();

    const effectiveConnection = await profile.getEffectiveConnection('instagram');

    res.json({
      message: 'Profile set to use parent Instagram connection',
      instagram: {
        connected: effectiveConnection.connected,
        useParent: true,
        username: effectiveConnection.username || null
      }
    });
  } catch (error) {
    console.error('Use parent Instagram error:', error);
    res.status(500).json({ error: 'Failed to update Instagram connection' });
  }
};

/**
 * Set profile to use parent's TikTok connection
 */
exports.useParentTiktok = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    profile.socialAccounts.tiktok = {
      connected: false,
      useParentConnection: true
    };
    await profile.save();

    const effectiveConnection = await profile.getEffectiveConnection('tiktok');

    res.json({
      message: 'Profile set to use parent TikTok connection',
      tiktok: {
        connected: effectiveConnection.connected,
        useParent: true,
        username: effectiveConnection.username || null
      }
    });
  } catch (error) {
    console.error('Use parent TikTok error:', error);
    res.status(500).json({ error: 'Failed to update TikTok connection' });
  }
};

/**
 * Start profile-specific Instagram OAuth
 * This would redirect to the Instagram OAuth flow with profile context
 */
exports.connectInstagram = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Generate state with profile ID for callback
    const state = Buffer.from(JSON.stringify({
      profileId: profile._id.toString(),
      userId: req.userId
    })).toString('base64');

    // Build Instagram OAuth URL
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.INSTAGRAM_CONNECT_REDIRECT_URI || `${BACKEND_BASE_URL}/api/auth/instagram/connect/callback`);
    const scope = encodeURIComponent('instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights');

    const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}`;

    res.json({ url: authUrl });
  } catch (error) {
    console.error('Connect Instagram error:', error);
    res.status(500).json({ error: 'Failed to start Instagram connection' });
  }
};

/**
 * Start profile-specific TikTok OAuth
 */
exports.connectTiktok = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Generate state with profile ID for callback
    const state = Buffer.from(JSON.stringify({
      profileId: profile._id.toString(),
      userId: req.userId
    })).toString('base64');

    // Build TikTok OAuth URL
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = encodeURIComponent(process.env.TIKTOK_REDIRECT_URI || `${BACKEND_BASE_URL}/api/auth/tiktok/callback`);
    const scope = encodeURIComponent('user.info.basic,video.upload,video.publish');

    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}`;

    res.json({ url: authUrl });
  } catch (error) {
    console.error('Connect TikTok error:', error);
    res.status(500).json({ error: 'Failed to start TikTok connection' });
  }
};

/**
 * Disconnect profile's own Instagram connection (reverts to parent)
 */
exports.disconnectInstagram = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    profile.socialAccounts.instagram = {
      connected: false,
      useParentConnection: true
    };
    await profile.save();

    res.json({
      message: 'Instagram disconnected, reverting to parent connection',
      profile
    });
  } catch (error) {
    console.error('Disconnect Instagram error:', error);
    res.status(500).json({ error: 'Failed to disconnect Instagram' });
  }
};

/**
 * Disconnect profile's own TikTok connection (reverts to parent)
 */
exports.disconnectTiktok = async (req, res) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    profile.socialAccounts.tiktok = {
      connected: false,
      useParentConnection: true
    };
    await profile.save();

    res.json({
      message: 'TikTok disconnected, reverting to parent connection',
      profile
    });
  } catch (error) {
    console.error('Disconnect TikTok error:', error);
    res.status(500).json({ error: 'Failed to disconnect TikTok' });
  }
};

module.exports = exports;
