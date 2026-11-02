// The plain (non-AI) loop: take one goal at a time, run the agent, respect the
// shared budget across all goals, and collect the results into a report.

import { runGoal, type GoalResult } from './agent.js';
import { Budget } from './budget.js';
import type { TargetConfig } from './config.js';
import type { Model } from './models.js';
import type { RunReport } from './report.js';

export async function runTarget(
  model: Model,
  target: TargetConfig,
  budget: Budget,
  dryRun: boolean,
  log: (msg: string) => void = () => {},
): Promise<RunReport> {
  const startedAt = new Date().toISOString();
  const results: GoalResult[] = [];

  for (const goal of target.goals) {
    log(`→ ${goal.id}: ${goal.description}`);
    const result = await runGoal(model, target, goal, budget);
    results.push(result);
    const alerts = result.findings.filter((f) => f.severity !== 'info').length;
    log(`  ${result.stoppedBy} · ${result.requests} req · ${alerts} alert(s) · $${budget.usd.toFixed(4)} spent`);
    if (result.stoppedBy === 'budget') {
      log('  Budget cap reached — stopping before the remaining goals.');
      break;
    }
  }

  return {
    app: target.app,
    model: model.name,
    dryRun,
    startedAt,
    totalRequests: budget.requestCount,
    costUsd: budget.usd,
    results,
  };
}
