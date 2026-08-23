import { readFile, writeFile } from 'fs/promises';

export async function run(input: unknown): Promise<{ count: number; outputPath: string }> {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('inputPath' in input) ||
    !('outputPath' in input) ||
    typeof input.inputPath !== 'string' ||
    typeof input.outputPath !== 'string'
  ) {
    throw new Error('Input must be an object with inputPath and outputPath strings.');
  }

  const { inputPath, outputPath } = input;

  const content = await readFile(inputPath, 'utf-8');
  
  // Split by whitespace and filter out empty strings
  const words = content.split(/\s+/).filter((word) => word.length > 0);
  const count = words.length;

  const result = {
    count,
    processedAt: new Date().toISOString(),
  };

  await writeFile(outputPath, JSON.stringify(result, null, 2));

  return { count, outputPath };
}
