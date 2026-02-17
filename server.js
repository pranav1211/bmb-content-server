require('dotenv').config();
const express = require('express');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const metadataPath = path.join(dataDir, 'metadata.json');
const thumbDir = path.join(__dirname, 'thumbnails');
const assetsDir = path.join(__dirname, 'assets');

// Trust nginx reverse proxy
app.set('trust proxy', 1);

// ===== ENSURE DIRECTORIES =====
[dataDir, thumbDir, assetsDir, path.join(__dirname, 'uploads', 'posts')].forEach(dir => {
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

// Static file serving
app.use('/thumbnails', express.static(thumbDir));
app.use('/assets', express.static(assetsDir, { index: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== HELPER FUNCTIONS =====

function generateId() {
  return crypto.randomBytes(3).toString('hex');
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
}

function generateSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function sortByDateDesc(items) {
  return items.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
}

// ===== CATEGORY FILE HELPERS =====

function getCategoryIds() {
  return fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json') && f !== 'metadata.json')
    .map(f => f.replace('.json', ''));
}

function readCategoryFile(catId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, `${catId}.json`), 'utf-8'));
  } catch { return null; }
}

function writeCategoryFile(catId, data) {
  fs.writeFileSync(path.join(dataDir, `${catId}.json`), JSON.stringify(data, null, 2));
}

function getAllCategories() {
  return getCategoryIds().map(id => {
    const data = readCategoryFile(id);
    return {
      id,
      name: data?.name || id,
      subcategories: data?.subcategories || [],
      thumbnailCount: data?.thumbnails?.length || 0
    };
  });
}

function getAllThumbnails() {
  let all = [];
  for (const catId of getCategoryIds()) {
    const data = readCategoryFile(catId);
    if (data?.thumbnails) {
      all = all.concat(data.thumbnails.map(t => ({
        ...t,
        category: catId,
        categoryName: data.name,
        subcategoryName: (data.subcategories || []).find(s => s.id === t.subcategory)?.name || ''
      })));
    }
  }
  return all;
}

// Ensure thumbnail folder structure exists for a category/subcategory
function ensureThumbFolder(catId, subId) {
  const parts = [thumbDir, catId];
  if (subId) parts.push(subId);
  const dir = path.join(...parts);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ===== POSTS & ASSETS HELPERS =====

function readMetadata() {
  try { return JSON.parse(fs.readFileSync(metadataPath, 'utf-8')); }
  catch { return { posts: [], assets: [] }; }
}

function writeMetadata(data) {
  fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
}

function readPosts() { return readMetadata().posts || []; }
function writePosts(posts) {
  const meta = readMetadata();
  meta.posts = posts;
  writeMetadata(meta);
}

function readAssets() {
  return (readMetadata().assets || []).map(a => ({ folder: '', ...a }));
}
function writeAssets(assets) {
  const meta = readMetadata();
  meta.assets = assets;
  writeMetadata(meta);
}

// ===== POST-UPLOAD HOOK =====
function runPushScript() {
  const scriptPath = path.join(__dirname, 'shellfiles', 'push.sh');
  if (!fs.existsSync(scriptPath)) return;
  exec(`bash "${scriptPath}"`, { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) console.error('push.sh error:', err.message);
    if (stdout) console.log('push.sh:', stdout.trim());
    if (stderr) console.error('push.sh stderr:', stderr.trim());
  });
}

// ===== MULTER CONFIG =====

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
};

// Thumbnail upload uses memory storage so we can determine destination from form fields
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter
});

const postUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'htmlFile') {
      if (file.mimetype === 'text/html' || file.originalname.endsWith('.html') || file.originalname.endsWith('.htm')) cb(null, true);
      else cb(new Error('Only HTML files are allowed for content'), false);
    } else if (file.fieldname === 'images') {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
    } else cb(new Error('Unexpected field'), false);
  }
});

// Asset upload - any file type, 50MB limit, uses memory storage for dynamic dest
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ===== AUTH MIDDLEWARE =====

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/admin/login');
}

// ===== PAGE ROUTES =====

app.get('/', (req, res) => res.redirect('/gallery'));

app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));

app.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = process.env.ADMIN_PASSWORD;
    if (!hashedPassword) return res.status(500).json({ error: 'Admin password not configured' });
    const match = await bcrypt.compare(password, hashedPassword);
    if (match) { req.session.authenticated = true; res.json({ success: true, redirect: '/admin' }); }
    else res.status(401).json({ error: 'Invalid password' });
  } catch (error) { console.error('Login error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/admin/logout', (req, res) => { req.session.destroy(() => res.redirect('/admin/login')); });
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'views', 'gallery.html')));
app.get('/posts', (req, res) => res.sendFile(path.join(__dirname, 'views', 'posts.html')));

// Assets page - protected
app.get('/assets', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'assets.html'));
});

app.get('/posts/:slug', (req, res) => {
  const { slug } = req.params;
  const posts = readPosts();
  const post = posts.find(p => p.slug === slug);
  if (!post) return res.status(404).send(notFoundHTML('Post not found'));

  const contentPath = path.join(__dirname, 'uploads', 'posts', slug, 'content.html');
  if (!fs.existsSync(contentPath)) return res.status(404).send(notFoundHTML('Post content not found'));

  let htmlContent = fs.readFileSync(contentPath, 'utf-8');
  htmlContent = htmlContent.replace(/src=["'](?!http|\/|data:)(.*?)["']/g, `src="/uploads/posts/${slug}/$1"`);
  res.send(postViewHTML(post, htmlContent));
});

// ===== CATEGORY API =====

app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: getAllCategories() });
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'ID and name are required' });
  const sanitizedId = id.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  if (!sanitizedId) return res.status(400).json({ error: 'Invalid category ID' });
  if (sanitizedId === 'metadata') return res.status(400).json({ error: 'Reserved name' });
  if (fs.existsSync(path.join(dataDir, `${sanitizedId}.json`))) return res.status(400).json({ error: 'Category already exists' });

  writeCategoryFile(sanitizedId, { name: name.trim(), subcategories: [], thumbnails: [] });
  ensureThumbFolder(sanitizedId);
  res.json({ success: true });
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.id);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
  data.name = req.body.name.trim();
  writeCategoryFile(req.params.id, data);
  res.json({ success: true });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const filePath = path.join(dataDir, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Category not found' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ===== SUBCATEGORY API =====

app.post('/api/categories/:id/subcategories', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.id);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  const { id, name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'ID and name are required' });
  const sanitizedId = id.toLowerCase().replace(/[^a-z0-9-]/g, '').trim();
  if (!sanitizedId) return res.status(400).json({ error: 'Invalid subcategory ID' });
  if (data.subcategories.find(s => s.id === sanitizedId)) return res.status(400).json({ error: 'Subcategory already exists' });

  data.subcategories.push({ id: sanitizedId, name: name.trim() });
  writeCategoryFile(req.params.id, data);
  ensureThumbFolder(req.params.id, sanitizedId);
  res.json({ success: true });
});

app.put('/api/categories/:catId/subcategories/:subId', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.catId);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  const sub = data.subcategories.find(s => s.id === req.params.subId);
  if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
  sub.name = req.body.name.trim();
  writeCategoryFile(req.params.catId, data);
  res.json({ success: true });
});

app.delete('/api/categories/:catId/subcategories/:subId', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.catId);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  const index = data.subcategories.findIndex(s => s.id === req.params.subId);
  if (index === -1) return res.status(404).json({ error: 'Subcategory not found' });
  data.thumbnails.forEach(t => { if (t.subcategory === req.params.subId) t.subcategory = ''; });
  data.subcategories.splice(index, 1);
  writeCategoryFile(req.params.catId, data);
  res.json({ success: true });
});

// ===== THUMBNAIL API =====

app.get('/api/thumbnails', (req, res) => {
  let thumbnails = getAllThumbnails();
  if (req.query.category) thumbnails = thumbnails.filter(t => t.category === req.query.category);
  if (req.query.subcategory) thumbnails = thumbnails.filter(t => t.subcategory === req.query.subcategory);
  res.json({ success: true, thumbnails: sortByDateDesc(thumbnails) });
});

app.post('/api/upload/thumbnail', requireAuth, (req, res) => {
  thumbnailUpload.single('thumbnail')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { category, subcategory } = req.body;
    if (!category) return res.status(400).json({ error: 'Category is required' });

    const catData = readCategoryFile(category);
    if (!catData) return res.status(400).json({ error: 'Category not found' });

    // Save file to thumbnails/{category}/{subcategory}/{originalname}
    const destDir = ensureThumbFolder(category, subcategory || '');
    let filename = sanitizeFilename(req.file.originalname);
    // Handle collision
    let counter = 1;
    while (fs.existsSync(path.join(destDir, filename))) {
      const ext = path.extname(req.file.originalname);
      const base = path.basename(req.file.originalname, ext);
      filename = sanitizeFilename(`${base}-${counter}${ext}`);
      counter++;
    }
    fs.writeFileSync(path.join(destDir, filename), req.file.buffer);

    // Build URL path
    const urlParts = ['/thumbnails', category];
    if (subcategory) urlParts.push(subcategory);
    urlParts.push(filename);

    const entry = {
      id: generateId(),
      filename: filename,
      originalName: req.file.originalname,
      path: urlParts.join('/'),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      subcategory: subcategory || '',
      uploadDate: new Date().toISOString()
    };

    catData.thumbnails.push(entry);
    writeCategoryFile(category, catData);
    runPushScript();
    res.json({ success: true, thumbnail: entry });
  });
});

// Edit thumbnail (rename, change category/subcategory)
app.put('/api/thumbnails/:id', requireAuth, (req, res) => {
  const { newName, newCategory, newSubcategory } = req.body;
  const thumbId = req.params.id;

  // Find which category file has this thumbnail
  let foundCatId = null, foundData = null, foundThumb = null, foundIndex = -1;
  for (const catId of getCategoryIds()) {
    const data = readCategoryFile(catId);
    if (!data?.thumbnails) continue;
    const idx = data.thumbnails.findIndex(t => t.id === thumbId);
    if (idx !== -1) {
      foundCatId = catId; foundData = data; foundThumb = data.thumbnails[idx]; foundIndex = idx;
      break;
    }
  }
  if (!foundThumb) return res.status(404).json({ error: 'Thumbnail not found' });

  const targetCat = newCategory || foundCatId;
  const targetSub = newSubcategory !== undefined ? newSubcategory : foundThumb.subcategory;

  // Handle file rename
  let finalFilename = foundThumb.filename;
  if (newName && newName !== foundThumb.filename) {
    const oldExt = path.extname(foundThumb.filename);
    const newExt = path.extname(newName);
    finalFilename = sanitizeFilename(newExt ? newName : newName + oldExt);

    const oldDir = ensureThumbFolder(foundCatId, foundThumb.subcategory || '');
    const oldFile = path.join(oldDir, foundThumb.filename);
    // We'll move to new location below if category changed, otherwise rename in place
    if (targetCat === foundCatId && targetSub === foundThumb.subcategory) {
      const newFile = path.join(oldDir, finalFilename);
      if (fs.existsSync(newFile) && finalFilename !== foundThumb.filename) return res.status(400).json({ error: 'A file with that name already exists' });
      if (fs.existsSync(oldFile)) fs.renameSync(oldFile, newFile);
    }
  }

  // Handle category/subcategory move
  if (targetCat !== foundCatId || targetSub !== foundThumb.subcategory) {
    const targetData = targetCat === foundCatId ? foundData : readCategoryFile(targetCat);
    if (!targetData) return res.status(400).json({ error: 'Target category not found' });

    const oldDir = ensureThumbFolder(foundCatId, foundThumb.subcategory || '');
    const newDir = ensureThumbFolder(targetCat, targetSub || '');
    const oldFile = path.join(oldDir, foundThumb.filename);
    const newFile = path.join(newDir, finalFilename);
    if (fs.existsSync(newFile) && (oldFile !== newFile)) return res.status(400).json({ error: 'A file with that name already exists in the target location' });
    if (fs.existsSync(oldFile)) fs.renameSync(oldFile, newFile);

    // Remove from old category
    foundData.thumbnails.splice(foundIndex, 1);
    writeCategoryFile(foundCatId, foundData);

    // Build new path
    const urlParts = ['/thumbnails', targetCat];
    if (targetSub) urlParts.push(targetSub);
    urlParts.push(finalFilename);

    foundThumb.filename = finalFilename;
    foundThumb.originalName = finalFilename;
    foundThumb.path = urlParts.join('/');
    foundThumb.subcategory = targetSub;

    // Add to target category
    if (targetCat === foundCatId) {
      foundData.thumbnails.push(foundThumb);
      writeCategoryFile(foundCatId, foundData);
    } else {
      targetData.thumbnails.push(foundThumb);
      writeCategoryFile(targetCat, targetData);
    }
  } else if (newName && newName !== foundThumb.filename) {
    // Just a rename, same location
    const urlParts = ['/thumbnails', foundCatId];
    if (foundThumb.subcategory) urlParts.push(foundThumb.subcategory);
    urlParts.push(finalFilename);

    foundThumb.filename = finalFilename;
    foundThumb.originalName = finalFilename;
    foundThumb.path = urlParts.join('/');
    writeCategoryFile(foundCatId, foundData);
  }

  res.json({ success: true, thumbnail: foundThumb });
});

// Delete thumbnail
app.delete('/api/thumbnails/:id', requireAuth, (req, res) => {
  for (const catId of getCategoryIds()) {
    const data = readCategoryFile(catId);
    if (!data?.thumbnails) continue;
    const idx = data.thumbnails.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
      const thumb = data.thumbnails[idx];
      const dir = ensureThumbFolder(catId, thumb.subcategory || '');
      const filePath = path.join(dir, thumb.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      data.thumbnails.splice(idx, 1);
      writeCategoryFile(catId, data);
      return res.json({ success: true });
    }
  }
  res.status(404).json({ error: 'Thumbnail not found' });
});

// ===== ASSET API (File Explorer) =====

// Helper: resolve a relative folder path safely within assetsDir
function resolveAssetPath(relPath) {
  const resolved = path.resolve(assetsDir, relPath || '');
  if (!resolved.startsWith(assetsDir)) return null;
  return resolved;
}

// List assets (with optional folder filter)
app.get('/api/assets', requireAuth, (req, res) => {
  const folder = (req.query.folder || '').replace(/^\/+/, '');
  const assets = readAssets().filter(a => {
    const assetFolder = a.folder || '';
    return assetFolder === folder;
  });
  res.json({ success: true, assets: sortByDateDesc(assets) });
});

// List folders
app.get('/api/assets/folders', requireAuth, (req, res) => {
  const parentFolder = (req.query.parent || '').replace(/^\/+/, '');
  const assets = readAssets();
  // Collect all unique folder paths
  const allFolders = new Set();
  assets.forEach(a => { if (a.folder) allFolders.add(a.folder); });
  // Also scan disk for empty folders
  function scanFolders(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      if (entry.isDirectory()) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        allFolders.add(rel);
        scanFolders(path.join(dir, entry.name), rel);
      }
    });
  }
  scanFolders(assetsDir, '');

  // Filter to direct children of parentFolder
  const children = [...allFolders].filter(f => {
    if (!parentFolder) return !f.includes('/');
    return f.startsWith(parentFolder + '/') && !f.slice(parentFolder.length + 1).includes('/');
  }).sort();

  res.json({ success: true, folders: children });
});

// Create folder
app.post('/api/assets/folders', requireAuth, (req, res) => {
  const { name, parent } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });
  const sanitized = sanitizeFilename(name);
  if (!sanitized) return res.status(400).json({ error: 'Invalid folder name' });
  const folderPath = parent ? `${parent}/${sanitized}` : sanitized;
  const fullPath = resolveAssetPath(folderPath);
  if (!fullPath) return res.status(400).json({ error: 'Invalid path' });
  if (fs.existsSync(fullPath)) return res.status(400).json({ error: 'Folder already exists' });
  fs.mkdirSync(fullPath, { recursive: true });
  res.json({ success: true, folder: folderPath });
});

// Rename folder
app.put('/api/assets/folders/rename', requireAuth, (req, res) => {
  const { oldPath, newName } = req.body;
  if (!oldPath || !newName) return res.status(400).json({ error: 'Old path and new name are required' });
  const sanitized = sanitizeFilename(newName);
  if (!sanitized) return res.status(400).json({ error: 'Invalid folder name' });

  const fullOld = resolveAssetPath(oldPath);
  if (!fullOld || !fs.existsSync(fullOld)) return res.status(404).json({ error: 'Folder not found' });

  const parentDir = path.dirname(oldPath);
  const newPath = parentDir === '.' ? sanitized : `${parentDir}/${sanitized}`;
  const fullNew = resolveAssetPath(newPath);
  if (!fullNew) return res.status(400).json({ error: 'Invalid path' });
  if (fs.existsSync(fullNew)) return res.status(400).json({ error: 'A folder with that name already exists' });

  fs.renameSync(fullOld, fullNew);

  // Update all asset paths that were inside this folder
  const assets = readAssets();
  assets.forEach(a => {
    if (a.folder === oldPath || (a.folder && a.folder.startsWith(oldPath + '/'))) {
      a.folder = a.folder === oldPath ? newPath : newPath + a.folder.slice(oldPath.length);
      a.path = `/assets/${a.folder}/${a.filename}`;
    }
  });
  writeAssets(assets);
  res.json({ success: true, newPath });
});

// Delete folder
app.delete('/api/assets/folders', requireAuth, (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });
  const fullPath = resolveAssetPath(folderPath);
  if (!fullPath || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Folder not found' });

  // Remove folder from disk
  fs.rmSync(fullPath, { recursive: true, force: true });

  // Remove assets in this folder
  let assets = readAssets();
  assets = assets.filter(a => !(a.folder === folderPath || (a.folder && a.folder.startsWith(folderPath + '/'))));
  writeAssets(assets);
  res.json({ success: true });
});

// Upload asset to folder
app.post('/api/upload/asset', requireAuth, (req, res) => {
  assetUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: 'File size exceeds 50MB limit' });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const folder = (req.body.folder || '').replace(/^\/+/, '');
    const destDir = folder ? resolveAssetPath(folder) : assetsDir;
    if (!destDir) return res.status(400).json({ error: 'Invalid folder' });
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let filename = sanitizeFilename(req.file.originalname);
    let counter = 1;
    while (fs.existsSync(path.join(destDir, filename))) {
      const ext = path.extname(req.file.originalname);
      const base = path.basename(req.file.originalname, ext);
      filename = sanitizeFilename(`${base}-${counter}${ext}`);
      counter++;
    }
    fs.writeFileSync(path.join(destDir, filename), req.file.buffer);

    const assetPath = folder ? `/assets/${folder}/${filename}` : `/assets/${filename}`;
    const entry = {
      id: generateId(),
      filename,
      originalName: req.file.originalname,
      folder: folder || '',
      path: assetPath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadDate: new Date().toISOString()
    };

    const assets = readAssets();
    assets.push(entry);
    writeAssets(assets);
    runPushScript();
    res.json({ success: true, asset: entry });
  });
});

// Rename asset
app.put('/api/assets/:id/rename', requireAuth, (req, res) => {
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'New name is required' });
  const sanitized = sanitizeFilename(newName);
  if (!sanitized) return res.status(400).json({ error: 'Invalid filename' });

  const assets = readAssets();
  const asset = assets.find(a => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  // Preserve extension if user didn't include one
  const oldExt = path.extname(asset.filename);
  const newExt = path.extname(sanitized);
  const finalName = newExt ? sanitized : sanitized + oldExt;

  const folder = asset.folder || '';
  const oldFullPath = path.join(assetsDir, folder, asset.filename);
  const newFullPath = path.join(assetsDir, folder, finalName);

  if (oldFullPath !== newFullPath) {
    if (fs.existsSync(newFullPath)) return res.status(400).json({ error: 'A file with that name already exists' });
    if (fs.existsSync(oldFullPath)) fs.renameSync(oldFullPath, newFullPath);
  }

  asset.filename = finalName;
  asset.originalName = finalName;
  asset.path = folder ? `/assets/${folder}/${finalName}` : `/assets/${finalName}`;
  writeAssets(assets);
  res.json({ success: true, asset });
});

// Move asset to different folder
app.put('/api/assets/:id/move', requireAuth, (req, res) => {
  const { targetFolder } = req.body;
  const newFolder = (targetFolder || '').replace(/^\/+/, '');

  const assets = readAssets();
  const asset = assets.find(a => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const oldFolder = asset.folder || '';
  const oldPath = path.join(assetsDir, oldFolder, asset.filename);
  const destDir = newFolder ? resolveAssetPath(newFolder) : assetsDir;
  if (!destDir) return res.status(400).json({ error: 'Invalid folder' });
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const newPath = path.join(destDir, asset.filename);
  if (fs.existsSync(newPath)) return res.status(400).json({ error: 'A file with that name already exists in the target folder' });
  if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);

  asset.folder = newFolder;
  asset.path = newFolder ? `/assets/${newFolder}/${asset.filename}` : `/assets/${asset.filename}`;
  writeAssets(assets);
  res.json({ success: true, asset });
});

// Delete asset
app.delete('/api/assets/:id', requireAuth, (req, res) => {
  const assets = readAssets();
  const index = assets.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Asset not found' });
  const asset = assets[index];
  const folder = asset.folder || '';
  const filePath = path.join(assetsDir, folder, asset.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  assets.splice(index, 1);
  writeAssets(assets);
  res.json({ success: true });
});

// ===== POST API =====

app.get('/api/posts', (req, res) => {
  const posts = sortByDateDesc([...readPosts()]).map(p => ({
    id: p.id, title: p.title, slug: p.slug, uploadDate: p.uploadDate,
    imageCount: p.images?.length || 0
  }));
  res.json({ success: true, posts });
});

app.get('/api/posts/:slug', (req, res) => {
  const post = readPosts().find(p => p.slug === req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const contentPath = path.join(__dirname, 'uploads', 'posts', post.slug, 'content.html');
  let htmlContent = '';
  try { htmlContent = fs.readFileSync(contentPath, 'utf-8'); }
  catch { return res.status(404).json({ error: 'Post content not found' }); }
  res.json({ success: true, post: { ...post, htmlContent } });
});

app.post('/api/upload/post', requireAuth, (req, res) => {
  postUpload.fields([
    { name: 'htmlFile', maxCount: 1 },
    { name: 'images', maxCount: 50 }
  ])(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      return res.status(400).json({ error: err.message });
    }
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'Title is required' });
      if (!req.files?.htmlFile?.length) return res.status(400).json({ error: 'HTML file is required' });

      const slug = generateSlug(title);
      const posts = readPosts();
      if (posts.find(p => p.slug === slug)) return res.status(400).json({ error: 'A post with this title already exists' });

      const postDir = path.join(__dirname, 'uploads', 'posts', slug);
      const imagesDir = path.join(postDir, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(postDir, 'content.html'), req.files.htmlFile[0].buffer);

      const imagePaths = [];
      if (req.files.images) {
        req.files.images.forEach(img => {
          const filename = `${Date.now()}-${sanitizeFilename(img.originalname)}`;
          fs.writeFileSync(path.join(imagesDir, filename), img.buffer);
          imagePaths.push(`/uploads/posts/${slug}/images/${filename}`);
        });
      }

      const entry = { id: generateId(), title, slug, htmlPath: `/uploads/posts/${slug}/content.html`, images: imagePaths, uploadDate: new Date().toISOString() };
      posts.push(entry);
      writePosts(posts);
      runPushScript();
      res.json({ success: true, post: entry });
    } catch (error) { console.error('Post upload error:', error); res.status(500).json({ error: 'Failed to process upload' }); }
  });
});

// ===== HTML TEMPLATES =====

function navHTML(active) {
  const links = [
    { href: '/gallery', label: 'Gallery' },
    { href: '/posts', label: 'Posts' },
    { href: '/assets', label: 'Assets' },
    { href: '/admin', label: 'Admin' }
  ];
  const linkItems = links.map(l =>
    `<a href="${l.href}" class="${l.href === active ? 'text-white font-medium' : 'text-slate-300 hover:text-white'} transition-colors">${l.label}</a>`
  ).join('\n          ');
  return `<nav class="bg-slate-900 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <a href="/" class="text-xl font-bold tracking-tight">BMB Content Server</a>
        <div class="flex items-center gap-6">${linkItems}</div>
      </div>
    </div>
  </nav>`;
}

function postViewHTML(post, htmlContent) {
  const formattedDate = new Date(post.uploadDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - BMB Content Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .prose img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem 0; }
    .prose h1 { font-size: 2rem; font-weight: 700; margin: 1.5rem 0 1rem; color: #0f172a; }
    .prose h2 { font-size: 1.5rem; font-weight: 600; margin: 1.25rem 0 0.75rem; color: #1e293b; }
    .prose h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; color: #334155; }
    .prose p { margin: 0.75rem 0; line-height: 1.75; color: #475569; }
    .prose ul, .prose ol { margin: 0.75rem 0; padding-left: 1.5rem; color: #475569; }
    .prose li { margin: 0.25rem 0; }
    .prose a { color: #2563eb; text-decoration: underline; }
    .prose blockquote { border-left: 4px solid #e2e8f0; padding-left: 1rem; margin: 1rem 0; color: #64748b; font-style: italic; }
    .prose code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; }
    .prose pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
    .prose pre code { background: none; padding: 0; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  ${navHTML('/posts')}
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <a href="/posts" class="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8 group">
      <svg class="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      Back to Posts
    </a>
    <article class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="p-8 sm:p-12">
        <h1 class="text-4xl font-bold text-slate-900 mb-4">${post.title}</h1>
        <div class="flex items-center text-slate-500 mb-8 pb-8 border-b border-slate-200">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          ${formattedDate}
        </div>
        <div class="prose">${htmlContent}</div>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function notFoundHTML(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Not Found</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-50 min-h-screen">
  ${navHTML('')}
  <main class="max-w-4xl mx-auto px-4 py-24 text-center">
    <h1 class="text-6xl font-bold text-slate-300 mb-4">404</h1>
    <p class="text-xl text-slate-600 mb-8">${message}</p>
    <a href="/" class="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors">Go Home</a>
  </main>
</body></html>`;
}

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`BMB Content Server running on http://localhost:${PORT}`);
  console.log(`  Gallery:  http://localhost:${PORT}/gallery`);
  console.log(`  Posts:    http://localhost:${PORT}/posts`);
  console.log(`  Assets:   http://localhost:${PORT}/assets`);
  console.log(`  Admin:    http://localhost:${PORT}/admin`);
});
