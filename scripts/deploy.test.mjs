import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./deploy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function runDeployment({
  foreignKeys,
  queryOutput,
  existingEnvironmentVariables = [],
  environment = { AUTH_SECRET: 'test-secret', AUTH_GITHUB_ID: 'test-client', AUTH_GITHUB_SECRET: 'test-client-secret' },
  projectStatus = 200,
} = {}) {
  const commands = [];
  const errors = [];
  const secretWrites = [];
  const files = new Map([
    [path.resolve('wrangler.example.json'), JSON.stringify({ d1_databases: [{}] })],
  ]);
  let exitCode = 0;
  const rows = foreignKeys ?? { receipts_user_table: 'user', deliveries_user_table: 'user' };
  const result = (command, values) => {
    if (queryOutput !== undefined) return Buffer.from(queryOutput);
    const json = JSON.stringify([{ results: values, success: true }], null, 2);
    return Buffer.from(command.includes('--json') ? json : `Executing on remote database...\n${json}`);
  };
  const modules = {
    child_process: {
      execSync(command, options) {
        commands.push(command);
        if (command === 'wrangler d1 list --json') {
          return Buffer.from(JSON.stringify([{ name: 'moepush-db', uuid: 'test-database' }]));
        }
        if (command.includes('SELECT name FROM sqlite_master')) {
          return result(command, [{ name: 'message_receipts' }, { name: 'message_receipt_deliveries' }]);
        }
        if (command.includes('pragma_foreign_key_list')) return result(command, [rows]);
        if (command.startsWith('wrangler pages secret bulk')) {
          secretWrites.push(options?.input ? JSON.parse(options.input) : null);
          return Buffer.from('');
        }
        if (command.includes('migrations apply') || command.includes('--file=') ||
            command === 'pnpm run deploy') {
          return Buffer.from('');
        }
        throw new Error(`Unexpected command: ${command}`);
      },
    },
    fs: {
      readFileSync: (file) => {
        assert.ok(files.has(file), `Unexpected file read: ${file}`);
        return files.get(file);
      },
      writeFileSync: (file, data) => files.set(file, data),
    },
    path,
  };
  await vm.runInNewContext(compiled, {
    exports: {},
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
      return modules[name];
    },
    process: { env: environment, exit: (code) => { exitCode = code; } },
    console: { log() {}, error: (...args) => errors.push(args.map(String).join(' ')) },
    fetch: async () => ({
      ok: projectStatus === 200,
      status: projectStatus,
      json: async () => ({
        success: true,
        result: { deployment_configs: { production: { env_vars: Object.fromEntries(
          existingEnvironmentVariables.map((name) => [name, { type: 'secret_text' }]),
        ) } } },
      }),
    }),
    setTimeout,
    Error,
  }, { timeout: 1000 });
  return { commands, errors, exitCode, secretWrites, files };
}

test('healthy D1 schema reaches Pages deployment without rebuilding receipt tables', async () => {
  const result = await runDeployment();
  assert.equal(result.exitCode, 0, result.errors.join('\n'));
  assert.ok(result.commands.includes('pnpm run deploy'));
  assert.ok(!result.commands.some((command) => command.includes('--file=')));
  const schemaQueries = result.commands.filter((command) => command.includes('--command'));
  assert.ok(schemaQueries.length > 0);
  assert.ok(schemaQueries.every((command) => command.includes('--json')));
});

test('a wrong foreign key stops deployment without running destructive repair SQL', async () => {
  const result = await runDeployment({
    foreignKeys: { receipts_user_table: 'users', deliveries_user_table: 'user' },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(!result.commands.includes('pnpm run deploy'));
  assert.ok(!result.commands.some((command) => command.includes('0012_fix_message_receipt_user_fk.sql')));
  assert.match(result.errors.join('\n'), /foreign key/i);
});

for (const queryOutput of ['not JSON', '[{"success":false,"results":[]}]', '[]']) {
  test(`invalid D1 query output stops before mutations: ${queryOutput}`, async () => {
    const result = await runDeployment({ queryOutput });
    assert.equal(result.exitCode, 1);
    assert.ok(!result.commands.includes('pnpm run deploy'));
    assert.ok(!result.commands.some((command) => command.includes('--file=')));
  });
}

test('deployment preserves Cloudflare authentication settings without requiring GitHub copies', async () => {
  const result = await runDeployment({
    existingEnvironmentVariables: ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'DISABLE_REGISTER'],
    environment: {},
  });
  assert.equal(result.exitCode, 0, result.errors.join('\n'));
  assert.ok(result.commands.includes('pnpm run deploy'));
  assert.equal(result.secretWrites.length, 0);
  assert.ok(!result.files.has(path.resolve('.env')));
});

test('deployment seeds only settings that are missing in Cloudflare', async () => {
  const result = await runDeployment({
    existingEnvironmentVariables: ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'DISABLE_REGISTER'],
  });
  assert.equal(result.exitCode, 0, result.errors.join('\n'));
  assert.deepEqual(result.secretWrites, [{ AUTH_GITHUB_SECRET: 'test-client-secret' }]);
});

test('missing authentication settings fail instead of uploading undefined values', async () => {
  const result = await runDeployment({ environment: { AUTH_SECRET: 'test-secret' } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.secretWrites.length, 0);
  assert.ok(!result.commands.includes('pnpm run deploy'));
  assert.match(result.errors.join('\n'), /AUTH_GITHUB_ID/);
});

test('failure to inspect Cloudflare settings stops deployment before secret writes', async () => {
  const result = await runDeployment({ projectStatus: 403 });
  assert.equal(result.exitCode, 1);
  assert.equal(result.secretWrites.length, 0);
  assert.ok(!result.commands.includes('pnpm run deploy'));
});
