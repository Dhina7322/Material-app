const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';

console.log('Starting Expo from frontend/server.js...');

const child = spawn(npxCommand, ['expo', 'start', '--tunnel'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Expo process terminated with signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('Failed to start Expo:', err);
  process.exit(1);
});
