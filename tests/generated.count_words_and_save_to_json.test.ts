import { describe, it, expect, vi } from 'vitest';
import { run } from '../src/capabilities/generated/count_words_and_save_to_json.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('count_words_and_save_to_json', () => {
  it('should count words and write to file', async () => {
    const mockContent = 'Hello world this is a test.';
    vi.mocked(fs.readFile).mockResolvedValue(mockContent);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await run({
      sourcePath: 'input.txt',
      outputPath: 'output.json'
    });

    expect(fs.readFile).toHaveBeenCalledWith('input.txt', 'utf-8');
    expect(fs.writeFile).toHaveBeenCalled();
    
    const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
    const savedData = JSON.parse(writeCall[1] as string);
    
    expect(savedData.wordCount).toBe(6);
    expect(result).toMatchObject({
      sourcePath: 'input.txt',
      wordCount: 6
    });
  });

  it('should throw error for invalid input', async () => {
    await expect(run({})).rejects.toThrow();
  });
});