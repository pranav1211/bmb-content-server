const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth } = require('./auth');
const { assetsDir, readAssets, writeAssets, resolveAssetPath } = require('../helpers/data');
const { generateId, sanitizeFilename, sortByDateDesc, runPushScript } = require('../helpers/utils');

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// List assets (with optional folder filter)
router.get('/api/assets', requireAuth, (req, res) => {
  const folder = (req.query.folder || '').replace(/^\/+/, '');
  const assets = readAssets().filter(a => {
    const assetFolder = a.folder || '';
    return assetFolder === folder;
  });
  res.json({ success: true, assets: sortByDateDesc(assets) });
});

// List folders
router.get('/api/assets/folders', requireAuth, (req, res) => {
  const parentFolder = (req.query.parent || '').replace(/^\/+/, '');
  const assets = readAssets();
  const allFolders = new Set();
  assets.forEach(a => { if (a.folder) allFolders.add(a.folder); });
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

  const children = [...allFolders].filter(f => {
    if (!parentFolder) return !f.includes('/');
    return f.startsWith(parentFolder + '/') && !f.slice(parentFolder.length + 1).includes('/');
  }).sort();

  res.json({ success: true, folders: children });
});

// Create folder
router.post('/api/assets/folders', requireAuth, (req, res) => {
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
router.put('/api/assets/folders/rename', requireAuth, (req, res) => {
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

  const assets = readAssets();
  assets.forEach(a => {
    if (a.folder === oldPath || (a.folder && a.folder.startsWith(oldPath + '/'))) {
      a.folder = a.folder === oldPath ? newPath : newPath + a.folder.slice(oldPath.length);
      a.path = `/assets/${a.folder}/${a.filename}`;
    }
  });
  writeAssets(assets);
  runPushScript();
  res.json({ success: true, newPath });
});

// Delete folder
router.delete('/api/assets/folders', requireAuth, (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });
  const fullPath = resolveAssetPath(folderPath);
  if (!fullPath || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Folder not found' });

  fs.rmSync(fullPath, { recursive: true, force: true });

  let assets = readAssets();
  assets = assets.filter(a => !(a.folder === folderPath || (a.folder && a.folder.startsWith(folderPath + '/'))));
  writeAssets(assets);
  runPushScript();
  res.json({ success: true });
});

// Upload asset to folder
router.post('/api/upload/asset', requireAuth, (req, res) => {
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
router.put('/api/assets/:id/rename', requireAuth, (req, res) => {
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'New name is required' });
  const sanitized = sanitizeFilename(newName);
  if (!sanitized) return res.status(400).json({ error: 'Invalid filename' });

  const assets = readAssets();
  const asset = assets.find(a => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

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
  runPushScript();
  res.json({ success: true, asset });
});

// Move asset to different folder
router.put('/api/assets/:id/move', requireAuth, (req, res) => {
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
  runPushScript();
  res.json({ success: true, asset });
});

// Delete asset
router.delete('/api/assets/:id', requireAuth, (req, res) => {
  const assets = readAssets();
  const index = assets.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Asset not found' });
  const asset = assets[index];
  const folder = asset.folder || '';
  const filePath = path.join(assetsDir, folder, asset.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  assets.splice(index, 1);
  writeAssets(assets);
  runPushScript();
  res.json({ success: true });
});

module.exports = router;
