const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth } = require('./auth');
const { getCategoryIds, readCategoryFile, writeCategoryFile, getAllThumbnails, ensureThumbFolder } = require('../helpers/data');
const { generateId, sanitizeFilename, sortByDateDesc, runPushScript } = require('../helpers/utils');

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
};

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter
});

// List thumbnails
router.get('/api/thumbnails', (req, res) => {
  let thumbnails = getAllThumbnails();
  if (req.query.category) thumbnails = thumbnails.filter(t => t.category === req.query.category);
  if (req.query.subcategory) thumbnails = thumbnails.filter(t => t.subcategory === req.query.subcategory);
  res.json({ success: true, thumbnails: sortByDateDesc(thumbnails) });
});

// Upload thumbnail
router.post('/api/upload/thumbnail', requireAuth, (req, res) => {
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

    const destDir = ensureThumbFolder(category, subcategory || '');
    let filename = sanitizeFilename(req.file.originalname);
    let counter = 1;
    while (fs.existsSync(path.join(destDir, filename))) {
      const ext = path.extname(req.file.originalname);
      const base = path.basename(req.file.originalname, ext);
      filename = sanitizeFilename(`${base}-${counter}${ext}`);
      counter++;
    }
    fs.writeFileSync(path.join(destDir, filename), req.file.buffer);

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
router.put('/api/thumbnails/:id', requireAuth, (req, res) => {
  const { newName, newCategory, newSubcategory } = req.body;
  const thumbId = req.params.id;

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

  let finalFilename = foundThumb.filename;
  if (newName && newName !== foundThumb.filename) {
    const oldExt = path.extname(foundThumb.filename);
    const newExt = path.extname(newName);
    finalFilename = sanitizeFilename(newExt ? newName : newName + oldExt);

    const oldDir = ensureThumbFolder(foundCatId, foundThumb.subcategory || '');
    const oldFile = path.join(oldDir, foundThumb.filename);
    if (targetCat === foundCatId && targetSub === foundThumb.subcategory) {
      const newFile = path.join(oldDir, finalFilename);
      if (fs.existsSync(newFile) && finalFilename !== foundThumb.filename) return res.status(400).json({ error: 'A file with that name already exists' });
      if (fs.existsSync(oldFile)) fs.renameSync(oldFile, newFile);
    }
  }

  if (targetCat !== foundCatId || targetSub !== foundThumb.subcategory) {
    const targetData = targetCat === foundCatId ? foundData : readCategoryFile(targetCat);
    if (!targetData) return res.status(400).json({ error: 'Target category not found' });

    const oldDir = ensureThumbFolder(foundCatId, foundThumb.subcategory || '');
    const newDir = ensureThumbFolder(targetCat, targetSub || '');
    const oldFile = path.join(oldDir, foundThumb.filename);
    const newFile = path.join(newDir, finalFilename);
    if (fs.existsSync(newFile) && (oldFile !== newFile)) return res.status(400).json({ error: 'A file with that name already exists in the target location' });
    if (fs.existsSync(oldFile)) fs.renameSync(oldFile, newFile);

    foundData.thumbnails.splice(foundIndex, 1);
    writeCategoryFile(foundCatId, foundData);

    const urlParts = ['/thumbnails', targetCat];
    if (targetSub) urlParts.push(targetSub);
    urlParts.push(finalFilename);

    foundThumb.filename = finalFilename;
    foundThumb.originalName = finalFilename;
    foundThumb.path = urlParts.join('/');
    foundThumb.subcategory = targetSub;

    if (targetCat === foundCatId) {
      foundData.thumbnails.push(foundThumb);
      writeCategoryFile(foundCatId, foundData);
    } else {
      targetData.thumbnails.push(foundThumb);
      writeCategoryFile(targetCat, targetData);
    }
  } else if (newName && newName !== foundThumb.filename) {
    const urlParts = ['/thumbnails', foundCatId];
    if (foundThumb.subcategory) urlParts.push(foundThumb.subcategory);
    urlParts.push(finalFilename);

    foundThumb.filename = finalFilename;
    foundThumb.originalName = finalFilename;
    foundThumb.path = urlParts.join('/');
    writeCategoryFile(foundCatId, foundData);
  }

  runPushScript();
  res.json({ success: true, thumbnail: foundThumb });
});

// Delete thumbnail
router.delete('/api/thumbnails/:id', requireAuth, (req, res) => {
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
      runPushScript();
      return res.json({ success: true });
    }
  }
  res.status(404).json({ error: 'Thumbnail not found' });
});

module.exports = router;
