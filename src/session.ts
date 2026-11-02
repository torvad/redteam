// A minimal HTTP session: keeps a cookie jar, resolves paths against baseUrl,
// and runs every request through the host guard. This is the only thing in the
// tool that touches the network, and it can only ever reach allowed hosts.

import { assertAllowedUrl } from './hostGuard.js';

export interface HttpResult {
  status: number;
  statusText: string;
  body: string;
  /** Truncated body actually shown to the agent, to keep tokens down. */
  bodyPreview: string;
}

export interface Account {
  role: string;
  email: string;
  password: string;
}

const MAX_BODY_PREVIEW = 2000;

export class Session {
  private cookies = new Map<string, string>();
  private currentRole: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly allowedHosts: string[],
    private readonly allowExternalHosts: string[],
    private readonly loginPath: string,
    private readonly accounts: Account[],
  ) {}

  get role(): string | null {
    return this.currentRole;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private storeSetCookies(res: Response): void {
    // Node fetch exposes a combined getSetCookie() in recent versions.
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    const list = anyHeaders.getSetCookie?.() ?? [];
    for (const raw of list) {
      const first = raw.split(';', 1)[0] ?? '';
      const eq = first.indexOf('=');
      if (eq > 0) {
        this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    }
  }

  async request(method: string, path: string, body?: unknown): Promise<HttpResult> {
    const url = new URL(path, this.baseUrl).toString();
    assertAllowedUrl(url, this.allowedHosts, this.allowExternalHosts);

    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader();
    if (cookie) headers['cookie'] = cookie;
    let payload: string | undefined;
    if (body !== undefined && body !== null) {
      headers['content-type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, { method: method.toUpperCase(), headers, body: payload, redirect: 'manual' });
    this.storeSetCookies(res);
    const text = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      body: text,
      bodyPreview: text.length > MAX_BODY_PREVIEW ? `${text.slice(0, MAX_BODY_PREVIEW)}…[truncated]` : text,
    };
  }

  /** Log in as the account for `role`, using the target's loginPath. */
  async login(role: string): Promise<HttpResult> {
    const account = this.accounts.find((a) => a.role === role);
    if (!account) {
      throw new Error(`No test account configured for role "${role}".`);
    }
    this.cookies.clear();
    const result = await this.request('POST', this.loginPath, {
      email: account.email,
      password: account.password,
    });
    if (result.status >= 200 && result.status < 400) {
      this.currentRole = role;
    }
    return result;
  }
}
