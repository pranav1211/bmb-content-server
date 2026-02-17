const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
const metadataPath = path.join(dataDir, 'metadata.json');
const thumbDir = path.join(__dirname, '..', 'thumbnails');
const assetsDir = path.join(__dirname, '..', 'assets');

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

function ensureThumbFolder(catId, subId) {
  const parts = [thumbDir, catId];
  if (subId) parts.push(subId);
  const dir = path.join(...parts);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ===== METADATA (POSTS & ASSETS) HELPERS =====

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

// ===== ASSET PATH RESOLVER =====

function resolveAssetPath(relPath) {
  const resolved = path.resolve(assetsDir, relPath || '');
  if (!resolved.startsWith(assetsDir)) return null;
  return resolved;
}

module.exports = {
  dataDir, metadataPath, thumbDir, assetsDir,
  getCategoryIds, readCategoryFile, writeCategoryFile,
  getAllCategories, getAllThumbnails, ensureThumbFolder,
  readMetadata, writeMetadata, readPosts, writePosts,
  readAssets, writeAssets, resolveAssetPath
};
