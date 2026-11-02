import { describe, expect, it } from 'vitest';
import { assertAllowedUrl, HostNotAllowedError } from './hostGuard.js';

const local = ['localhost', '127.0.0.1'];

describe('assertAllowedUrl', () => {
  it('allows a loopback host that is in the list', () => {
    expect(assertAllowedUrl('http://localhost:3000/api/x', local).hostname).toBe('localhost');
    expect(assertAllowedUrl('http://127.0.0.1:3000/api/x', local).hostname).toBe('127.0.0.1');
  });

  it('refuses a host not in allowedHosts (e.g. production)', () => {
    expect(() => assertAllowedUrl('https://minmatside.vercel.app/api/x', local)).toThrow(HostNotAllowedError);
  });

  it('refuses a non-loopback host even if listed, unless explicitly external', () => {
    expect(() => assertAllowedUrl('https://example.com/x', ['example.com'])).toThrow(HostNotAllowedError);
    expect(assertAllowedUrl('https://example.com/x', ['example.com'], ['example.com']).hostname).toBe('example.com');
  });

  it('refuses non-http protocols', () => {
    expect(() => assertAllowedUrl('file:///etc/passwd', local)).toThrow(HostNotAllowedError);
    expect(() => assertAllowedUrl('ftp://localhost/x', local)).toThrow(HostNotAllowedError);
  });

  it('refuses a malformed URL', () => {
    expect(() => assertAllowedUrl('not a url', local)).toThrow(HostNotAllowedError);
  });
});
