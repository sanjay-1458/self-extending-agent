import { describe, it, expect, vi } from 'vitest';
import { run } from '../src/capabilities/generated/playwright_extract_element_text.js';
import * as playwright from 'playwright';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        $: vi.fn().mockImplementation((selector: string) => {
          if (selector === '#test-id') {
            return {
              textContent: vi.fn().mockResolvedValue('Hello World')
            };
          }
          return null;
        }),
      }),
      close: vi.fn(),
    }),
  },
}));

describe('playwright_extract_element_text', () => {
  it('should extract text from an element', async () => {
    const result = await run({ url: 'http://example.com', elementId: 'test-id' });
    expect(result).toBe('Hello World');
  });

  it('should throw error if element not found', async () => {
    await expect(run({ url: 'http://example.com', elementId: 'missing-id' }))
      .rejects.toThrow("Element with ID 'missing-id' not found");
  });
});
