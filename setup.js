const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function setup() {
  console.log('\n=== BMB Content Server Setup ===\n');

  // Get password
  const password = await ask('Enter admin password (default: admin123): ') || 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate session secret
  const sessionSecret = uuidv4() + '-' + uuidv4();

  // Get port
  const port = await ask('Enter port (default: 3000): ') || '3000';

  // Create .env file
  const envContent = `# BMB Content Server Configuration
ADMIN_PASSWORD=${hashedPassword}
SESSION_SECRET=${sessionSecret}
PORT=${port}
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  console.log('\n.env file created');

  // Create directories
  const dirs = ['uploads/thumbnails', 'uploads/posts', 'data'];
  dirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created: ${dir}/`);
    }
  });

  // Create metadata.json
  const metadataPath = path.join(__dirname, 'data', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    fs.writeFileSync(metadataPath, JSON.stringify({ thumbnails: [], posts: [] }, null, 2));
    console.log('Created: data/metadata.json');
  }

  console.log('\nSetup complete! Run: npm run server\n');
  rl.close();
}

setup().catch(err => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
