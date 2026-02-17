const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/admin/login');
}

// Login page
router.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'login.html')));

// Login handler
router.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = process.env.ADMIN_PASSWORD;
    if (!hashedPassword) return res.status(500).json({ error: 'Admin password not configured' });
    const match = await bcrypt.compare(password, hashedPassword);
    if (match) { req.session.authenticated = true; res.json({ success: true, redirect: '/admin' }); }
    else res.status(401).json({ error: 'Invalid password' });
  } catch (error) { console.error('Login error:', error); res.status(500).json({ error: 'Server error' }); }
});

// Logout
router.get('/admin/logout', (req, res) => { req.session.destroy(() => res.redirect('/admin/login')); });

module.exports = { router, requireAuth };
