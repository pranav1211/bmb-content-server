const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
const metadataPath = path.join(dataDir, 'metadata.json');

// Read current metadata
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

// Map old flat category IDs -> main category + subcategory
const mapping = {
  'experience':          { main: 'experience', mainName: 'Experience', sub: '', subName: '' },
  'f1-2025':             { main: 'f1', mainName: 'F1', sub: '2025', subName: '2025' },
  'f1-general':          { main: 'f1', mainName: 'F1', sub: 'general', subName: 'General' },
  'movietv-movie':       { main: 'movietv', mainName: 'Movie/TV', sub: 'movie', subName: 'Movie' },
  'movietv-tv':          { main: 'movietv', mainName: 'Movie/TV', sub: 'tv', subName: 'TV' },
  'movietv-tv-penguin':  { main: 'movietv', mainName: 'Movie/TV', sub: 'tv-penguin', subName: 'TV Penguin' },
  'tech':                { main: 'tech', mainName: 'Tech', sub: '', subName: '' },
};

// Build per-category data
const catFiles = {};

for (const thumb of (metadata.thumbnails || [])) {
  const map = mapping[thumb.category];
  if (!map) {
    console.log(`Skipping thumbnail with unknown category: ${thumb.category}`);
    continue;
  }

  // Initialize category file structure if needed
  if (!catFiles[map.main]) {
    catFiles[map.main] = {
      name: map.mainName,
      subcategories: [],
      thumbnails: []
    };
  }

  const catData = catFiles[map.main];

  // Add subcategory if not already present
  if (map.sub && !catData.subcategories.find(s => s.id === map.sub)) {
    catData.subcategories.push({ id: map.sub, name: map.subName });
  }

  // Add thumbnail with new 6-char ID and subcategory field (strip old category field)
  catData.thumbnails.push({
    id: crypto.randomBytes(3).toString('hex'),
    filename: thumb.filename,
    originalName: thumb.originalName,
    path: thumb.path,
    fileSize: thumb.fileSize,
    mimeType: thumb.mimeType,
    subcategory: map.sub,
    uploadDate: thumb.uploadDate
  });
}

// Write per-category JSON files
for (const [catId, catData] of Object.entries(catFiles)) {
  // Sort thumbnails by date descending within each file
  catData.thumbnails.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
  const filePath = path.join(dataDir, `${catId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(catData, null, 2));
  console.log(`Created: data/${catId}.json (${catData.thumbnails.length} thumbnails, ${catData.subcategories.length} subcategories)`);
}

// Update metadata.json to only keep posts
const posts = (metadata.posts || []).map(p => ({
  ...p,
  id: crypto.randomBytes(3).toString('hex')
}));
fs.writeFileSync(metadataPath, JSON.stringify({ posts }, null, 2));
console.log(`\nUpdated: data/metadata.json (posts only)`);

const totalThumbs = Object.values(catFiles).reduce((sum, c) => sum + c.thumbnails.length, 0);
console.log(`\nDone! Split ${totalThumbs} thumbnails across ${Object.keys(catFiles).length} category files.`);
