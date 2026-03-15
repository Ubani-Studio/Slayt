/**
 * YouTube OAuth Controller
 *
 * Handles YouTube OAuth 2.0 authentication flow
 */

const youtubeApiService = require('../services/youtubeApiService');
const User = require('../models/User');
const { google } = require('googleapis');

/**
 * Initiate YouTube OAuth flow
 */
exports.initiateAuth = async (req, res) => {
  try {
    const userId = req.user?._id;
    const state = userId ? JSON.stringify({ userId: userId.toString() }) : '';

    const authUrl = youtubeApiService.getAuthorizationUrl(state);

    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('YouTube auth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate YouTube authentication' });
  }
};

/**
 * Handle YouTube OAuth callback
 */
exports.handleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_error=${error}`);
    }

    if (!code) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_error=no_code`);
    }

    // Exchange code for tokens
    const tokens = await youtubeApiService.getTokensFromCode(code);

    // Get user ID from state
    let userId;
    try {
      const stateData = JSON.parse(state || '{}');
      userId = stateData.userId;
    } catch (e) {
      console.error('Failed to parse state:', e);
    }

    if (!userId) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_error=no_user`);
    }

    // Get YouTube channel info
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: tokens.accessToken
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    const channelResponse = await youtube.channels.list({
      part: ['snippet'],
      mine: true
    });

    const channel = channelResponse.data.items?.[0];
    if (!channel) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_error=no_channel`);
    }

    // Update user with YouTube credentials
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_error=user_not_found`);
    }

    // Update socialAccounts
    user.socialAccounts = user.socialAccounts || {};
    user.socialAccounts.youtube = {
      connected: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId: channel.id,
      channelId: channel.id,
      channelTitle: channel.snippet.title,
      expiresAt: tokens.expiresAt,
      tokenExpiry: tokens.expiresAt
    };

    // Also update socialMedia for backward compatibility
    user.socialMedia = user.socialMedia || {};
    user.socialMedia.youtube = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.expiresAt,
      userId: channel.id,
      channelId: channel.id,
      channelTitle: channel.snippet.title
    };

    await user.save();

    console.log(`✅ YouTube connected for user ${user.email}: ${channel.snippet.title}`);

    // Redirect back to frontend
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_success=true`);

  } catch (error) {
    console.error('YouTube callback error:', error);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/connections?youtube_error=callback_failed`);
  }
};

/**
 * Disconnect YouTube
 */
exports.disconnect = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.socialAccounts?.youtube) {
      user.socialAccounts.youtube = {
        connected: false,
        accessToken: null,
        refreshToken: null,
        userId: null,
        channelId: null,
        channelTitle: null,
        expiresAt: null,
        tokenExpiry: null
      };
    }

    if (user.socialMedia?.youtube) {
      user.socialMedia.youtube = {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        userId: null,
        channelId: null,
        channelTitle: null
      };
    }

    await user.save();

    res.json({
      success: true,
      message: 'YouTube disconnected successfully'
    });
  } catch (error) {
    console.error('YouTube disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect YouTube' });
  }
};

/**
 * Get YouTube connection status
 */
exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const youtube = user.socialAccounts?.youtube || user.socialMedia?.youtube;

    if (!youtube || !youtube.accessToken) {
      return res.json({
        connected: false
      });
    }

    res.json({
      connected: youtube.connected !== false,
      channelTitle: youtube.channelTitle,
      channelId: youtube.channelId,
      expiresAt: youtube.expiresAt || youtube.tokenExpiry
    });
  } catch (error) {
    console.error('YouTube status error:', error);
    res.status(500).json({ error: 'Failed to get YouTube status' });
  }
};

/**
 * Refresh YouTube token manually
 */
exports.refreshToken = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const youtube = user.socialAccounts?.youtube || user.socialMedia?.youtube;

    if (!youtube || !youtube.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const { accessToken, expiresAt } = await youtubeApiService.refreshAccessToken(youtube.refreshToken);

    // Update both structures
    if (user.socialAccounts?.youtube) {
      user.socialAccounts.youtube.accessToken = accessToken;
      user.socialAccounts.youtube.expiresAt = expiresAt;
      user.socialAccounts.youtube.tokenExpiry = expiresAt;
    }

    if (user.socialMedia?.youtube) {
      user.socialMedia.youtube.accessToken = accessToken;
      user.socialMedia.youtube.tokenExpiry = expiresAt;
    }

    await user.save();

    res.json({
      success: true,
      expiresAt
    });
  } catch (error) {
    console.error('YouTube token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
};

module.exports = exports;
