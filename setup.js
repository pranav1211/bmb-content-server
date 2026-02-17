const bcrypt = require('bcrypt');
const crypto = require('crypto');
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
  console.log(`Password set to: ${password}`);
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate session secret
  const sessionSecret = crypto.randomUUID() + '-' + crypto.randomUUID();

  // Get port
  const port = await ask('Enter port (default: 3000): ') || '3000';

  // Get NODE_ENV
  const env = await ask('Environment - production or development (default: production): ') || 'production';

  // Create .env file
  const envContent = `# BMB Content Server Configuration
ADMIN_PASSWORD=${hashedPassword}
SESSION_SECRET=${sessionSecret}
PORT=${port}
NODE_ENV=${env}
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  console.log('\n.env file created successfully');

  // Create directories
  const dirs = ['thumbnails', 'assets', 'uploads/posts', 'data'];
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
    fs.writeFileSync(metadataPath, JSON.stringify({ posts: [], assets: [] }, null, 2));
    console.log('Created: data/metadata.json');
  }

  console.log('\n--- Setup complete! ---');
  console.log('Run: npm start');
  console.log('\nIMPORTANT: If the server is already running, restart it for changes to take effect.\n');
  rl.close();
}

setup().catch(err => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
