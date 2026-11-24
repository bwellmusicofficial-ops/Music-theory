// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('security headers (P1-17)', () => {
  it('every route gets the five headers', async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe('/:path*');
    const h = Object.fromEntries(rules[0]!.headers.map((x) => [x.key, x.value]));
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
  it('the site uses none of the denied features (audio is Web Audio output only)', async () => {
    const { execSync } = await import('node:child_process');
    const found = execSync(
      `grep -rlE "getUserMedia|mediaDevices|geolocation|MediaRecorder|requestMIDIAccess" src content --include=*.ts --include=*.tsx --include=*.json | grep -v "security-headers.test.ts" || true`,
      { cwd: process.cwd() },
    ).toString().trim();
    expect(found).toBe('');
  });
});
