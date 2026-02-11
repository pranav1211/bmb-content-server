require('dotenv').config();
const express = require('express');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENSURE DIRECTORIES =====
const dirs = ['uploads/thumbnails', 'uploads/posts', 'data'];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Ensure metadata.json exists
const metadataPath = path.join(__dirname, 'data', 'metadata.json');
if (!fs.existsSync(metadataPath)) {
  fs.writeFileSync(metadataPath, JSON.stringify({ thumbnails: [], posts: [] }, null, 2));
}

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ===== HELPER FUNCTIONS =====

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readMetadata() {
  try {
    const data = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { thumbnails: [], posts: [] };
  }
}

function writeMetadata(data) {
  fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
}

function sortByDateDesc(items) {
  return items.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
}

// ===== MULTER CONFIG =====

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
  }
};

// Thumbnail storage
const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads', 'thumbnails'));
  },
  filename: (req, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}-${sanitized}`);
  }
});

const thumbnailUpload = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter
});

// Post upload - memory storage since we need the slug from title first
const postUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'htmlFile') {
      if (file.mimetype === 'text/html' || file.originalname.endsWith('.html') || file.originalname.endsWith('.htm')) {
        cb(null, true);
      } else {
        cb(new Error('Only HTML files are allowed for content'), false);
      }
    } else if (file.fieldname === 'images') {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
      }
    } else {
      cb(new Error('Unexpected field'), false);
    }
  }
});

// ===== AUTH MIDDLEWARE =====

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/admin/login');
}

// ===== PAGE ROUTES =====

app.get('/', (req, res) => {
  res.redirect('/gallery');
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = process.env.ADMIN_PASSWORD;

    if (!hashedPassword) {
      return res.status(500).json({ error: 'Admin password not configured' });
    }

    const match = await bcrypt.compare(password, hashedPassword);
    if (match) {
      req.session.authenticated = true;
      res.json({ success: true, redirect: '/admin' });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'gallery.html'));
});

app.get('/posts', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'posts.html'));
});

app.get('/posts/:slug', (req, res) => {
  const { slug } = req.params;
  const metadata = readMetadata();
  const post = metadata.posts.find(p => p.slug === slug);

  if (!post) {
    return res.status(404).send(notFoundHTML('Post not found'));
  }

  const contentPath = path.join(__dirname, 'uploads', 'posts', slug, 'content.html');
  if (!fs.existsSync(contentPath)) {
    return res.status(404).send(notFoundHTML('Post content not found'));
  }

  let htmlContent = fs.readFileSync(contentPath, 'utf-8');

  // Fix relative image paths to point to the correct upload directory
  htmlContent = htmlContent.replace(
    /src=["'](?!http|\/|data:)(.*?)["']/g,
    `src="/uploads/posts/${slug}/$1"`
  );

  res.send(postViewHTML(post, htmlContent));
});

// ===== API ROUTES =====

// Upload thumbnail
app.post('/api/upload/thumbnail', requireAuth, (req, res) => {
  thumbnailUpload.single('thumbnail')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const metadata = readMetadata();
    const entry = {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/thumbnails/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadDate: new Date().toISOString()
    };

    metadata.thumbnails.push(entry);
    writeMetadata(metadata);

    res.json({ success: true, thumbnail: entry });
  });
});

// Upload post
app.post('/api/upload/post', requireAuth, (req, res) => {
  postUpload.fields([
    { name: 'htmlFile', maxCount: 1 },
    { name: 'images', maxCount: 50 }
  ])(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      if (!req.files || !req.files.htmlFile || req.files.htmlFile.length === 0) {
        return res.status(400).json({ error: 'HTML file is required' });
      }

      const slug = generateSlug(title);

      const metadata = readMetadata();
      if (metadata.posts.find(p => p.slug === slug)) {
        return res.status(400).json({ error: 'A post with this title already exists' });
      }

      // Create directories
      const postDir = path.join(__dirname, 'uploads', 'posts', slug);
      const imagesDir = path.join(postDir, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });

      // Write HTML file
      const htmlFile = req.files.htmlFile[0];
      fs.writeFileSync(path.join(postDir, 'content.html'), htmlFile.buffer);

      // Write images
      const imagePaths = [];
      if (req.files.images) {
        req.files.images.forEach(img => {
          const sanitized = sanitizeFilename(img.originalname);
          const filename = `${Date.now()}-${sanitized}`;
          fs.writeFileSync(path.join(imagesDir, filename), img.buffer);
          imagePaths.push(`/uploads/posts/${slug}/images/${filename}`);
        });
      }

      // Update metadata
      const entry = {
        id: uuidv4(),
        title,
        slug,
        htmlPath: `/uploads/posts/${slug}/content.html`,
        images: imagePaths,
        uploadDate: new Date().toISOString()
      };

      metadata.posts.push(entry);
      writeMetadata(metadata);

      res.json({ success: true, post: entry });
    } catch (error) {
      console.error('Post upload error:', error);
      res.status(500).json({ error: 'Failed to process upload' });
    }
  });
});

// Get all thumbnails
app.get('/api/thumbnails', (req, res) => {
  const metadata = readMetadata();
  const thumbnails = sortByDateDesc([...metadata.thumbnails]);
  res.json({ success: true, thumbnails });
});

// Get all posts
app.get('/api/posts', (req, res) => {
  const metadata = readMetadata();
  const posts = sortByDateDesc([...metadata.posts]).map(p => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    uploadDate: p.uploadDate,
    imageCount: p.images ? p.images.length : 0
  }));
  res.json({ success: true, posts });
});

// Get specific post
app.get('/api/posts/:slug', (req, res) => {
  const metadata = readMetadata();
  const post = metadata.posts.find(p => p.slug === req.params.slug);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const contentPath = path.join(__dirname, 'uploads', 'posts', post.slug, 'content.html');
  let htmlContent = '';
  try {
    htmlContent = fs.readFileSync(contentPath, 'utf-8');
  } catch {
    return res.status(404).json({ error: 'Post content not found' });
  }

  res.json({ success: true, post: { ...post, htmlContent } });
});

// ===== HTML TEMPLATES =====

function navHTML(active) {
  const links = [
    { href: '/gallery', label: 'Gallery' },
    { href: '/posts', label: 'Posts' },
    { href: '/admin', label: 'Admin' }
  ];
  const linkItems = links.map(l =>
    `<a href="${l.href}" class="${l.href === active ? 'text-white font-medium' : 'text-slate-300 hover:text-white'} transition-colors">${l.label}</a>`
  ).join('\n          ');

  return `<nav class="bg-slate-900 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <a href="/" class="text-xl font-bold tracking-tight">BMB Content Server</a>
        <div class="flex items-center gap-6">
          ${linkItems}
        </div>
      </div>
    </div>
  </nav>`;
}

function postViewHTML(post, htmlContent) {
  const formattedDate = new Date(post.uploadDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

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
      <svg class="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
      Back to Posts
    </a>

    <article class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="p-8 sm:p-12">
        <h1 class="text-4xl font-bold text-slate-900 mb-4">${post.title}</h1>
        <div class="flex items-center text-slate-500 mb-8 pb-8 border-b border-slate-200">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          ${formattedDate}
        </div>
        <div class="prose">
          ${htmlContent}
        </div>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function notFoundHTML(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Found - BMB Content Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 min-h-screen">
  ${navHTML('')}
  <main class="max-w-4xl mx-auto px-4 py-24 text-center">
    <h1 class="text-6xl font-bold text-slate-300 mb-4">404</h1>
    <p class="text-xl text-slate-600 mb-8">${message}</p>
    <a href="/" class="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors">
      Go Home
    </a>
  </main>
</body>
</html>`;
}

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`BMB Content Server running on http://localhost:${PORT}`);
  console.log(`  Gallery:  http://localhost:${PORT}/gallery`);
  console.log(`  Posts:    http://localhost:${PORT}/posts`);
  console.log(`  Admin:    http://localhost:${PORT}/admin`);
});
