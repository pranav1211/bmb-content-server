const fs = require('fs');
const path = require('path');

const baseDir = __dirname;
const publicDir = path.join(baseDir, 'public');
const thumbDir = path.join(baseDir, 'thumbnails');
const dataDir = path.join(baseDir, 'data');

// Source folder mapping: public path -> { category, subcategory }
const folderMap = [
  { src: 'experience', cat: 'experience', sub: '' },
  { src: 'f1/2025', cat: 'f1', sub: '2025' },
  { src: 'f1/general', cat: 'f1', sub: 'general' },
  { src: 'movietv/movie', cat: 'movietv', sub: 'movie' },
  { src: 'movietv/tv', cat: 'movietv', sub: 'tv', filesOnly: true },
  { src: 'movietv/tv/penguin', cat: 'movietv', sub: 'tv-penguin' },
  { src: 'tech', cat: 'tech', sub: '' },
];

let totalCopied = 0;

for (const entry of folderMap) {
  const srcPath = path.join(publicDir, entry.src);
  if (!fs.existsSync(srcPath)) {
    console.log(`Skip (not found): public/${entry.src}`);
    continue;
  }

  const destParts = [thumbDir, entry.cat];
  if (entry.sub) destParts.push(entry.sub);
  const destPath = path.join(...destParts);
  fs.mkdirSync(destPath, { recursive: true });

  const items = fs.readdirSync(srcPath);
  let copied = 0;
  for (const item of items) {
    const fullSrc = path.join(srcPath, item);
    const stat = fs.statSync(fullSrc);
    if (entry.filesOnly && stat.isDirectory()) continue;
    if (!stat.isFile()) continue;

    fs.copyFileSync(fullSrc, path.join(destPath, item));
    copied++;
    totalCopied++;
  }
  console.log(`Copied ${copied} files: public/${entry.src} -> thumbnails/${entry.cat}${entry.sub ? '/' + entry.sub : ''}`);
}

// Update each category JSON file with new paths
const catFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'metadata.json');

for (const file of catFiles) {
  const catId = file.replace('.json', '');
  const filePath = path.join(dataDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const thumb of (data.thumbnails || [])) {
    const parts = ['/thumbnails', catId];
    if (thumb.subcategory) parts.push(thumb.subcategory);
    parts.push(thumb.originalName);
    thumb.path = parts.join('/');
    thumb.filename = thumb.originalName;
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Updated paths: data/${file} (${data.thumbnails?.length || 0} thumbnails)`);
}

// Delete migrated copies from uploads/thumbnails/
const uploadsThumbDir = path.join(baseDir, 'uploads', 'thumbnails');
if (fs.existsSync(uploadsThumbDir)) {
  const migrated = fs.readdirSync(uploadsThumbDir).filter(f => f.startsWith('migrated-'));
  for (const f of migrated) {
    fs.unlinkSync(path.join(uploadsThumbDir, f));
  }
  console.log(`\nDeleted ${migrated.length} migrated files from uploads/thumbnails/`);
}

console.log(`\nDone! Copied ${totalCopied} original files to thumbnails/ folder structure.`);
console.log('You can now delete the public/ folder.');
