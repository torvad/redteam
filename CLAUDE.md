# redteam — project instructions

A standalone defensive self-testing tool. It drives a Claude QA agent against
**Torstein's own** apps on **localhost / a test database** to verify that
access rules hold. Authorized testing of his own software only.

## Hard rules (do not break)

- **Never run anything that costs money without Torstein's explicit OK for that
  specific run.** An OK covers one run. See the global CLAUDE.md "Pengebruk".
- **Only localhost / test targets.** The host guard (`src/hostGuard.ts`) must
  stay the single choke point: every request goes through it, and it refuses
  any non-loopback host not explicitly allowed. Never point a target at
  production, and never put real user data in a target.
- **Default model `claude-haiku-5-5`.** A pricier model only when Torstein asks.
- **Build and verify with the free dry run** (`npm run attack -- <target>`).
  A real run (`--confirm`) waits for his OK, with the estimated cost stated
  first.
- **No secrets in the repo.** Passwords and API keys live in `.env.local`
  (gitignored); target files reference them as `${ENV_VAR}`.

## Scope (v1)

- A plain orchestrator loop, one agent (manual Anthropic SDK loop), two tools
  (`login`, `http_request`) plus `record_finding`, YAML targets, a dry run, a
  USD cap, Markdown + JSON reports.
- Targets: `minmatside`, `maritime-leads`.

## Not building (v1)

- Multiple agent types or models, CI integration, an agent that learns from its
  own findings. Later, if useful.

## Verify before publishing

`npm run typecheck && npm test`, then a dry run against a target. Never make a
paid API call as part of verification.
