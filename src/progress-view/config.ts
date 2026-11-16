/**
 * Whether draft lessons count on the learner's path (the "continue" target,
 * percent complete, journey position and strand meters). At present only one
 * lesson is reviewed, so drafts must be on the path. Drafts are always badged
 * wherever they appear. Set this to false once enough lessons are reviewed:
 * the path then follows reviewed lessons only (and falls back to all lessons
 * if none is reviewed).
 */
export const INCLUDE_DRAFTS_IN_PATH = true;
