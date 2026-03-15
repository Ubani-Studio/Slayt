const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinaryService = require('../services/cloudinaryService');

// Ensure upload directories exist (for local storage fallback)
const uploadDir = path.join(__dirname, '../../uploads');
const thumbnailDir = path.join(__dirname, '../../uploads/thumbnails');

[uploadDir, thumbnailDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Check if we should use cloud storage
const useCloudStorage = () => cloudinaryService.isConfigured();

// Configure storage - use memory storage when cloud is configured
// This allows us to upload the buffer directly to Cloudinary
const storage = useCloudStorage()
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
        cb(null, filename);
      }
    });

// File filter
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
  ];
  const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
  const allowedLutTypes = ['application/octet-stream', 'text/plain', 'application/x-cube'];
  const allowedScheduleTypes = ['text/csv', 'text/calendar', 'application/json'];
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedLutTypes, ...allowedScheduleTypes];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max file size
  }
});

// Export both upload middleware and helper functions
module.exports = upload;
module.exports.useCloudStorage = useCloudStorage;
module.exports.uploadDir = uploadDir;
module.exports.thumbnailDir = thumbnailDir;
