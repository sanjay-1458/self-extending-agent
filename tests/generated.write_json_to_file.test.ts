import { describe, it, expect, vi } from 'vitest';
import { run } from '../src/capabilities/generated/write_json_to_file.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
}));

describe('write_json_to_file', () => {
  it('should write valid JSON to a file', async () => {
    const input = {
      filePath: 'test.json',
      data: { key: 'value', number: 123 }
    };

    await run(input);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.json'),
      JSON.stringify(input.data, null, 2),
      'utf-8'
    );
  });

  it('should throw an error for invalid input', async () => {
    await expect(run({})).rejects.toThrow();
  });
});