import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harnessDocs, link } from '../lib/link.mjs';

const BASE = 'https://raw.example/o/h/main/';
const profile = [
  '# 프로필', '', '## 나', '- OS: Windows', '',
  '## 겪은 문제',
  `하네스 문서가 정본이다 — 매주 읽는다(raw, \`${BASE}\` 아래):`,
  '- `docs/plan.md` 의 ⏸ · ⚠️ · 보류 줄', '- `README.md` — 큰 그림', '',
  '## 기각 목록', '- `docs/graph-port.md` §5 — 다시 올리지 않는다', '',
].join('\n');
const bare = '# 프로필\n\n## 겪은 문제\n- `CLAUDE.md` 가 길어지면 지시를 놓친다\n- 훅이 느리다\n';
const plan = [
  '# 계획',
  '- ⚠️ `SendMessage` 로 보낸 지시가 실행 중인 에이전트에 도착하지 않는다',
  '- 완료: `SendMessage` 정리',
  '- ⏸ `check` 와 `note` 는 짧은 일반 낱말',
  '- [ ] `CLAUDE_CODE_DISABLE_X=1` 시험',
  '- 보류: `/final-gate` 를 줄인다',
  '답장은 부모로 간다 ⚠️ `SendMessage`',
].join('\n');
const readme = '# 하네스\n- ⚠️ `PreToolUse` 훅 기동이 느리다\n';
const digest = { date: '2026-11-09', candidates: [
  { id: '2.1.317', lines: ['304: - Changed SendMessage so a message arrives earlier', '305: - Fixed SendMessages batching', '306: - Added `PreToolUse` matcher'] },
  { id: 'o/tool' },
] };
const fakeRun = (calls = []) => async (cmd, [url]) => {
  calls.push(url);
  const body = { [`${BASE}docs/plan.md`]: plan, [`${BASE}README.md`]: readme }[url];
  if (body === undefined) throw Object.assign(new Error('Command failed'), { stderr: 'curl: (22) The requested URL returned error: 404\n' });
  return body;
};

test('harnessDocs — 「겪은 문제」 절의 raw 기준 주소 + 백틱 .md 경로 · 기각 절 · 하네스 없는 프로필은 빼거나 빈 목록', () => {
  assert.deepEqual(harnessDocs(profile), [`${BASE}docs/plan.md`, `${BASE}README.md`]);
  assert.deepEqual(harnessDocs(bare), [], '기준 주소가 없으면 하네스가 없는 프로필');
  assert.deepEqual(harnessDocs(profile.replace(/\n/g, '\r\n')), [`${BASE}docs/plan.md`, `${BASE}README.md`]);
});

test('link — 열린 줄(⚠️ · ⏸ · - 보류 · - [ ])의 식별자 낱말을 공식 판 절 줄과 낱말 경계로 맞춘다 (11-09: 2.1.317:304 SendMessage ↔ plan:13 를 details 밖이라 놓쳤다)', async () => {
  const r = await link(profile, digest, fakeRun());
  assert.deepEqual(r.links, [
    { id: '2.1.317', line: 304, word: 'SendMessage', text: '- Changed SendMessage so a message arrives earlier', doc: `${BASE}docs/plan.md`, at: [2, 7] },
    { id: '2.1.317', line: 306, word: 'PreToolUse', text: '- Added `PreToolUse` matcher', doc: `${BASE}README.md`, at: [2] },
  ]);
  const [p] = r.docs;
  assert.equal(p.url, `${BASE}docs/plan.md`);
  assert.deepEqual(p.open.map((l) => Number(l.split(':')[0])), [2, 4, 5, 6, 7], '완료 줄은 열린 줄이 아니다');
  assert.deepEqual(p.words, ['SendMessage', 'CLAUDE_CODE_DISABLE_X=1', 'final-gate'], '짧은 일반 낱말(check · note)은 잡음이라 뺀다');
});

test('link — 하네스가 없는 프로필은 문서를 받지 않고 빈 목록 · 문서를 못 받으면 실패(조용히 0건이 되지 않게)', async () => {
  const calls = [];
  assert.deepEqual(await link(bare, digest, fakeRun(calls)), { docs: [], links: [] });
  assert.deepEqual(calls, []);
  await assert.rejects(link(profile.replace('README.md', 'GONE.md'), digest, fakeRun()), (e) => /404/.test(e.stderr));
});

test('link.mjs — 인자가 빠지면 usage 와 exit 2 · 하네스 없는 프로필은 빈 연결 후보를 --out 에', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const [p, d, out] = ['profile.md', 'digest.json', 'links.json'].map((f) => join(dir, f));
  writeFileSync(p, bare);
  writeFileSync(d, JSON.stringify(digest));
  const run = (...args) => spawnSync(process.execPath, ['tools/link.mjs', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(run('--profile', p, '--digest', d).status, 2);
  const r = run('--profile', p, '--digest', d, '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /연결 후보 0건/);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { docs: [], links: [] });
});
