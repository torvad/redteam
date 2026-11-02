// Entry point. Usage:
//   npm run attack -- <target>            dry run (free, default)
//   npm run attack -- <target> --confirm  real run (costs money, needs OK)
//   npm run attack -- <target> --max-usd 0.10   override the cost cap down
//
// A dry run uses the free FakeModel and never touches the API. A real run
// requires --confirm, prints the estimated cost first, and is capped hard.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Budget } from './budget.js';
import { loadTarget } from './config.js';
import { FakeModel, RealModel, type Model } from './models.js';
import { runTarget } from './orchestrator.js';
import { writeReport } from './report.js';

loadEnv({ path: '.env.local' });

interface Args {
  target: string;
  confirm: boolean;
  maxUsd?: number;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  const target = rest.find((a) => !a.startsWith('-'));
  if (!target) {
    throw new Error('Usage: npm run attack -- <target> [--confirm] [--max-usd N]');
  }
  const confirm = rest.includes('--confirm');
  const maxUsdIdx = rest.indexOf('--max-usd');
  const maxUsd = maxUsdIdx >= 0 ? Number(rest[maxUsdIdx + 1]) : undefined;
  if (maxUsd !== undefined && (!Number.isFinite(maxUsd) || maxUsd <= 0)) {
    throw new Error('--max-usd must be a positive number.');
  }
  return { target, confirm, maxUsd };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const targetPath = existsSync(args.target) ? args.target : join('targets', `${args.target}.yaml`);
  if (!existsSync(targetPath)) {
    throw new Error(`Target file not found: ${targetPath}`);
  }

  const target = loadTarget(targetPath);
  const maxUsd = Math.min(args.maxUsd ?? target.budget.maxUsd, target.budget.maxUsd);
  const dryRun = !args.confirm;

  const budget = new Budget(target.budget.maxRequests, maxUsd, target.model);

  let model: Model;
  if (dryRun) {
    const probeRole = target.accounts[0]?.role ?? 'unknown';
    const probePath = target.routes[0] ?? '/';
    model = new FakeModel(probeRole, probePath);
    console.log(`DRY RUN — free. No API call, no spend. Target: ${target.app} (${target.baseUrl})`);
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set (put it in .env.local). Needed for a real run.');
    }
    console.log(`REAL RUN — ${target.app} via ${target.model}`);
    console.log(`Caps: ${target.budget.maxRequests} requests, $${maxUsd.toFixed(2)} max. ${target.goals.length} goal(s).`);
    console.log('The run stops the moment either cap is hit. Actual cost is in the report.\n');
    model = new RealModel(target.model, apiKey);
  }

  const report = await runTarget(model, target, budget, dryRun, (m) => console.log(m));
  const paths = writeReport(report);

  console.log(`\nDone. Requests: ${report.totalRequests}. Cost: $${report.costUsd.toFixed(4)}.`);
  console.log(`Report: ${paths.md}`);
  const alerts = report.results.flatMap((r) => r.findings).filter((f) => f.severity !== 'info').length;
  if (alerts > 0) {
    console.log(`\n⚠️  ${alerts} finding(s) need attention — see the report.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nError: ${(err as Error).message}`);
  process.exitCode = 2;
});
