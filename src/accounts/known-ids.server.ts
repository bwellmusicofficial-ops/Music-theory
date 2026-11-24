import 'server-only';
import { GAMES } from '@/components/site/games';
import { listLessons } from '@/content/load';
import { decodeGameId } from '@/sync/wire';

/**
 * The lesson ids and game ids that really exist. The progress routes keep only these, so a learner's own token
 * cannot be used to store made-up ids (the database accepts any id of the right shape; it cannot know the list).
 * Server only: the lesson list is read from content/ (traced into the route by next.config.ts).
 */
let lessonIds: ReadonlySet<string> | null = null;

export function knownLessonIds(): ReadonlySet<string> {
  if (lessonIds) return lessonIds;
  const ids = new Set(listLessons().map((l) => l.id));
  // An empty list means content/ was not found (a deployment fault): refuse rather than silently drop every lesson.
  if (ids.size === 0) throw new Error('the lesson list is empty (is content/ included in the deployment?); refusing to save progress');
  lessonIds = ids;
  return ids;
}

const GAME_IDS = GAMES.map((g) => g.id);

/** A stored game id is a registered game, optionally followed by its variant (see `encodeGameId`). */
export const isKnownGameId = (id: string): boolean => decodeGameId(id, GAME_IDS) !== null;
