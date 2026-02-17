const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth } = require('./auth');
const { readPosts, writePosts } = require('../helpers/data');
const { generateId, sanitizeFilename, generateSlug, sortByDateDesc, runPushScript } = require('../helpers/utils');
const { postViewHTML, notFoundHTML } = require('../helpers/templates');

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

// Post view page
router.get('/posts/:slug', (req, res) => {
  const { slug } = req.params;
  const posts = readPosts();
  const post = posts.find(p => p.slug === slug);
  if (!post) return res.status(404).send(notFoundHTML('Post not found'));

  const contentPath = path.join(__dirname, '..', 'uploads', 'posts', slug, 'content.html');
  if (!fs.existsSync(contentPath)) return res.status(404).send(notFoundHTML('Post content not found'));

  let htmlContent = fs.readFileSync(contentPath, 'utf-8');
  htmlContent = htmlContent.replace(/src=["'](?!http|\/|data:)(.*?)["']/g, `src="/uploads/posts/${slug}/$1"`);
  res.send(postViewHTML(post, htmlContent));
});

// List posts API
router.get('/api/posts', (req, res) => {
  const posts = sortByDateDesc([...readPosts()]).map(p => ({
    id: p.id, title: p.title, slug: p.slug, uploadDate: p.uploadDate,
    imageCount: p.images?.length || 0
  }));
  res.json({ success: true, posts });
});

// Get single post API
router.get('/api/posts/:slug', (req, res) => {
  const post = readPosts().find(p => p.slug === req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const contentPath = path.join(__dirname, '..', 'uploads', 'posts', post.slug, 'content.html');
  let htmlContent = '';
  try { htmlContent = fs.readFileSync(contentPath, 'utf-8'); }
  catch { return res.status(404).json({ error: 'Post content not found' }); }
  res.json({ success: true, post: { ...post, htmlContent } });
});

// Upload post
router.post('/api/upload/post', requireAuth, (req, res) => {
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

      const postDir = path.join(__dirname, '..', 'uploads', 'posts', slug);
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

// Delete post (removes files from disk AND entry from metadata)
router.delete('/api/posts/:id', requireAuth, (req, res) => {
  const posts = readPosts();
  const index = posts.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Post not found' });

  const post = posts[index];

  // Remove post folder from disk (content.html + images)
  const postDir = path.join(__dirname, '..', 'uploads', 'posts', post.slug);
  if (fs.existsSync(postDir)) fs.rmSync(postDir, { recursive: true, force: true });

  // Remove from metadata
  posts.splice(index, 1);
  writePosts(posts);
  runPushScript();
  res.json({ success: true });
});

module.exports = router;
