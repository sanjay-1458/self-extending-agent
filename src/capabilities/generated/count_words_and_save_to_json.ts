import { readFile, writeFile } from 'node:fs/promises';

export async function run(input: unknown): Promise<unknown> {
  if (typeof input !== 'object' || input === null || !('sourcePath' in input) || !('outputPath' in input)) {
    throw new Error('Input must be an object with sourcePath and outputPath.');
  }

  const { sourcePath, outputPath } = input as { sourcePath: string; outputPath: string };

  const content = await readFile(sourcePath, 'utf-8');
  
  // Count words: split by whitespace and filter out empty strings
  const words = content.split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;

  const result = {
    sourcePath,
    wordCount,
    timestamp: new Date().toISOString()
  };

  await writeFile(outputPath, JSON.stringify(result, null, 2));

  return result;
}