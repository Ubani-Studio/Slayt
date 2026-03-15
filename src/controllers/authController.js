const User = require('../models/User');
const Profile = require('../models/Profile');
const { generateToken } = require('../middleware/auth');
const axios = require('axios');
const passport = require('../config/passport');
const cloudinaryService = require('../services/cloudinaryService');
const { useCloudStorage, uploadDir } = require('../middleware/upload');
const path = require('path');
const fs = require('fs').promises;
const {
  DEFAULT_CLAROSA_BASE_URL,
  normalizeClarosaBaseUrl,
  resolveClarosaConnection,
  indexClarosaLibrary: requestClarosaLibraryIndex,
  getClarosaErrorMessage,
} = require('../services/clarosaService');

const BACKEND_BASE_URL = `${process.env.API_URL || process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`}`.replace(/\/+$/, '');
const FRONTEND_BASE_URL = `${process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}`.replace(/\/+$/, '');
const INSTAGRAM_CONNECT_CALLBACK_URL = `${process.env.INSTAGRAM_CONNECT_REDIRECT_URI || `${BACKEND_BASE_URL}/api/auth/instagram/connect/callback`}`.replace(/\/+$/, '');
const TIKTOK_CONNECT_CALLBACK_URL = `${process.env.TIKTOK_REDIRECT_URI || `${BACKEND_BASE_URL}/api/auth/tiktok/callback`}`.replace(/\/+$/, '');
const YOUTUBE_CONNECT_CALLBACK_URL = `${process.env.YOUTUBE_REDIRECT_URI || `${BACKEND_BASE_URL}/api/auth/youtube/callback`}`.replace(/\/+$/, '');

const encodeOAuthState = (payload = {}) => Buffer.from(JSON.stringify(payload)).toString('base64');

const decodeOAuthState = (value = '') => {
  try {
    return JSON.parse(Buffer.from(String(value), 'base64').toString('utf8'));
  } catch (error) {
    return null;
  }
};

const buildFrontendRedirect = (pathname = '/connections', query = {}) => {
  const url = new URL(pathname, `${FRONTEND_BASE_URL}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, `${value}`);
    }
  });
  return url.toString();
};

const buildPlatformReadinessAudit = () => {
  const backendOrigin = BACKEND_BASE_URL;
  const frontendOrigin = FRONTEND_BASE_URL;
  const corsOrigin = `${process.env.CLIENT_URL || process.env.FRONTEND_URL || process.env.FOLIO_APP_ORIGIN || 'http://localhost:5173'}`.replace(/\/+$/, '');
  const requiredEnv = {
    instagram: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
    tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  };
  const callbacks = {
    instagramConnect: INSTAGRAM_CONNECT_CALLBACK_URL,
    instagramLogin: `${process.env.INSTAGRAM_REDIRECT_URI || `${backendOrigin}/api/auth/instagram/callback`}`.replace(/\/+$/, ''),
    tiktok: TIKTOK_CONNECT_CALLBACK_URL,
    youtube: YOUTUBE_CONNECT_CALLBACK_URL,
  };
  const warnings = [];

  if (process.env.CLIENT_URL && process.env.FRONTEND_URL && process.env.CLIENT_URL !== process.env.FRONTEND_URL) {
    warnings.push('CLIENT_URL and FRONTEND_URL differ. OAuth redirects and CORS should use the same frontend origin.');
  }
  if (!process.env.API_URL && !process.env.BACKEND_PUBLIC_URL) {
    warnings.push('API_URL is not set. OAuth callbacks will use the local backend default.');
  }
  if (!process.env.CLIENT_URL && !process.env.FRONTEND_URL) {
    warnings.push('CLIENT_URL is not set. Frontend redirects will use the local default.');
  }

  const platforms = Object.fromEntries(
    Object.entries(requiredEnv).map(([platform, envNames]) => {
      const missingEnv = envNames.filter((name) => !process.env[name]);
      return [platform, {
        ready: missingEnv.length === 0,
        missingEnv,
        callbackUrl: platform === 'instagram' ? callbacks.instagramConnect : callbacks[platform],
      }];
    })
  );

  return {
    backendOrigin,
    frontendOrigin,
    corsOrigin,
    callbacks,
    warnings,
    platforms,
  };
};

const buildInstagramConnectUrl = ({ userId, profileId } = {}) => {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_CLIENT_ID,
    redirect_uri: INSTAGRAM_CONNECT_CALLBACK_URL,
    scope: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights',
    response_type: 'code',
    state: encodeOAuthState({
      platform: 'instagram',
      userId: userId ? `${userId}` : undefined,
      profileId: profileId ? `${profileId}` : undefined,
    }),
  });

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
};

const buildTikTokConnectUrl = ({ userId, profileId } = {}) => {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    redirect_uri: TIKTOK_CONNECT_CALLBACK_URL,
    scope: 'user.info.basic,video.upload,video.publish',
    response_type: 'code',
    state: encodeOAuthState({
      platform: 'tiktok',
      userId: userId ? `${userId}` : undefined,
      profileId: profileId ? `${profileId}` : undefined,
    }),
  });

  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
};

const upsertInstagramConnection = async ({ userId, profileId, connection }) => {
  if (profileId) {
    const profile = await Profile.findOne({ _id: profileId, userId });
    if (!profile) {
      throw new Error('Profile not found for Instagram connection');
    }

    profile.socialAccounts.instagram = {
      connected: true,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken || null,
      userId: connection.userId || null,
      username: connection.username || null,
      expiresAt: connection.expiresAt || null,
      useParentConnection: false,
    };
    await profile.save();
    return;
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found for Instagram connection');
  }

  user.socialAccounts.instagram = {
    connected: true,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken || null,
    userId: connection.userId || null,
    username: connection.username || null,
    expiresAt: connection.expiresAt || null,
  };
  await user.save();
};

const upsertTiktokConnection = async ({ userId, profileId, connection }) => {
  if (profileId) {
    const profile = await Profile.findOne({ _id: profileId, userId });
    if (!profile) {
      throw new Error('Profile not found for TikTok connection');
    }

    profile.socialAccounts.tiktok = {
      connected: true,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken || null,
      userId: connection.userId || null,
      username: connection.username || null,
      expiresAt: connection.expiresAt || null,
      useParentConnection: false,
    };
    await profile.save();
    return;
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found for TikTok connection');
  }

  user.socialAccounts.tiktok = {
    connected: true,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken || null,
    userId: connection.userId || null,
    username: connection.username || null,
    expiresAt: connection.expiresAt || null,
  };
  await user.save();
};

// Register new user
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    const user = new User({ email, password, name });
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        socialAccounts: {
          instagram: {
            connected: user.socialAccounts.instagram.connected,
            username: user.socialAccounts.instagram.username || null,
          },
          tiktok: {
            connected: user.socialAccounts.tiktok.connected,
            username: user.socialAccounts.tiktok.username || null,
          },
          youtube: {
            connected: user.socialAccounts.youtube?.connected || Boolean(user.socialMedia?.youtube?.accessToken),
            channelTitle: user.socialAccounts.youtube?.channelTitle || user.socialMedia?.youtube?.channelTitle || null,
          },
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    // In a JWT-based system, logout is handled client-side by removing the token
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, bio, avatar, avatarPosition, avatarZoom, username, brandName } = req.body;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update fields if provided
    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (avatarPosition !== undefined) user.avatarPosition = avatarPosition;
    if (avatarZoom !== undefined) user.avatarZoom = avatarZoom;
    if (username !== undefined) user.username = username;
    if (brandName !== undefined) user.brandName = brandName;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        bio: user.bio,
        avatar: user.avatar,
        avatarPosition: user.avatarPosition,
        avatarZoom: user.avatarZoom,
        username: user.username,
        brandName: user.brandName
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.updateClarosaConnection = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      baseUrl,
      workspaceId,
      autoSyncOnUpload = true,
      connected = true,
    } = req.body;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentClarosa = typeof user.clarosa?.toObject === 'function'
      ? user.clarosa.toObject()
      : (user.clarosa || {});

    if (connected === false) {
      user.clarosa = {
        ...currentClarosa,
        connected: false,
        autoSyncOnUpload: true,
        lastError: null,
      };
    } else {
      user.clarosa = {
        ...currentClarosa,
        connected: true,
        baseUrl: normalizeClarosaBaseUrl(baseUrl || DEFAULT_CLAROSA_BASE_URL),
        workspaceId: `${workspaceId || 'default'}`.trim() || 'default',
        autoSyncOnUpload: autoSyncOnUpload !== false,
        lastError: null,
      };
    }

    await user.save();

    res.json({
      message: user.clarosa.connected ? 'Clarosa linked successfully' : 'Clarosa disconnected',
      user,
    });
  } catch (error) {
    console.error('Update Clarosa connection error:', error);
    res.status(500).json({ error: 'Failed to update Clarosa connection' });
  }
};

exports.indexClarosaLibrary = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const clarosaConnection = resolveClarosaConnection(user);
    if (!clarosaConnection) {
      return res.status(400).json({ error: 'Link Clarosa before indexing its library' });
    }

    const result = await requestClarosaLibraryIndex(clarosaConnection);
    const currentClarosa = typeof user.clarosa?.toObject === 'function'
      ? user.clarosa.toObject()
      : (user.clarosa || {});

    user.clarosa = {
      ...currentClarosa,
      lastIndexedAt: new Date(),
      lastIndexedSummary: result,
      lastError: null,
    };
    await user.save();

    res.json({
      message: 'Clarosa library indexed successfully',
      result,
      user,
    });
  } catch (error) {
    const detail = getClarosaErrorMessage(error);
    console.error('Index Clarosa library error:', error);
    await User.findByIdAndUpdate(req.userId, {
      $set: {
        'clarosa.lastError': detail,
      },
    });
    res.status(error.response?.status || 502).json({ error: detail });
  }
};

// Upload avatar image
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let avatarUrl;

    // Check if using cloud storage (Cloudinary)
    if (useCloudStorage()) {
      // Upload to Cloudinary - no transformation for non-destructive editing
      // Zoom/position transforms are applied on frontend
      const uploadResult = await cloudinaryService.uploadBuffer(req.file.buffer, {
        folder: 'slayt/avatars',
        resourceType: 'image'
      });
      avatarUrl = uploadResult.secure_url;
    } else {
      // Local storage fallback
      const filename = `avatar-${userId}-${Date.now()}${path.extname(req.file.originalname)}`;
      const filepath = path.join(uploadDir, filename);
      await fs.writeFile(filepath, req.file.buffer);
      avatarUrl = `/uploads/${filename}`;
    }

    // Update user's avatar
    user.avatar = avatarUrl;
    await user.save();

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: avatarUrl,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        bio: user.bio,
        avatar: user.avatar,
        avatarPosition: user.avatarPosition,
        avatarZoom: user.avatarZoom,
        username: user.username,
        brandName: user.brandName
      }
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
};

// Upload highlight cover image
exports.uploadHighlightCover = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.userId;
    let coverUrl;

    // Check if using cloud storage (Cloudinary)
    if (useCloudStorage()) {
      // Upload to Cloudinary
      const uploadResult = await cloudinaryService.uploadBuffer(req.file.buffer, {
        folder: 'slayt/highlights',
        resourceType: 'image',
        transformation: [
          { width: 300, height: 300, crop: 'fill' }
        ]
      });
      coverUrl = uploadResult.secure_url;
    } else {
      // Local storage fallback
      const filename = `highlight-${userId}-${Date.now()}${path.extname(req.file.originalname || '.jpg')}`;
      const filepath = path.join(uploadDir, filename);
      await fs.writeFile(filepath, req.file.buffer);
      coverUrl = `/uploads/${filename}`;
    }

    res.json({
      message: 'Highlight cover uploaded successfully',
      coverUrl
    });
  } catch (error) {
    console.error('Upload highlight cover error:', error);
    res.status(500).json({ error: 'Failed to upload highlight cover' });
  }
};

// Get user's Instagram highlights from cloud
exports.getHighlights = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      highlights: user.instagramHighlights || [],
      isVerified: user.isVerified || false
    });
  } catch (error) {
    console.error('Get highlights error:', error);
    res.status(500).json({ error: 'Failed to get highlights' });
  }
};

// Save user's Instagram highlights to cloud
exports.saveHighlights = async (req, res) => {
  try {
    const { highlights, isVerified } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update highlights
    if (highlights !== undefined) {
      user.instagramHighlights = highlights.map(h => ({
        highlightId: h.id || h.highlightId,
        name: h.name || 'New',
        cover: h.cover || null,
        coverPosition: h.coverPosition || { x: 0, y: 0 },
        coverZoom: h.coverZoom || 1,
        stories: h.stories || []
      }));
    }

    // Update verified status
    if (isVerified !== undefined) {
      user.isVerified = isVerified;
    }

    await user.save();

    res.json({
      message: 'Highlights saved successfully',
      highlights: user.instagramHighlights,
      isVerified: user.isVerified
    });
  } catch (error) {
    console.error('Save highlights error:', error);
    res.status(500).json({ error: 'Failed to save highlights' });
  }
};

// Instagram OAuth - Initiate Login (for signing in)
exports.instagramAuthLogin = (req, res, next) => {
  if (!process.env.INSTAGRAM_CLIENT_ID || !process.env.INSTAGRAM_CLIENT_SECRET) {
    return res.redirect('/?instagram_login=error&message=credentials_missing');
  }
  passport.authenticate('instagram-login', {
    scope: ['user_profile', 'user_media'],
    session: false
  })(req, res, next);
};

// Instagram OAuth - Callback for Login
exports.instagramLoginCallback = (req, res, next) => {
  passport.authenticate('instagram-login', { session: false }, async (err, user, info) => {
    try {
      if (err || !user) {
        console.error('Instagram login error:', err || 'No user returned');
        return res.redirect('/?instagram_login=error');
      }

      // Generate JWT token
      const token = generateToken(user._id);

      // Redirect to frontend with token
      res.redirect(`/?instagram_login=success&token=${token}`);
    } catch (error) {
      console.error('Instagram login callback error:', error);
      res.redirect('/?instagram_login=error');
    }
  })(req, res, next);
};

// Instagram OAuth - Initiate Account Connection (for existing users)
exports.instagramAuth = (req, res) => {
  if (!process.env.INSTAGRAM_CLIENT_ID || !process.env.INSTAGRAM_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Instagram credentials are not configured' });
  }

  res.json({
    url: buildInstagramConnectUrl({ userId: req.userId }),
  });
};

// Instagram OAuth - Callback
exports.instagramCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const stateData = decodeOAuthState(state);
    const userId = stateData?.userId;
    const profileId = stateData?.profileId;

    if (!userId) {
      return res.redirect(buildFrontendRedirect('/connections', { instagram_error: 'missing_state' }));
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_id: process.env.INSTAGRAM_CLIENT_ID,
      client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: INSTAGRAM_CONNECT_CALLBACK_URL,
      code,
    });

    const tokenResponse = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      tokenParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, user_id } = tokenResponse.data;

    // Get long-lived token
    const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        access_token
      }
    });

    const longLivedToken = longLivedResponse.data.access_token;
    const expiresIn = longLivedResponse.data.expires_in;

    let instagramUsername = null;
    try {
      const meResponse = await axios.get('https://graph.instagram.com/me', {
        params: {
          fields: 'id,username,account_type',
          access_token: longLivedToken,
        },
      });
      instagramUsername = meResponse.data?.username || null;
    } catch (profileError) {
      console.warn('Failed to fetch Instagram username during connection:', profileError.response?.data || profileError.message);
    }

    await upsertInstagramConnection({
      userId,
      profileId,
      connection: {
        accessToken: longLivedToken,
        userId: user_id,
        username: instagramUsername,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    res.redirect(buildFrontendRedirect('/connections', { instagram_success: 'true' }));
  } catch (error) {
    console.error('Instagram callback error:', error);
    res.redirect(buildFrontendRedirect('/connections', { instagram_error: 'callback_failed' }));
  }
};

// Disconnect Instagram
exports.disconnectInstagram = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.socialAccounts.instagram = {
      connected: false,
      accessToken: null,
      refreshToken: null,
      userId: null,
      username: null,
      expiresAt: null
    };
    await user.save();

    res.json({ message: 'Instagram disconnected successfully' });
  } catch (error) {
    console.error('Disconnect Instagram error:', error);
    res.status(500).json({ error: 'Failed to disconnect Instagram' });
  }
};

exports.refreshInstagramConnection = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.socialAccounts?.instagram?.connected || !user.socialAccounts.instagram.accessToken) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: user.socialAccounts.instagram.accessToken,
      },
    });

    user.socialAccounts.instagram.accessToken = response.data.access_token;
    user.socialAccounts.instagram.expiresAt = new Date(Date.now() + (response.data.expires_in || 0) * 1000);
    await user.save();

    res.json({ message: 'Instagram token refreshed successfully' });
  } catch (error) {
    console.error('Refresh Instagram token error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to refresh Instagram token' });
  }
};

// TikTok OAuth - Initiate
exports.tiktokAuth = (req, res) => {
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
    return res.status(500).json({ error: 'TikTok credentials are not configured' });
  }

  res.json({
    url: buildTikTokConnectUrl({ userId: req.userId }),
  });
};

// TikTok OAuth - Callback
exports.tiktokCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const stateData = decodeOAuthState(state);
    const userId = stateData?.userId;
    const profileId = stateData?.profileId;

    if (!userId) {
      return res.redirect(buildFrontendRedirect('/connections', { tiktok_error: 'missing_state' }));
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: TIKTOK_CONNECT_CALLBACK_URL,
    });

    const tokenResponse = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      tokenParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const tokenData = tokenResponse.data?.data || tokenResponse.data;
    const { access_token, refresh_token, expires_in, open_id } = tokenData;

    let creatorInfo = null;
    try {
      const creatorInfoResponse = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {},
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        },
      );
      creatorInfo = creatorInfoResponse.data?.data || null;
    } catch (creatorInfoError) {
      console.warn('Failed to fetch TikTok creator info during connection:', creatorInfoError.response?.data || creatorInfoError.message);
    }

    await upsertTiktokConnection({
      userId,
      profileId,
      connection: {
        accessToken: access_token,
        refreshToken: refresh_token,
        userId: open_id,
        username: creatorInfo?.creator_username || creatorInfo?.creator_nickname || open_id || null,
        expiresAt: new Date(Date.now() + (expires_in || 0) * 1000),
      },
    });

    res.redirect(buildFrontendRedirect('/connections', { tiktok_success: 'true' }));
  } catch (error) {
    console.error('TikTok callback error:', error);
    res.redirect(buildFrontendRedirect('/connections', { tiktok_error: 'callback_failed' }));
  }
};

// Disconnect TikTok
exports.disconnectTiktok = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.socialAccounts.tiktok = {
      connected: false,
      accessToken: null,
      refreshToken: null,
      userId: null,
      username: null,
      expiresAt: null
    };
    await user.save();

    res.json({ message: 'TikTok disconnected successfully' });
  } catch (error) {
    console.error('Disconnect TikTok error:', error);
    res.status(500).json({ error: 'Failed to disconnect TikTok' });
  }
};

exports.refreshTiktokConnection = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.socialAccounts?.tiktok?.connected || !user.socialAccounts.tiktok.refreshToken) {
      return res.status(400).json({ error: 'TikTok not connected' });
    }

    const tokenParams = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: user.socialAccounts.tiktok.refreshToken,
    });

    const response = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      tokenParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const tokenData = response.data?.data || response.data;
    user.socialAccounts.tiktok.accessToken = tokenData.access_token;
    user.socialAccounts.tiktok.refreshToken = tokenData.refresh_token || user.socialAccounts.tiktok.refreshToken;
    user.socialAccounts.tiktok.expiresAt = new Date(Date.now() + (tokenData.expires_in || 0) * 1000);
    await user.save();

    res.json({ message: 'TikTok token refreshed successfully' });
  } catch (error) {
    console.error('Refresh TikTok token error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to refresh TikTok token' });
  }
};

exports.getConnections = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('socialAccounts socialMedia');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      instagram: {
        connected: Boolean(user.socialAccounts?.instagram?.connected),
        username: user.socialAccounts?.instagram?.username || null,
      },
      tiktok: {
        connected: Boolean(user.socialAccounts?.tiktok?.connected),
        username: user.socialAccounts?.tiktok?.username || null,
      },
      youtube: {
        connected: Boolean(user.socialAccounts?.youtube?.connected || user.socialMedia?.youtube?.accessToken),
        channelTitle: user.socialAccounts?.youtube?.channelTitle || user.socialMedia?.youtube?.channelTitle || null,
      },
      pinterest: {
        connected: false,
      },
    });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Failed to fetch platform connections' });
  }
};

exports.getPlatformReadinessAudit = async (req, res) => {
  try {
    res.json(buildPlatformReadinessAudit());
  } catch (error) {
    console.error('Get platform readiness audit error:', error);
    res.status(500).json({ error: 'Failed to build platform readiness audit' });
  }
};

// Get social media connection status
exports.getSocialStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    res.json({
      instagram: {
        connected: user.socialAccounts.instagram.connected,
        username: user.socialAccounts.instagram.username
      },
      tiktok: {
        connected: user.socialAccounts.tiktok.connected,
        username: user.socialAccounts.tiktok.username
      },
      youtube: {
        connected: user.socialAccounts?.youtube?.connected || Boolean(user.socialMedia?.youtube?.accessToken),
        username: user.socialAccounts?.youtube?.channelTitle || user.socialMedia?.youtube?.channelTitle || null,
      }
    });
  } catch (error) {
    console.error('Get social status error:', error);
    res.status(500).json({ error: 'Failed to get social status' });
  }
};

// Google OAuth - Initiate (handled by passport)
exports.googleAuth = (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/?google=error&message=credentials_missing');
  }
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })(req, res, next);
};

// Google OAuth - Callback
exports.googleCallback = (req, res, next) => {
  passport.authenticate('google', { session: false }, async (err, user, info) => {
    try {
      const frontendUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

      if (err || !user) {
        console.error('Google auth error:', err || 'No user returned');
        return res.redirect(`${frontendUrl}/login?google=error`);
      }

      // Generate JWT token
      const token = generateToken(user._id);

      // Redirect to frontend with token
      res.redirect(`${frontendUrl}/login?google=success&token=${token}`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${frontendUrl}/login?google=error`);
    }
  })(req, res, next);
};
