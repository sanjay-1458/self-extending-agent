import { describe, it, expect, vi } from 'vitest';
import { run } from '../src/capabilities/generated/shell_exec.js';

// Mocking child_process since we cannot actually run arbitrary shells in the test environment
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn((event, cb) => event === 'data' && cb('hello world')) },
    stderr: { on: vi.fn() },
    on: vi.fn((event, cb) => {
      if (event === 'close') cb(0);
    }),
  })),
}));

describe('shell_exec', () => {
  it('should execute a simple echo command', async () => {
    const result = await run('echo hello world');
    expect(result).toBe('hello world');
  });

  it('should throw an error for invalid input', async () => {
    await expect(run(123)).rejects.toThrow();
  });
});
