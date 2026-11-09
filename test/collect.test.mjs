import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect, loadSources } from '../lib/collect.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'scout-'));
// 응답표: 키가 args 에 들어 있으면 그 값(Error 면 reject)
const fakeRun = (table, calls = []) => async (cmd, args) => {
  calls.push([cmd, args]);
  const hit = Object.entries(table).find(([k]) => args.some((a) => a.includes(k)));
  if (!hit) throw new Error(`응답 없음: ${cmd} ${args.join(' ')}`);
  if (hit[1] instanceof Error) throw hit[1];
  return hit[1];
};
const lines = (id, url) => ({ id, group: '공식', kind: 'lines', url, pattern: 'item-(\\w+)', firstRun: 9 });
const snap = (dir, id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')).ids;

test('url 의 {since} 를 바꾼다', async () => {
  const calls = [];
  const src = { id: 'q', group: '공식', kind: 'json', url: 'https://api.example/search?q=created:%3E{since}', path: 'items[].n' };
  await collect({ sources: [src], snapshotsDir: tmp(), since: '2026-11-02', run: fakeRun({ 'created:': '{"items":[{"n":"x"}]}' }, calls) });
  assert.ok(calls[0][1].some((a) => a.includes('created:%3E2026-11-02')));
});

test('두 번째 실행은 새 항목만', async () => {
  const dir = tmp();
  const src = lines('s', 'https://a.example/');
  const r1 = await collect({ sources: [src], snapshotsDir: dir, since: '2026-11-02', run: fakeRun({ 'a.example': 'item-a' }) });
  assert.deepEqual(r1.sources[0].newItems.map((i) => i.id), ['a']);
  const r2 = await collect({ sources: [src], snapshotsDir: dir, since: '2026-11-02', run: fakeRun({ 'a.example': 'item-a item-b' }) });
  assert.deepEqual(r2.sources[0].newItems.map((i) => i.id), ['b']);
  assert.deepEqual(snap(dir, 's'), ['a', 'b']);
});

test('한 원천 실패는 다른 원천을 막지 않고 스냅숏을 지키지 않는다', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'x.json'), JSON.stringify({ ids: ['old'] }));
  const run = fakeRun({ 'x.example': new Error('curl: (28) timed out'), 'y.example': 'item-y' });
  const r = await collect({ sources: [lines('x', 'https://x.example/'), lines('y', 'https://y.example/')], snapshotsDir: dir, since: '2026-11-02', run });
  const [x, y] = r.sources;
  assert.equal(x.ok, false);
  assert.match(x.error, /timed out/);
  assert.deepEqual(snap(dir, 'x'), ['old']);
  assert.equal(y.ok, true);
  assert.deepEqual(snap(dir, 'y'), ['y']);
});

test('0개는 실패다', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'z.json'), JSON.stringify({ ids: ['old'] }));
  const r = await collect({ sources: [lines('z', 'https://z.example/')], snapshotsDir: dir, since: '2026-11-02', run: fakeRun({ 'z.example': '<html>바뀐 페이지</html>' }) });
  assert.equal(r.sources[0].ok, false);
  assert.equal(r.sources[0].error, '항목 0개 — 패턴 확인');
  assert.deepEqual(snap(dir, 'z'), ['old']);
});

test('{since} 로 기간을 거르는 원천은 0개가 정상이다', async () => {
  const src = { id: 'w', group: '공식', kind: 'json', url: 'https://api.example/search?q=created:%3E{since}', path: 'items[].n' };
  const r = await collect({ sources: [src], snapshotsDir: tmp(), since: '2026-11-02', run: fakeRun({ 'created:': '{"items":[]}' }) });
  assert.equal(r.sources[0].ok, true);
  assert.deepEqual(r.sources[0].newItems, []);
});

test('기간 원천은 창에서 빠졌다 돌아온 항목을 새것으로 보지 않는다', async () => {
  const dir = tmp();
  const src = { id: 'w', group: '커뮤니티', kind: 'json', url: 'https://api.example/search?q=pushed:%3E{since}', path: 'items[].n', firstRun: 9 };
  const once = (n) => collect({ sources: [src], snapshotsDir: dir, since: '2026-11-02', run: fakeRun({ 'pushed:': JSON.stringify({ items: n.map((x) => ({ n: x })) }) }) });
  await once(['a']);
  await once(['b']);
  const r3 = await once(['a', 'c']);
  assert.deepEqual(r3.sources[0].newItems.map((i) => i.id), ['c']);
});

test('모든 원천의 스냅숏은 쌓는다 — 일부만 잡히다 돌아와도 새것이 아니다', async () => {
  const dir = tmp();
  const src = lines('p', 'https://p.example/');
  const once = (body) => collect({ sources: [src], snapshotsDir: dir, since: '2026-11-02', run: fakeRun({ 'p.example': body }) });
  await once('item-a item-b');
  await once('item-menu');
  const r3 = await once('item-a item-b item-c');
  assert.deepEqual(r3.sources[0].newItems.map((i) => i.id), ['c']);
});

test('실패 원인은 stderr 마지막 줄로 남긴다', async () => {
  const err = Object.assign(new Error('Command failed: curl -sSL https://x.example/'), { stderr: 'curl: (6) Could not resolve host: x.example\n' });
  const r = await collect({ sources: [lines('x', 'https://x.example/')], snapshotsDir: tmp(), since: '2026-11-02', run: fakeRun({ 'x.example': err }) });
  assert.equal(r.sources[0].error, 'curl: (6) Could not resolve host: x.example');
});

test('pinned-marketplace — 고정 sha 와 최신 HEAD 가 다르면 항목', async () => {
  const market = JSON.stringify({ plugins: [{ name: 'p', source: { url: 'https://github.com/o/p.git', sha: 'aaaaaaa1' } }] });
  const src = { id: 'pinned', group: '고정', kind: 'pinned-marketplace', url: 'https://raw.example/market.json', firstRun: 99 };
  const behind = await collect({ sources: [src], snapshotsDir: tmp(), since: '2026-11-02', run: fakeRun({ 'raw.example': market, 'o/p.git': 'bbbbbbb2\tHEAD\n' }) });
  assert.deepEqual(behind.sources[0].newItems, [
    { id: 'p@bbbbbbb2', title: 'p: 고정 aaaaaaa → 최신 bbbbbbb', url: 'https://github.com/o/p/compare/aaaaaaa...bbbbbbb' },
  ]);
  const same = await collect({ sources: [src], snapshotsDir: tmp(), since: '2026-11-02', run: fakeRun({ 'raw.example': market, 'o/p.git': 'aaaaaaa1\tHEAD\n' }) });
  assert.equal(same.sources[0].ok, true);
  assert.deepEqual(same.sources[0].newItems, []);
});

test('git-tags 는 ls-remote --tags --sort=-v:refname, git-head 는 HEAD sha 하나', async () => {
  const calls = [];
  const run = fakeRun({ 'o/t': 's1\trefs/tags/v2.0.0\ns2\trefs/tags/v1.0.0\n', 'o/h': 'cccccccc3\tHEAD\n' }, calls);
  const r = await collect({
    sources: [
      { id: 't', group: '공식', kind: 'git-tags', repo: 'https://github.com/o/t', tagPattern: '^v\\d+\\.\\d+\\.\\d+$', firstRun: 1 },
      { id: 'h', group: '공식', kind: 'git-head', repo: 'https://github.com/o/h', firstRun: 1 },
    ],
    snapshotsDir: tmp(), since: '2026-11-02', run,
  });
  assert.deepEqual(calls[0], ['git', ['ls-remote', '--tags', '--sort=-v:refname', 'https://github.com/o/t']]);
  assert.deepEqual(calls[1], ['git', ['ls-remote', 'https://github.com/o/h', 'HEAD']]);
  assert.deepEqual(r.sources[0].newItems.map((i) => i.id), ['v2.0.0']);
  assert.deepEqual(r.sources[1].newItems.map((i) => i.id), ['cccccccc3']);
});

test('loadSources — id 가 겹치면 throw', () => {
  const dir = tmp();
  const a = join(dir, 'a.json');
  const b = join(dir, 'b.json');
  writeFileSync(a, JSON.stringify([{ id: 'dup' }]));
  writeFileSync(b, JSON.stringify([{ id: 'dup' }]));
  assert.throws(() => loadSources([a, b]), /dup/);
  assert.equal(loadSources([a]).length, 1);
  assert.equal(existsSync(a), true);
});
