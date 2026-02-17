const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

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

function runPushScript() {
  const scriptPath = path.join(__dirname, '..', 'shellfiles', 'push.sh');
  if (!fs.existsSync(scriptPath)) return;
  exec(`bash "${scriptPath}"`, { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
    if (err) console.error('push.sh error:', err.message);
    if (stdout) console.log('push.sh:', stdout.trim());
    if (stderr) console.error('push.sh stderr:', stderr.trim());
  });
}

module.exports = { generateId, sanitizeFilename, generateSlug, sortByDateDesc, runPushScript };
