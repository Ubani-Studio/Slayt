const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Local authentication
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/clarosa', authenticate, authController.updateClarosaConnection);
router.post('/clarosa/index-library', authenticate, authController.indexClarosaLibrary);
router.put('/avatar', authenticate, upload.single('avatar'), authController.uploadAvatar);
router.post('/highlight-cover', authenticate, upload.single('cover'), authController.uploadHighlightCover);
router.get('/connections', authenticate, authController.getConnections);
router.get('/connections/audit', authenticate, authController.getPlatformReadinessAudit);

// Instagram highlights (cloud backup)
router.get('/highlights', authenticate, authController.getHighlights);
router.put('/highlights', authenticate, authController.saveHighlights);

// Google OAuth
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

// Instagram OAuth - Login (for signing in)
router.get('/instagram/login', authController.instagramAuthLogin);
router.get('/instagram/callback', authController.instagramLoginCallback);

// Instagram OAuth - Connect Account (for existing users)
router.get('/instagram', authenticate, authController.instagramAuth);
router.get('/instagram/connect', authenticate, authController.instagramAuth);
router.get('/instagram/connect/callback', authController.instagramCallback);
router.post('/instagram/disconnect', authenticate, authController.disconnectInstagram);
router.post('/instagram/refresh', authenticate, authController.refreshInstagramConnection);

// TikTok OAuth
router.get('/tiktok', authenticate, authController.tiktokAuth);
router.get('/tiktok/callback', authController.tiktokCallback);
router.post('/tiktok/disconnect', authenticate, authController.disconnectTiktok);
router.post('/tiktok/refresh', authenticate, authController.refreshTiktokConnection);

// Check social media connection status
router.get('/social/status', authenticate, authController.getSocialStatus);

module.exports = router;
