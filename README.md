# redteam

A small defensive self-testing tool. It drives a QA agent against **your own**
apps running **locally**, to check that access rules actually hold — that an
author can't edit someone else's recipe, that a viewer can't reach admin
actions, and so on. One target file per app; the same attack method reused
across them.

It never touches production and never uses real user data. The one hard
boundary is a host guard: every request must go to a host the target file
allows, and that host must be loopback (your machine) unless you explicitly
opt a disposable preview in.

## How a run works

1. Start the app locally against its **test** database.
2. The tool logs in as each role and, per goal, lets the agent try the action
   that *should* be refused.
3. Findings land in `findings/<app>-<date>.md` and `.json`.
4. Turn real findings into ordinary tests in the app, so the hole stays closed.

## Install

```bash
npm install
cp .env.example .env.local   # fill in test accounts + ANTHROPIC_API_KEY
```

## Run

```bash
# Free dry run (default): fake model, no API call, no spend. Verifies the loop.
npm run attack -- minmatside

# Real run: costs Claude calls. Requires --confirm. Prints the estimate first,
# and stops hard at the budget caps in the target file.
npm run attack -- minmatside --confirm

# Lower the cost cap for a single run:
npm run attack -- minmatside --confirm --max-usd 0.10
```

## Cost control

- Default model is the cheapest (`claude-haiku-5-5`); a 4-goal run is roughly
  a few cents.
- `budget.maxRequests` and `budget.maxUsd` in each target file are **hard
  caps** — the run stops the moment either is hit. Actual cost is in the report.
- A dry run spends nothing. A real run needs `--confirm`.
- Belt and braces: set a monthly limit on your Anthropic account too.

## Targets

`targets/*.yaml` — one per app. Base URL, allowed (loopback) hosts, login path,
model, budget caps, test accounts (passwords via `${ENV_VAR}`), known routes,
and the goals. See `targets/minmatside.yaml` for a worked example.

## What this is not (yet)

No multiple agent types, no multiple models, no CI integration, no agent that
learns from its own findings. Added later if useful — start simple.
