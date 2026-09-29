import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const pythonExecutable = (() => {
  const candidates = [
    path.join(rootDir, '.venv', 'Scripts', 'python.exe'),
    path.join(rootDir, '.venv', 'bin', 'python'),
    isWindows ? 'python' : 'python3'
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? (isWindows ? 'python' : 'python3');
})();

const npmExecutable = isWindows ? 'npm.cmd' : 'npm';
const children = [];

function startProcess(label, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });

  children.push(child);

  child.on('exit', (code, signal) => {
    console.log(`\n[${label}] exited with code ${code ?? 'signal:' + signal}`);
    if (code !== 0) {
      for (const other of children) {
        if (other !== child && !other.killed) other.kill('SIGTERM');
      }
      process.exit(code ?? 1);
    }
  });

  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Starting DevDNA services...');
startProcess('python', pythonExecutable, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000', '--app-dir', 'intelligence'], rootDir);
startProcess('backend', npmExecutable, ['run', 'dev', '--workspace', 'backend'], rootDir);
startProcess('frontend', npmExecutable, ['run', 'dev', '--workspace', 'frontend'], rootDir);
