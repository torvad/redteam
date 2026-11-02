import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTarget } from './config.js';

function tmpTarget(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'redteam-'));
  const path = join(dir, 'target.yaml');
  writeFileSync(path, yaml, 'utf8');
  return path;
}

const VALID = `
app: demo
baseUrl: http://localhost:3000
allowedHosts: [localhost]
loginPath: /login
budget: { maxRequests: 10, maxUsd: 0.25 }
accounts:
  - { role: admin, email: "\${DEMO_EMAIL}", password: "\${DEMO_PW}" }
routes: [/api/x]
goals:
  - { id: g1, description: a rule to verify }
`;

describe('loadTarget', () => {
  it('loads a valid target and resolves env vars', () => {
    const cfg = loadTarget(tmpTarget(VALID), { DEMO_EMAIL: 'a@b.c', DEMO_PW: 'secret' } as NodeJS.ProcessEnv);
    expect(cfg.app).toBe('demo');
    expect(cfg.model).toBe('claude-haiku-5-5'); // default
    expect(cfg.accounts[0]?.email).toBe('a@b.c');
    expect(cfg.accounts[0]?.password).toBe('secret');
  });

  it('throws when a referenced env var is missing', () => {
    expect(() => loadTarget(tmpTarget(VALID), {} as NodeJS.ProcessEnv)).toThrow(/DEMO_EMAIL/);
  });

  it('throws when allowedHosts is empty', () => {
    const yaml = VALID.replace('allowedHosts: [localhost]', 'allowedHosts: []');
    expect(() => loadTarget(tmpTarget(yaml), { DEMO_EMAIL: 'a', DEMO_PW: 'b' } as NodeJS.ProcessEnv)).toThrow(/allowedHosts/);
  });

  it('throws when the budget cap is not positive', () => {
    const yaml = VALID.replace('maxUsd: 0.25', 'maxUsd: 0');
    expect(() => loadTarget(tmpTarget(yaml), { DEMO_EMAIL: 'a', DEMO_PW: 'b' } as NodeJS.ProcessEnv)).toThrow(/maxUsd/);
  });
});
