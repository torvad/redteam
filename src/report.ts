// Writes the run's findings to findings/<app>-<date>.md and .json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GoalResult } from './agent.js';

export interface RunReport {
  app: string;
  model: string;
  dryRun: boolean;
  startedAt: string;
  totalRequests: number;
  costUsd: number;
  results: GoalResult[];
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 } as const;

export function renderMarkdown(report: RunReport): string {
  const lines: string[] = [];
  lines.push(`# Red-team report — ${report.app}`);
  lines.push('');
  lines.push(`- Run at: ${report.startedAt}`);
  lines.push(`- Model: ${report.model}${report.dryRun ? ' (dry run — no testing happened)' : ''}`);
  lines.push(`- Requests: ${report.totalRequests}`);
  lines.push(`- Cost: $${report.costUsd.toFixed(4)}`);
  lines.push('');

  const all = report.results.flatMap((r) => r.findings);
  const alerts = all.filter((f) => f.severity !== 'info').length;
  lines.push(alerts > 0 ? `## ⚠️ ${alerts} finding(s) need attention` : '## ✅ No rule was found broken');
  lines.push('');

  for (const result of report.results) {
    lines.push(`### ${result.goal.id} — ${result.goal.description}`);
    lines.push(`Stopped by: ${result.stoppedBy}${result.error ? ` (${result.error})` : ''} · ${result.requests} request(s)`);
    lines.push('');
    const sorted = [...result.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    if (sorted.length === 0) {
      lines.push('_No finding recorded._');
    } else {
      for (const f of sorted) {
        lines.push(`- **[${f.severity.toUpperCase()}] ${f.title}**`);
        lines.push(`  ${f.detail.replace(/\n/g, '\n  ')}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function writeReport(report: RunReport, dir = 'findings'): { md: string; json: string } {
  mkdirSync(dir, { recursive: true });
  const date = report.startedAt.slice(0, 10);
  const base = `${report.app}-${date}`;
  const md = join(dir, `${base}.md`);
  const json = join(dir, `${base}.json`);
  writeFileSync(md, renderMarkdown(report), 'utf8');
  writeFileSync(json, JSON.stringify(report, null, 2), 'utf8');
  return { md, json };
}
