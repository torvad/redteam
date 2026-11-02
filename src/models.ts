// Two implementations of the same small interface the agent loop talks to:
//   - RealModel calls the Anthropic API (costs money; only on --confirm runs)
//   - FakeModel is scripted and free, for --dry-run: it exercises the whole
//     loop (login, a request, record a finding) without any network or spend.

import Anthropic from '@anthropic-ai/sdk';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface MessageParam {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelResponse {
  stop_reason: string | null;
  content: ContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface Model {
  readonly name: string;
  createMessage(params: {
    system: string;
    messages: MessageParam[];
    tools: ToolDef[];
    maxTokens: number;
  }): Promise<ModelResponse>;
}

export class RealModel implements Model {
  private client: Anthropic;
  constructor(readonly name: string, apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createMessage(params: {
    system: string;
    messages: MessageParam[];
    tools: ToolDef[];
    maxTokens: number;
  }): Promise<ModelResponse> {
    const res = await this.client.messages.create({
      model: this.name,
      max_tokens: params.maxTokens,
      system: params.system,
      tools: params.tools as Anthropic.Tool[],
      messages: params.messages as unknown as Anthropic.MessageParam[],
    });
    return {
      stop_reason: res.stop_reason,
      content: res.content as unknown as ContentBlock[],
      usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
    };
  }
}

/**
 * Free, deterministic stand-in. It plays a fixed three-step script per goal:
 * log in as the first non-admin role, probe one route, then record a finding
 * noting the run was a dry run. No API, no cost.
 */
export class FakeModel implements Model {
  readonly name = 'fake-dry-run';
  private step = 0;

  constructor(private readonly probeRole: string, private readonly probePath: string) {}

  async createMessage(params: {
    messages: MessageParam[];
  }): Promise<ModelResponse> {
    const usage = { input_tokens: 0, output_tokens: 0 };
    const id = `dry-${this.step}`;
    switch (this.step++) {
      case 0:
        return {
          stop_reason: 'tool_use',
          usage,
          content: [{ type: 'tool_use', id, name: 'login', input: { role: this.probeRole } }],
        };
      case 1:
        return {
          stop_reason: 'tool_use',
          usage,
          content: [{ type: 'tool_use', id, name: 'http_request', input: { method: 'GET', path: this.probePath } }],
        };
      case 2:
        return {
          stop_reason: 'tool_use',
          usage,
          content: [
            {
              type: 'tool_use',
              id,
              name: 'record_finding',
              input: {
                severity: 'info',
                title: 'Dry run completed',
                detail: 'FakeModel exercised login -> http_request -> record_finding. No real testing happened.',
              },
            },
          ],
        };
      default:
        return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Dry run done.' }] };
    }
  }
}
