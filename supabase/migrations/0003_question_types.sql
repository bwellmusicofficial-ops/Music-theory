-- 0003: the four question types added on 19 Nov 2026 (docs/question-types-2.md).
-- Adds them to public.question_type so attempts at them can be saved to an account.
-- Additive and idempotent: safe to run twice; changes no existing row.
-- After it is applied, add the four values to DB_QUESTION_TYPES in src/sync/wire.ts
-- (until then the app keeps those attempts on the device and syncs everything else).

alter type public.question_type add value if not exists 'place-bar-lines';
alter type public.question_type add value if not exists 'fix-beaming';
alter type public.question_type add value if not exists 'write-key-signature';
alter type public.question_type add value if not exists 'find-in-passage';
