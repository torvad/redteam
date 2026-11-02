// Loads and validates a target YAML file. Secrets (passwords) never live in
// the file itself — they are written as ${ENV_VAR} and resolved from the
// environment (.env.local) at load time.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface Account {
  role: string;
  email: string;
  password: string;
}

export interface Goal {
  id: string;
  /** What should hold — phrased as a defensive assertion to verify. */
  description: string;
}

export interface TargetConfig {
  app: string;
  baseUrl: string;
  allowedHosts: string[];
  allowExternalHosts: string[];
  loginPath: string;
  model: string;
  budget: { maxRequests: number; maxUsd: number };
  accounts: Account[];
  routes: string[];
  goals: Goal[];
}

/** Replace ${VAR} with process.env.VAR; throw if a referenced var is missing. */
function expandEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
    const resolved = env[name];
    if (resolved === undefined || resolved === '') {
      throw new Error(`Target references environment variable "${name}", but it is not set.`);
    }
    return resolved;
  });
}

function requireString(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${where}: "${key}" must be a non-empty string.`);
  }
  return v;
}

export function loadTarget(path: string, env: NodeJS.ProcessEnv = process.env): TargetConfig {
  const raw = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Target file ${path} did not parse to an object.`);
  }

  const app = requireString(raw, 'app', path);
  const baseUrl = requireString(raw, 'baseUrl', path);
  const loginPath = requireString(raw, 'loginPath', path);
  const model = typeof raw.model === 'string' && raw.model ? raw.model : 'claude-haiku-5-5';

  const allowedHosts = Array.isArray(raw.allowedHosts) ? raw.allowedHosts.map(String) : [];
  if (allowedHosts.length === 0) {
    throw new Error(`${path}: "allowedHosts" must list at least one host.`);
  }
  const allowExternalHosts = Array.isArray(raw.allowExternalHosts)
    ? raw.allowExternalHosts.map(String)
    : [];

  const budgetRaw = (raw.budget ?? {}) as Record<string, unknown>;
  const maxRequests = Number(budgetRaw.maxRequests);
  const maxUsd = Number(budgetRaw.maxUsd);
  if (!Number.isFinite(maxRequests) || maxRequests <= 0) {
    throw new Error(`${path}: "budget.maxRequests" must be a positive number.`);
  }
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    throw new Error(`${path}: "budget.maxUsd" must be a positive number.`);
  }

  const accountsRaw = Array.isArray(raw.accounts) ? raw.accounts : [];
  const accounts: Account[] = accountsRaw.map((a, i) => {
    const o = a as Record<string, unknown>;
    return {
      role: requireString(o, 'role', `${path} accounts[${i}]`),
      email: expandEnv(requireString(o, 'email', `${path} accounts[${i}]`), env),
      password: expandEnv(requireString(o, 'password', `${path} accounts[${i}]`), env),
    };
  });
  if (accounts.length === 0) {
    throw new Error(`${path}: "accounts" must list at least one test account.`);
  }

  const routes = Array.isArray(raw.routes) ? raw.routes.map(String) : [];

  const goalsRaw = Array.isArray(raw.goals) ? raw.goals : [];
  const goals: Goal[] = goalsRaw.map((g, i) => {
    const o = g as Record<string, unknown>;
    return {
      id: requireString(o, 'id', `${path} goals[${i}]`),
      description: requireString(o, 'description', `${path} goals[${i}]`),
    };
  });
  if (goals.length === 0) {
    throw new Error(`${path}: "goals" must list at least one goal.`);
  }

  return {
    app,
    baseUrl,
    allowedHosts,
    allowExternalHosts,
    loginPath,
    model,
    budget: { maxRequests, maxUsd },
    accounts,
    routes,
    goals,
  };
}
