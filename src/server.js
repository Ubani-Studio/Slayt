const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const connectDB = require('./config/database');
const passport = require('./config/passport');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const gridRoutes = require('./routes/grid');
const aiRoutes = require('./routes/ai');
const alchemyRoutes = require('./routes/alchemy');
const collectionRoutes = require('./routes/collection');
const { createProxyMiddleware } = require('http-proxy-middleware');
const haloRoutes = require('./routes/halo');
const postingRoutes = require('./routes/posting');
const linkInBioRoutes = require('./routes/linkinbio');
const brandKitRoutes = require('./routes/brandkit');
const mediaKitRoutes = require('./routes/mediakit');
const workspaceRoutes = require('./routes/workspace');
const approvalRoutes = require('./routes/approval');
const youtubeRoutes = require('./routes/youtube');
const youtubeAuthRoutes = require('./routes/youtubeAuth');
const rolloutRoutes = require('./routes/rollout');
const reelCollectionRoutes = require('./routes/reelCollection');
const profileRoutes = require('./routes/profile');
const intelligenceRoutes = require('./routes/intelligence');
const characterRoutes = require('./routes/character');
const convictionRoutes = require('./routes/conviction');
const performanceRoutes = require('./routes/performance');
const templateRoutes = require('./routes/template');
const apiKeyManagementRoutes = require('./routes/apiKeyManagement');
const bovedaRoutes = require('./routes/boveda');  // Boveda API proxy
const twinOsRoutes = require('./routes/twinOs');
const cruciblaRoutes = require('./routes/crucibla');

const APP_ORIGIN = `${process.env.CLIENT_URL || process.env.FRONTEND_URL || process.env.FOLIO_APP_ORIGIN || 'http://localhost:5173'}`.replace(/\/+$/, '');
const schedulingService = require('./services/schedulingService');
const convictionLoopService = require('./services/convictionLoopService');

// Connect to MongoDB
connectDB();

// Start scheduling service
setTimeout(() => {
  schedulingService.start();
}, 5000); // Start after 5 seconds to ensure DB is connected

// Start conviction loop service (after scheduling service)
setTimeout(() => {
  convictionLoopService.start();
}, 10000);

const app = express();
const PORT = process.env.PORT || 3002;
const FOLIO_API_URL = process.env.FOLIO_API_URL || 'http://localhost:3001';

// ngrok/TikTok requests arrive through a trusted reverse proxy in local dev.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for local development
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs (increased for batch uploads)
});
app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: APP_ORIGIN,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'postpilot-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/grid', gridRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/alchemy', alchemyRoutes);
app.use('/api/collection', collectionRoutes);
app.use('/api/halo', haloRoutes);
app.use('/api/post', postingRoutes);
app.use('/api/linkinbio', linkInBioRoutes);
app.use('/api/brandkit', brandKitRoutes);
app.use('/api/mediakit', mediaKitRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/auth/youtube', youtubeAuthRoutes);
app.use('/api/rollout', rolloutRoutes);
app.use('/api/reel-collections', reelCollectionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/conviction', convictionRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/admin/api-keys', apiKeyManagementRoutes); // API key management
app.use('/api/boveda', bovedaRoutes); // Boveda API proxy
app.use('/api/twin-os', twinOsRoutes); // Twin OS (Starforge + Clarosa)
app.use('/api/crucibla', cruciblaRoutes); // Crucibla ecosystem proxy

// Proxy to Folio API to avoid CORS pain locally
app.use('/folio', createProxyMiddleware({
  target: FOLIO_API_URL,
  changeOrigin: true,
  secure: false,
  pathRewrite: { '^/folio': '' },
  onProxyRes: (proxyRes) => {
    proxyRes.headers['Access-Control-Allow-Origin'] = APP_ORIGIN;
    proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
  }
}));

// Health check endpoints (both /health and /api/health for compatibility)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve the minimalist planner if the Vite build exists
const alchemyDistPath = path.join(__dirname, '../public/alchemy');
if (fs.existsSync(alchemyDistPath)) {
  app.use('/alchemy', express.static(alchemyDistPath));
  app.get('/alchemy/*', (req, res) => {
    res.sendFile(path.join(alchemyDistPath, 'index.html'));
  });
} else {
  console.warn('⚠️  Alchemy client build missing. Run `npm run mini:publish` to generate it.');
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║     🐼 PostPanda - AI Content Planner Started        ║
  ║                                                       ║
  ║     🌐 Server: http://localhost:${PORT}                 ║
  ║     📊 API: http://localhost:${PORT}/api              ║
  ║     ❤️  Health: http://localhost:${PORT}/api/health     ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
