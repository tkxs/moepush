import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadSource(relative, modules = {}, globals = {}) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console: { log() {}, warn() {}, error() {} }, structuredClone, Response,
    require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`); return modules[name]; },
    ...globals,
  }, { timeout: 1000 });
  return exports;
}

const { safeInterpolate } = loadSource('../lib/template.ts');
const base = loadSource('../lib/channels/base.ts');
const nestedRule = JSON.stringify({
  msg_type: 'post', content: { post: { zh_cn: {
    title: '${body.subject}',
    // TemplateFields stores the rich-text textarea as a JSON string inside the outer JSON.
    content: JSON.stringify([[{ tag: 'text', text: '${body.content}' }]]),
  } } },
});

async function deliver(rule, body) {
  const requests = [];
  const { FeishuChannel } = loadSource('../lib/channels/feishu.ts', { './base': base }, {
    fetch: async (url, options) => {
      assert.equal(url, 'https://feishu.invalid/test-webhook');
      requests.push(JSON.parse(options.body));
      return Response.json({ code: 0, msg: 'success' });
    },
  });
  const message = JSON.parse(safeInterpolate(rule, { body }));
  await new FeishuChannel().sendMessage(message, { webhook: 'https://feishu.invalid/test-webhook' });
  assert.equal(requests.length, 1);
  return requests[0];
}

for (const [name, content] of [
  ['short test message', '这是一条测试推送。'],
  ['automatic low-balance message with line breaks', '站点：测试站点\n当前余额：4.2 余额 USD\n提醒阈值：30 余额 USD\n请及时充值。'],
  ['quotes in a site name', '站点："测试站点"'],
  ['backslashes and literal escape sequences', String.raw`路径 C:\logs\new，原文 \n 和 \t`],
  ['CRLF, tabs and JSON control characters', '第一行\r\n第二行\t字段\b\f\u0000'],
]) {
  test(`Feishu nested rich text preserves ${name}`, async () => {
    const message = await deliver(nestedRule, { subject: '【额度过低】测试站点', content });
    assert.equal(message.content.post.zh_cn.title, '【额度过低】测试站点');
    assert.deepEqual(message.content.post.zh_cn.content, [[{ tag: 'text', text: content }]]);
  });
}

test('plain text and native rich-text arrays retain their original shape', async () => {
  const body = { subject: '标题 "A"', content: '第一行\n第二行\\路径' };
  const text = JSON.stringify({ msg_type: 'text', content: { text: '${body.content}' } });
  assert.equal((await deliver(text, body)).content.text, body.content);
  const post = JSON.stringify({ msg_type: 'post', content: { post: { zh_cn: {
    title: '${body.subject}', content: [[{ tag: 'text', text: '${body.content}' }]],
  } } } });
  assert.deepEqual((await deliver(post, body)).content.post.zh_cn, { title: body.subject, content: [[{ tag: 'text', text: body.content }]] });
});

test('template functions preserve special characters in both JSON layers', async () => {
  const body = { content: '第一行\n"第二行"\\路径' };
  const rule = nestedRule.replace('${body.content}', '${truncate(body.content, 8)}');
  const result = await deliver(rule, body);
  assert.equal(result.content.post.zh_cn.content[0][0].text, body.content.slice(0, 8) + '...');
});

test('interpolated values remain data and cannot inject JSON or another template expression', () => {
  const content = '"},"admin":true,"text":"${body.secret}';
  const rule = JSON.stringify({ text: '${body.content}', value: '${truncate(body.content, 100)}' });
  assert.deepEqual(JSON.parse(safeInterpolate(rule, { body: { content, secret: 'must not expand' } })), { text: content, value: content });
});

test('missing values and legacy unquoted numeric variables remain supported', () => {
  assert.deepEqual(JSON.parse(safeInterpolate('{"count":${body.count}}', { body: { count: 2 } })), { count: 2 });
  assert.deepEqual(JSON.parse(safeInterpolate('{"text":"${body.absent}"}', { body: {} }, 'missing')), { text: 'missing' });
});

test('malformed rich-text JSON is still rejected before any webhook request', async () => {
  const rule = JSON.stringify({ msg_type: 'post', content: { post: { zh_cn: { title: 'test', content: 'not JSON' } } } });
  await assert.rejects(deliver(rule, {}), /富文本内容格式不正确/);
});

test('the real push route accepts the five-field automatic reminder and forwards valid Feishu rich text', async () => {
  const forwarded = [];
  const { FeishuChannel } = loadSource('../lib/channels/feishu.ts', { './base': base }, {
    fetch: async (_url, options) => {
      forwarded.push(JSON.parse(options.body));
      return Response.json({ code: 0, msg: 'success' });
    },
  });
  const endpoint = { id: 'local-endpoint', status: 'active', rule: nestedRule, userId: 'local-user', name: '额度提醒',
    channel: { id: 'local-channel', name: '飞书', type: 'feishu', webhook: 'https://feishu.invalid/test-webhook' } };
  const { POST } = loadSource('../app/api/push/[id]/route.ts', {
    '@/lib/db': { getDb: async () => ({ query: { endpoints: { findFirst: async () => endpoint } } }) },
    '@/lib/db/schema/endpoints': { endpoints: { id: 'id' } },
    'drizzle-orm': { eq: () => ({}) },
    '@/lib/template': { safeInterpolate },
    '@/lib/channels': { sendChannelMessage: async (type, message, options) => {
      assert.equal(type, 'feishu'); return new FeishuChannel().sendMessage(message, options);
    } },
    '@/lib/message-receipts': {
      tryCreateMessageReceipt: async () => null, tryCreateMessageReceiptDelivery: async () => null, tryFinalizeMessageReceipt: async () => null,
    },
  });
  const payload = { subject: '【额度过低】测试站点', fromAddress: '上游观测', toAddress: '测试站点', receivedAt: '2026-10-26T11:17:21.077Z',
    content: '站点：测试站点\n地址：https://upstream.example\n当前余额：4.2 余额 USD\n提醒阈值：30 余额 USD\n采集时间：2026-10-26T11:17:21.077Z\n请及时充值。' };
  const response = await POST(new Request('https://push.invalid/api/push/local-endpoint', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }), { params: Promise.resolve({ id: endpoint.id }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, '推送成功');
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].content.post.zh_cn.content[0][0].text, payload.content);
});
