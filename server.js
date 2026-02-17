require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

const { dataDir, thumbDir, assetsDir, metadataPath } = require('./helpers/data');
const { requireAuth } = require('./routes/auth');

// Trust nginx reverse proxy
app.set('trust proxy', 1);

// ===== ENSURE DIRECTORIES =====
const thumbCacheDir = path.join(__dirname, '.thumb-cache');
[dataDir, thumbDir, assetsDir, thumbCacheDir, path.join(__dirname, 'uploads', 'posts')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(metadataPath)) {
  fs.writeFileSync(metadataPath, JSON.stringify({ posts: [], assets: [] }, null, 2));
}

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ===== RESIZED THUMBNAIL ENDPOINT =====
const ALLOWED_WIDTHS = [320, 480, 640];
app.get('/thumb/:width/*imgPath', (req, res) => {
  const width = parseInt(req.params.width);
  if (!ALLOWED_WIDTHS.includes(width)) return res.status(400).send('Invalid width');

  const imgPath = Array.isArray(req.params.imgPath) ? req.params.imgPath.join('/') : req.params.imgPath;
  const srcFile = path.resolve(thumbDir, imgPath);
  if (!srcFile.startsWith(thumbDir) || !fs.existsSync(srcFile)) return res.status(404).send('Not found');

  const cacheKey = `${width}-${imgPath.replace(/[/\\]/g, '_')}`;
  const cachePath = path.join(thumbCacheDir, cacheKey);

  const ext = path.extname(srcFile).slice(1) || 'webp';

  if (fs.existsSync(cachePath)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(ext);
    return fs.createReadStream(cachePath).pipe(res);
  }

  sharp(srcFile)
    .resize(width, null, { withoutEnlargement: true })
    .toFile(cachePath)
    .then(() => {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.type(ext);
      fs.createReadStream(cachePath).pipe(res);
    })
    .catch(() => res.status(500).send('Resize failed'));
});

// Static file serving
app.use('/thumbnails', express.static(thumbDir, { maxAge: '7d' }));
app.use('/assets', express.static(assetsDir, { index: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.redirect('/gallery'));
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'views', 'gallery.html')));
app.get('/posts', (req, res) => res.sendFile(path.join(__dirname, 'views', 'posts.html')));
app.get('/assets', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'assets.html')));

// ===== ROUTE MODULES =====
app.use(require('./routes/auth').router);
app.use(require('./routes/categories'));
app.use(require('./routes/thumbnails'));
app.use(require('./routes/posts'));
app.use(require('./routes/assets'));

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`BMB Content Server running on http://localhost:${PORT}`);
  console.log(`  Gallery:  http://localhost:${PORT}/gallery`);
  console.log(`  Posts:    http://localhost:${PORT}/posts`);
  console.log(`  Assets:   http://localhost:${PORT}/assets`);
  console.log(`  Admin:    http://localhost:${PORT}/admin`);
});
