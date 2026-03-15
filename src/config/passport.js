const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const User = require('../models/User');

const BACKEND_BASE_URL = `${process.env.API_URL || process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3002}`}`.replace(/\/+$/, '');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy (only if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${BACKEND_BASE_URL}/api/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Google ID
      let user = await User.findOne({ googleId: profile.id });

      if (user) {
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }

      // Check if user exists with this email (local account)
      user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        // Link Google account to existing local account
        user.googleId = profile.id;
        user.authProvider = 'google';
        user.avatar = profile.photos[0]?.value;
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }

      // Create new user
      user = new User({
        googleId: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar: profile.photos[0]?.value,
        authProvider: 'google',
        lastLogin: new Date()
      });

      await user.save();
      done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      done(error, null);
    }
  }));
  console.log('✅ Google OAuth enabled');
} else {
  console.log('⚠️  Google OAuth disabled (missing credentials)');
}

// Instagram OAuth Strategy for Login (using Instagram Basic Display API)
if (process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET) {
  const instagramStrategy = new OAuth2Strategy({
    authorizationURL: 'https://api.instagram.com/oauth/authorize',
    tokenURL: 'https://api.instagram.com/oauth/access_token',
    clientID: process.env.INSTAGRAM_CLIENT_ID,
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
    callbackURL: process.env.INSTAGRAM_REDIRECT_URI || `${BACKEND_BASE_URL}/api/auth/instagram/callback`,
    scope: ['user_profile', 'user_media'],
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, params, profile, done) => {
    try {
      // Get user info from Instagram
      const userResponse = await axios.get('https://graph.instagram.com/me', {
        params: {
          fields: 'id,username,account_type',
          access_token: accessToken
        }
      });

      const instagramUser = userResponse.data;

      // Exchange for long-lived token
      let longLivedToken = accessToken;
      let expiresIn = 3600;
      try {
        const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
          params: {
            grant_type: 'ig_exchange_token',
            client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
            access_token: accessToken
          }
        });
        longLivedToken = longLivedResponse.data.access_token;
        expiresIn = longLivedResponse.data.expires_in;
      } catch (tokenError) {
        console.log('Could not exchange for long-lived token, using short-lived');
      }

      // Check if user already exists with this Instagram ID
      let user = await User.findOne({ instagramId: instagramUser.id });

      if (user) {
        // Update last login and token
        user.lastLogin = new Date();
        user.socialAccounts.instagram = {
          connected: true,
          accessToken: longLivedToken,
          userId: instagramUser.id,
          username: instagramUser.username,
          expiresAt: new Date(Date.now() + expiresIn * 1000)
        };
        await user.save();
        return done(null, user);
      }

      // Create new user with Instagram login
      user = new User({
        instagramId: instagramUser.id,
        email: `${instagramUser.username}@instagram.placeholder`,
        name: instagramUser.username,
        authProvider: 'instagram',
        lastLogin: new Date(),
        socialAccounts: {
          instagram: {
            connected: true,
            accessToken: longLivedToken,
            userId: instagramUser.id,
            username: instagramUser.username,
            expiresAt: new Date(Date.now() + expiresIn * 1000)
          },
          tiktok: {
            connected: false
          }
        }
      });

      await user.save();
      done(null, user);
    } catch (error) {
      console.error('Instagram OAuth error:', error.response?.data || error.message);
      done(error, null);
    }
  });

  // Override userProfile to work with Instagram's non-standard response
  instagramStrategy.userProfile = function(accessToken, done) {
    done(null, {});
  };

  passport.use('instagram-login', instagramStrategy);
  console.log('✅ Instagram OAuth enabled');
} else {
  console.log('⚠️  Instagram OAuth disabled (missing credentials)');
}

module.exports = passport;
