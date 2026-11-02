import { describe, expect, it } from 'vitest';
import { Budget, BudgetExceededError, costUsd } from './budget.js';

describe('costUsd', () => {
  it('prices Haiku input and output per million tokens', () => {
    // 1M in @ $0.10 + 1M out @ $0.50 = $0.60
    expect(costUsd('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6, 6);
  });

  it('throws for an unknown model', () => {
    expect(() => costUsd('made-up-model', 1, 1)).toThrow();
  });
});

describe('Budget', () => {
  it('stops at the request cap', () => {
    const b = new Budget(2, 100, 'claude-haiku-5-5');
    b.assertCanRequest();
    b.record(10, 10);
    b.assertCanRequest();
    b.record(10, 10);
    expect(() => b.assertCanRequest()).toThrow(BudgetExceededError);
  });

  it('stops at the dollar cap', () => {
    const b = new Budget(1000, 0.0005, 'claude-haiku-5-5');
    b.assertCanRequest();
    b.record(1_000_000, 1_000_000); // $0.60, well over the $0.0005 cap
    expect(() => b.assertCanRequest()).toThrow(BudgetExceededError);
    expect(b.usd).toBeCloseTo(0.6, 6);
  });
});
