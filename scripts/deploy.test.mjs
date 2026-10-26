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

async function runDeployment({ foreignKeys, queryOutput } = {}) {
  const commands = [];
  const errors = [];
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
      execSync(command) {
        commands.push(command);
        if (command === 'wrangler d1 list --json') {
          return Buffer.from(JSON.stringify([{ name: 'moepush-db', uuid: 'test-database' }]));
        }
        if (command.includes('SELECT name FROM sqlite_master')) {
          return result(command, [{ name: 'message_receipts' }, { name: 'message_receipt_deliveries' }]);
        }
        if (command.includes('pragma_foreign_key_list')) return result(command, [rows]);
        if (command.includes('migrations apply') || command.includes('--file=') ||
            command === 'wrangler pages secret bulk .env' || command === 'pnpm run deploy') {
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
    process: { env: {}, exit: (code) => { exitCode = code; } },
    console: { log() {}, error: (...args) => errors.push(args.map(String).join(' ')) },
    fetch: async () => ({ ok: true }),
    setTimeout,
    Error,
  }, { timeout: 1000 });
  return { commands, errors, exitCode };
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
