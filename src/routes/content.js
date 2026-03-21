const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Reel upload (video with client-generated thumbnail)
router.post('/reel', authenticate, upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), contentController.createReel);

// Content CRUD
router.post('/', authenticate, upload.single('media'), contentController.createContent);
router.get('/', authenticate, contentController.getAllContent);
router.post('/sync-clarosa', authenticate, contentController.syncClarosaInsights);
router.get('/:id', authenticate, contentController.getContentById);
router.put('/:id', authenticate, contentController.updateContent);
router.put('/:id/rate', authenticate, contentController.rateContent);
router.delete('/:id', authenticate, contentController.deleteContent);

// Thumbnail update
router.put('/:id/thumbnail', authenticate, upload.single('thumbnail'), contentController.updateThumbnail);

// Media update (for edited images)
router.put('/:id/media', authenticate, upload.single('media'), contentController.updateMedia);

// Version management
router.post('/:id/versions', authenticate, upload.single('media'), contentController.addVersion);
router.put('/:id/versions/:versionId/select', authenticate, contentController.selectVersion);
router.delete('/:id/versions/:versionId', authenticate, contentController.deleteVersion);

// Scheduling
router.post('/:id/schedule', authenticate, contentController.scheduleContent);
router.post('/:id/publish', authenticate, contentController.publishContent);

module.exports = router;
