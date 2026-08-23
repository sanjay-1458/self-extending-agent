import { writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Writes a JSON object to a file.
 * @param input.filePath The path where the file should be written.
 * @param input.data The JSON object to write.
 */
export async function run(input: unknown): Promise<unknown> {
  if (typeof input !== 'object' || input === null || !('filePath' in input) || !('data' in input)) {
    throw new Error('Input must be an object with filePath and data properties');
  }

  const { filePath, data } = input as { filePath: string; data: unknown };

  if (typeof filePath !== 'string') {
    throw new Error('filePath must be a string');
  }

  try {
    const jsonString = JSON.stringify(data, null, 2);
    const absolutePath = resolve(process.cwd(), filePath);
    await writeFile(absolutePath, jsonString, 'utf-8');
    return { success: true, path: absolutePath };
  } catch (error) {
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
  }
}