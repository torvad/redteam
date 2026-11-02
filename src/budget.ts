// Hard caps on a run: a maximum number of agent requests and a maximum dollar
// spend. The budget is checked before every model call and updated after each
// one from the real token usage, so a run stops the moment either cap is hit.

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

// Prices per million tokens, cached 2026-10-06. Update from
// https://www.anthropic.com/pricing when models change.
export const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
};

export function priceFor(model: string): ModelPricing {
  const p = PRICING[model];
  if (!p) {
    throw new Error(`No price known for model "${model}". Add it to PRICING in src/budget.ts.`);
  }
  return p;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class Budget {
  private spentUsd = 0;
  private requests = 0;

  constructor(
    readonly maxRequests: number,
    readonly maxUsd: number,
    readonly model: string,
  ) {}

  get usd(): number {
    return this.spentUsd;
  }

  get requestCount(): number {
    return this.requests;
  }

  /** Call before a model request. Throws if a cap is already reached. */
  assertCanRequest(): void {
    if (this.requests >= this.maxRequests) {
      throw new BudgetExceededError(
        `Request cap reached (${this.requests}/${this.maxRequests}).`,
      );
    }
    if (this.spentUsd >= this.maxUsd) {
      throw new BudgetExceededError(
        `Cost cap reached ($${this.spentUsd.toFixed(4)} / $${this.maxUsd.toFixed(2)}).`,
      );
    }
  }

  /** Call after a model request with its real usage. */
  record(inputTokens: number, outputTokens: number): void {
    this.requests += 1;
    this.spentUsd += costUsd(this.model, inputTokens, outputTokens);
  }
}
