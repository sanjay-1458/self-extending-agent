import { spawn } from 'node:child_process';
import path from 'node:path';

export async function run(input: unknown): Promise<unknown> {
  const command = typeof input === 'string' ? input : (input as { command: string }).command;
  
  if (!command || typeof command !== 'string') {
    throw new Error('Input must be a string command or an object with a command property.');
  }

  const WORKSPACE_DIR = '/home/daytona/workspace/lenny-growth-assistant';

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: WORKSPACE_DIR,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
