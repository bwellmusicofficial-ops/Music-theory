import { describe, expect, it } from 'vitest';
import { EXPORT_SECTIONS, README, buildExportFile, exportFileText, exportFilename } from './export-file';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const UID = '11111111-1111-4111-8111-111111111111';

/** What export_my_data() returns for a code-name user (0001), plus things it must never return but a bug might. */
const raw = () => ({
  exported_at: '2026-11-23T09:59:00Z',
  account: { user_id: UID, email: `${UID}@accounts.invalid`, created_at: '2026-11-01T10:00:00Z' },
  profile: { user_id: UID, code_name: 'SwiftCello42', code_name_norm: 'swiftcello42', age_band: 'under_18', settings: {}, created_at: '2026-11-01T10:00:00Z' },
  adult_contact: null,
  account_secrets: { has_recovery_code: true, failed_attempts: 3, last_failed_at: '2026-11-02T10:00:00Z', locked_until: null, created_at: 'x', updated_at: 'y' },
  lesson_progress: [{ user_id: UID, lesson_id: 'g1-rhythm-01', state: 'complete', best_score: 1 }],
  attempts: [{ id: 1, user_id: UID, lesson_id: 'g1-rhythm-01', correct: true }],
  game_scores: [],
  mock_results: [],
});

describe('buildExportFile', () => {
  it('starts with a plain-English README that explains every part', () => {
    const out = buildExportFile(raw(), NOW);
    expect(Object.keys(out)[0]).toBe('README');
    for (const part of EXPORT_SECTIONS) {
      expect(README[part], part).toMatch(/\w{4}/);
      expect(out, part).toHaveProperty(part);
    }
    expect(README.not_in_this_file).toMatch(/device/);
    expect(JSON.stringify(out.README)).not.toMatch(/accounts\.invalid|bcrypt|hash/i);
  });

  it('keeps the learner data', () => {
    const out = buildExportFile(raw(), NOW);
    expect(out.exported_at).toBe('2026-11-23T09:59:00Z');
    expect((out.profile as { code_name: string }).code_name).toBe('SwiftCello42');
    expect(out.lesson_progress).toEqual([{ lesson_id: 'g1-rhythm-01', state: 'complete', best_score: 1 }]);
    expect(out.attempts).toHaveLength(1);
  });

  it('removes the made-up address, in any case, wherever it is', () => {
    const poisoned = raw();
    poisoned.account.email = `${UID}@ACCOUNTS.INVALID`;
    (poisoned.profile as Record<string, unknown>).note = `mail ${UID}@accounts.invalid`;
    (poisoned.attempts[0] as Record<string, unknown>).nested = { deep: [`x@accounts.invalid`] };
    const text = exportFileText(poisoned, NOW);
    expect(text).not.toMatch(/accounts\.invalid/i);
    expect((buildExportFile(poisoned, NOW).account as { email: unknown }).email).toBeNull();
  });

  it('keeps a real email address', () => {
    const adult = raw();
    adult.account.email = 'sam@example.com';
    expect((buildExportFile(adult, NOW).account as { email: string }).email).toBe('sam@example.com');
  });

  it('never carries password or recovery-code hashes, tokens, or failure counters', () => {
    const poisoned = raw() as Record<string, unknown>;
    (poisoned.profile as Record<string, unknown>).recovery_code_hash = '$2b$10$abcdefghijklmnopqrstuuxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    (poisoned.profile as Record<string, unknown>).encrypted_password = '$2a$10$zzz';
    (poisoned.account as Record<string, unknown>).password_hash = '$2b$10$abc';
    (poisoned.lesson_progress as Record<string, unknown>[])[0]!.refresh_token = 'tok';
    const text = exportFileText(poisoned, NOW);
    expect(text).not.toMatch(/\$2[aby]\$/);
    expect(text).not.toMatch(/recovery_code_hash|encrypted_password|password_hash|refresh_token/);
    expect(text).not.toMatch(/failed_attempts|locked_until|last_failed_at/);
    expect(buildExportFile(poisoned, NOW).account_secrets).toEqual({ has_recovery_code: true, created_at: 'x', updated_at: 'y' });
  });

  it('drops anything that is not a known section, such as throttle rows', () => {
    const poisoned = { ...raw(), auth_throttle: [{ key: 'signin:name:swiftcello42', failures: 4 }], throttle: { key: 'ip' }, secret_key: 'sb_secret_x' };
    const out = buildExportFile(poisoned, NOW);
    expect(Object.keys(out).sort()).toEqual(['README', 'exported_at', ...EXPORT_SECTIONS].sort());
    expect(JSON.stringify(out)).not.toMatch(/throttle|signin:name|sb_secret/);
  });

  it('copes with a missing or odd result: empty sections, today\'s time', () => {
    for (const odd of [null, undefined, 'x', 5, [], {}]) {
      const out = buildExportFile(odd, NOW);
      expect(out.exported_at).toBe(NOW.toISOString());
      expect(out.account).toBeNull();
      expect(out.attempts).toEqual([]);
    }
  });

  it('is named by the day, in UTC', () => {
    expect(exportFilename(NOW)).toBe('music-theory-now-data-2026-11-23.json');
    expect(exportFilename(new Date('2026-01-05T23:59:59Z'))).toBe('music-theory-now-data-2026-01-05.json');
  });

  it('is compact JSON, one row per line, that parses back', () => {
    const text = exportFileText(raw(), NOW);
    expect(text).not.toContain('\n  ');
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(buildExportFile(raw(), NOW));
  });
});
