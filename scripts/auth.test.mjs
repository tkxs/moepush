import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const requireFromNextAuth = createRequire(import.meta.resolve('next-auth'));
const requireFromCore = createRequire(requireFromNextAuth.resolve('@auth/core'));
const { validateAuthResponse } = await import(pathToFileURL(requireFromCore.resolve('oauth4webapi')).href);

const source = fs.readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function githubProviderConfig() {
  let config;
  const modules = {
    'next-auth': (factory) => { config = factory(); return { handlers: {} }; },
    // The provider pinned in pnpm-lock.yaml does not supply a default issuer.
    'next-auth/providers/github': (options) => ({ id: 'github', type: 'oauth', ...options }),
    'next-auth/providers/credentials': (options) => ({ id: 'credentials', type: 'credentials', ...options }),
    '@auth/drizzle-adapter': { DrizzleAdapter: () => ({}) },
    '@/lib/db': { getDb: () => ({}) },
    'drizzle-orm': {},
    '@/lib/db/schema': {},
    './validation': {},
    './utils': {},
    './avatar': {},
  };
  vm.runInNewContext(compiled, {
    exports: {},
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
      return modules[name];
    },
    process: { env: { AUTH_SECRET: 'test-secret', AUTH_GITHUB_ID: 'test-client', AUTH_GITHUB_SECRET: 'test-client-secret' } },
  }, { timeout: 1000 });
  return config.providers.find((provider) => provider.id === 'github');
}

function validateCallback(issuer, state = 'expected-state') {
  const provider = githubProviderConfig();
  return validateAuthResponse(
    { issuer: provider.issuer ?? 'https://authjs.dev' },
    { client_id: provider.clientId },
    new URLSearchParams({ code: 'test-code', iss: issuer, state }),
    'expected-state',
  );
}

test('GitHub OAuth callback accepts its RFC 9207 issuer with the pinned legacy provider', () => {
  const params = validateCallback('https://github.com/login/oauth');
  assert.equal(params.get('code'), 'test-code');
});

test('GitHub OAuth callback still rejects an unexpected issuer', () => {
  assert.throws(() => validateCallback('https://invalid.example'), /unexpected.*iss/);
});

test('GitHub OAuth callback still rejects an incorrect state', () => {
  assert.throws(() => validateCallback('https://github.com/login/oauth', 'incorrect-state'), /state/);
});
