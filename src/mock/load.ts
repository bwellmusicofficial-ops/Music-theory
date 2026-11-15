/**
 * Loads mock test configs from `content/mocks/*.json` with fs. Server only:
 * call these from server components and `generateStaticParams`, which run at
 * build time. An invalid file throws, so a bad config fails the build.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockConfigSchema, type MockConfig } from './schema';

export const MOCKS_DIR = join(process.cwd(), 'content', 'mocks');

export function parseMockConfig(raw: unknown, file = 'config'): MockConfig {
  const parsed = mockConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid mock test ${file}: ${parsed.error.message}`);
  return parsed.data;
}

/** Every mock test, by grade then id. */
export function listMockConfigs(dir: string = MOCKS_DIR): MockConfig[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => parseMockConfig(JSON.parse(readFileSync(join(dir, n), 'utf8')), n))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.id.localeCompare(b.id));
}

export function getMockConfig(id: string, dir?: string): MockConfig | undefined {
  return listMockConfigs(dir).find((c) => c.id === id);
}
