import { describe, it, expect, vi } from 'vitest';
import { run } from '../src/capabilities/generated/process_file_word_count.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('process_file_word_count', () => {
  it('should count words and write to file', async () => {
    const mockContent = 'hello world this is a test';
    const inputPath = 'input.txt';
    const outputPath = 'output.json';

    vi.mocked(fs.readFile).mockResolvedValue(mockContent);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await run({ inputPath, outputPath });

    expect(result.count).toBe(6);
    expect(fs.readFile).toHaveBeenCalledWith(inputPath, 'utf-8');
    expect(fs.writeFile).toHaveBeenCalledWith(
      outputPath,
      expect.stringContaining('"count": 6')
    );
  });

  it('should throw error for invalid input', async () => {
    await expect(run({})).rejects.toThrow();
  });
});
