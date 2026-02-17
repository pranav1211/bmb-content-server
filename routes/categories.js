const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth } = require('./auth');
const { dataDir, thumbDir, readCategoryFile, writeCategoryFile, getAllCategories, ensureThumbFolder } = require('../helpers/data');
const { runPushScript } = require('../helpers/utils');

// List all categories
router.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: getAllCategories() });
});

// Create category
router.post('/api/categories', requireAuth, (req, res) => {
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

// Rename category
router.put('/api/categories/:id', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.id);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
  data.name = req.body.name.trim();
  writeCategoryFile(req.params.id, data);
  res.json({ success: true });
});

// Delete category (also removes thumbnail files from disk)
router.delete('/api/categories/:id', requireAuth, (req, res) => {
  const filePath = path.join(dataDir, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Category not found' });

  // Remove thumbnail folder for this category from disk
  const catThumbDir = path.join(thumbDir, req.params.id);
  if (fs.existsSync(catThumbDir)) fs.rmSync(catThumbDir, { recursive: true, force: true });

  // Remove category data file
  fs.unlinkSync(filePath);
  runPushScript();
  res.json({ success: true });
});

// ===== SUBCATEGORY ROUTES =====

// Create subcategory
router.post('/api/categories/:id/subcategories', requireAuth, (req, res) => {
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

// Rename subcategory
router.put('/api/categories/:catId/subcategories/:subId', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.catId);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  const sub = data.subcategories.find(s => s.id === req.params.subId);
  if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
  sub.name = req.body.name.trim();
  writeCategoryFile(req.params.catId, data);
  res.json({ success: true });
});

// Delete subcategory
router.delete('/api/categories/:catId/subcategories/:subId', requireAuth, (req, res) => {
  const data = readCategoryFile(req.params.catId);
  if (!data) return res.status(404).json({ error: 'Category not found' });
  const index = data.subcategories.findIndex(s => s.id === req.params.subId);
  if (index === -1) return res.status(404).json({ error: 'Subcategory not found' });
  data.thumbnails.forEach(t => { if (t.subcategory === req.params.subId) t.subcategory = ''; });
  data.subcategories.splice(index, 1);
  writeCategoryFile(req.params.catId, data);
  res.json({ success: true });
});

module.exports = router;
