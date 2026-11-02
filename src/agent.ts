// One goal = one agent run. The agent is given a defensive assertion to verify
// ("an author must not be able to edit another author's recipe") and a tiny
// toolset locked to the local app. It logs in as a role, sends requests, reads
// the responses, and records findings. The loop owns the budget and stops the
// moment a cap is hit.

import { Budget, BudgetExceededError } from './budget.js';
import type { Goal, TargetConfig } from './config.js';
import type { Model, MessageParam, ToolDef, ContentBlock } from './models.js';
import { Session } from './session.js';

export interface Finding {
  goalId: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  title: string;
  detail: string;
}

export interface GoalResult {
  goal: Goal;
  findings: Finding[];
  requests: number;
  stoppedBy: 'done' | 'budget' | 'error';
  error?: string;
}

const MAX_TOKENS = 1024;
const MAX_TURNS = 40;

const TOOLS: ToolDef[] = [
  {
    name: 'login',
    description:
      'Authenticate as one of the configured test roles. Clears any prior session. Returns the login response status.',
    input_schema: {
      type: 'object',
      properties: { role: { type: 'string', description: 'The role to log in as, e.g. "author-a".' } },
      required: ['role'],
    },
  },
  {
    name: 'http_request',
    description:
      'Send an HTTP request to the app under test (locked to the allowed local host). Use it to check whether an action the current role should NOT be allowed is correctly refused. Returns status and a truncated body.',
    input_schema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'GET, POST, PUT, PATCH or DELETE.' },
        path: { type: 'string', description: 'Path or URL on the app, e.g. "/api/recipes/foo".' },
        body: { description: 'Optional JSON body.' },
      },
      required: ['method', 'path'],
    },
  },
  {
    name: 'record_finding',
    description:
      'Record a conclusion about whether the rule held. Use severity "info" when the rule held (good), or low/medium/high when a check that should have been refused was allowed.',
    input_schema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['info', 'low', 'medium', 'high'] },
        title: { type: 'string' },
        detail: { type: 'string', description: 'What was tried, the response, and a suggested regression test.' },
      },
      required: ['severity', 'title', 'detail'],
    },
  },
];

function systemPrompt(target: TargetConfig): string {
  return [
    `You are a defensive QA agent checking the access rules of ${target.app}, an app owned by the person running you.`,
    `It runs locally at ${target.baseUrl} against a disposable TEST database. This is authorized self-testing of their own software.`,
    `Your job: verify that the stated rule holds. Log in as the relevant role and try the action that SHOULD be refused.`,
    `If the app correctly refuses (e.g. 401/403/404 and nothing changes), that is a PASS — record it with severity "info".`,
    `If the action is wrongly allowed, record a finding with a severity and a suggested regression test.`,
    `Known routes: ${target.routes.join(', ') || '(none listed)'}.`,
    `Available roles: ${target.accounts.map((a) => a.role).join(', ')}.`,
    `Be efficient: a handful of requests is usually enough. When done, call record_finding and then stop.`,
  ].join('\n');
}

async function runTool(
  session: Session,
  name: string,
  input: Record<string, unknown>,
  findings: Finding[],
  goalId: string,
): Promise<{ text: string; isError: boolean }> {
  try {
    if (name === 'login') {
      const r = await session.login(String(input.role));
      return { text: `login ${input.role}: HTTP ${r.status}`, isError: false };
    }
    if (name === 'http_request') {
      const r = await session.request(String(input.method), String(input.path), input.body);
      return { text: `HTTP ${r.status} ${r.statusText}\n${r.bodyPreview}`, isError: false };
    }
    if (name === 'record_finding') {
      const severity = String(input.severity) as Finding['severity'];
      findings.push({
        goalId,
        severity: ['info', 'low', 'medium', 'high'].includes(severity) ? severity : 'info',
        title: String(input.title ?? 'Untitled'),
        detail: String(input.detail ?? ''),
      });
      return { text: 'recorded', isError: false };
    }
    return { text: `Unknown tool ${name}`, isError: true };
  } catch (err) {
    return { text: `Tool error: ${(err as Error).message}`, isError: true };
  }
}

export async function runGoal(
  model: Model,
  target: TargetConfig,
  goal: Goal,
  budget: Budget,
): Promise<GoalResult> {
  const session = new Session(
    target.baseUrl,
    target.allowedHosts,
    target.allowExternalHosts,
    target.loginPath,
    target.accounts,
  );
  const findings: Finding[] = [];
  const messages: MessageParam[] = [
    { role: 'user', content: [{ type: 'text', text: `Rule to verify: ${goal.description}` }] },
  ];

  let stoppedBy: GoalResult['stoppedBy'] = 'done';
  let error: string | undefined;
  const requestsBefore = budget.requestCount;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      budget.assertCanRequest();
      const res = await model.createMessage({ system: systemPrompt(target), messages, tools: TOOLS, maxTokens: MAX_TOKENS });
      budget.record(res.usage.input_tokens, res.usage.output_tokens);
      messages.push({ role: 'assistant', content: res.content });

      const toolUses = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      if (toolUses.length === 0 || res.stop_reason === 'end_turn') break;

      const results: ContentBlock[] = [];
      for (const tu of toolUses) {
        const out = await runTool(session, tu.name, tu.input, findings, goal.id);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.text, is_error: out.isError });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      stoppedBy = 'budget';
    } else {
      stoppedBy = 'error';
      error = (err as Error).message;
    }
  }

  return { goal, findings, requests: budget.requestCount - requestsBefore, stoppedBy, error };
}
