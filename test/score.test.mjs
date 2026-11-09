import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { total, validate, select } from '../lib/score.mjs';

const S = { relevance: 4, evidence: 2, cost: 2, env: 1, removes: false, security: false };
// 합계가 t 가 되는 항목 — 관련성은 r
const entry = (id, t, r = Math.min(4, t)) => ({ id, name: id, kind: '도구', source: 'x', scores: { relevance: r, evidence: 0, cost: 0, env: 0, removes: false, security: false, ...fill(t - r) } });
const fill = (rest) => ({ evidence: Math.min(2, rest), cost: Math.min(2, Math.max(0, rest - 2)), env: Math.max(0, rest - 4) });

test('total', () => {
  assert.equal(total(S), 9);
  assert.equal(total({ ...S, removes: true }), 11);
  assert.equal(total({ ...S, security: true }), 7);
});

test('범위 밖 점수는 id 와 함께 실패', () => {
  assert.throws(() => validate([{ id: 'x', scores: { ...S, relevance: 5 } }]), /x/);
  assert.throws(() => validate([{ id: 'y', scores: { relevance: 1, evidence: 0, cost: 0 } }]), /y/);
  assert.throws(() => validate([{ id: 'z', scores: { ...S, removes: 'yes' } }]), /z/);
  assert.doesNotThrow(() => validate([{ id: 'ok', scores: S }]));
});

test('문턱 · 상한 · 아깝게 빠진 것 · 번호', () => {
  const r = select([entry('a', 9), entry('b', 6), entry('c', 5), entry('d', 4), entry('e', 1)], { threshold: 5, cap: 2, near: 1 });
  assert.deepEqual(r.items.map((i) => [i.n, i.id, i.total]), [[1, 'a', 9], [2, 'b', 6]]);
  assert.deepEqual(r.nearMiss.map((i) => [i.id, i.total]), [['d', 4]]);
});

test('문턱 · 상한 · 근접 수가 정수가 아니면 실패', () => {
  assert.throws(() => select([entry('a', 9)], { threshold: Number('5점') }), /threshold/);
  assert.throws(() => select([entry('a', 9)], { cap: NaN }), /cap/);
});

test('같은 점수는 관련성이 높은 쪽, 그다음 입력 순서', () => {
  const r = select([entry('p', 6, 2), entry('q', 6, 4), entry('s', 6, 2)], { threshold: 5 });
  assert.deepEqual(r.items.map((i) => i.id), ['q', 'p', 's']);
});

test('추천은 관련성 2 이상 — 공식 항목은 근거 · 비용 · 환경만으로 6 이라 문턱이 일하지 않는다', () => {
  const r = select([entry('nice', 6, 0), entry('weak', 7, 1), entry('real', 5, 2)], { threshold: 5, near: 2 });
  assert.deepEqual(r.items.map((i) => i.id), ['real']);
  assert.deepEqual(r.nearMiss.map((i) => i.id), ['weak']);
});

test('아깝게 빠진 것은 관련성 1 이상만 — 관련성 0 이 자리를 채우지 않게', () => {
  const r = select([entry('zero', 6, 0), entry('one', 3, 1)], { threshold: 5, near: 3 });
  assert.deepEqual(r.nearMiss.map((i) => i.id), ['one']);
});

test('seen — 추천 · 아깝게 빠진 것 밖의 나머지 전부를 점수 · 이유와 함께', () => {
  const es = [entry('a', 9), entry('b', 8), entry('c', 4), entry('z', 6, 0)].map((e) => ({ ...e, reasons: { relevance: e.id } }));
  const r = select(es, { threshold: 5, cap: 1, near: 1 });
  assert.deepEqual(r.items.map((i) => i.id), ['a']);
  assert.deepEqual(r.nearMiss.map((i) => i.id), ['c']);
  assert.deepEqual(r.seen.map((i) => [i.id, i.total, i.reasons.relevance]), [['b', 8, 'b'], ['z', 6, 'z']]);
});

test('digest — 근거 · 비용 · 보안이 소식지 값과 다르면 id 와 함께 실패', () => {
  const digest = { date: '2026-11-16', url: 'u', candidates: [{ id: 'a', evidence: 2, cost: 2, security: false }, { id: 's', evidence: 0, cost: 0, security: '설정을 바꾼다' }] };
  const a = entry('a', 7, 4);
  assert.throws(() => select([a, entry('s', 4)], { digest }), /a: .*cost/);
  const ok = [{ ...a, scores: { ...a.scores, evidence: 2, cost: 2 } }, { ...entry('s', 4), scores: { ...entry('s', 4).scores, security: true } }];
  assert.doesNotThrow(() => select(ok, { digest }));
  assert.throws(() => select([ok[0], entry('s', 4)], { digest }), /s: .*security/);
  assert.doesNotThrow(() => select([ok[0], ok[1], entry('mine', 5)], { digest }), '개인 원천 항목은 소식지에 없다');
});

test('expect 가 어긋나면 소식지 후보 중 빠진 id 를 보여 준다', () => {
  const digest = { candidates: [{ id: 'a', evidence: 2, cost: 2, security: false }, { id: 'gone', evidence: 0, cost: 0, security: false }] };
  const a = entry('a', 8, 4);
  assert.throws(() => select([a], { digest, expect: 2 }), /gone/);
});

test('rescore — 첫 select 뒤 점수를 바꾸면 이유가 있어야 하고, 전 · 후를 남긴다', () => {
  const first = { ...select([entry('a', 7, 1), entry('b', 4)], { threshold: 5 }), rescored: [] };
  const changed = { ...entry('a', 6, 0) };
  assert.throws(() => select([changed, entry('b', 4)], { prev: first }), /a: .*rescore/);
  const r = select([{ ...changed, rescore: 'SDK 훅이라 무관' }, entry('b', 4)], { prev: first });
  assert.deepEqual(r.rescored.map((x) => [x.id, x.before.total, x.after.total, x.reason]), [['a', 7, 6, 'SDK 훅이라 무관']]);
  const again = select([{ ...changed, rescore: 'SDK 훅이라 무관' }, entry('b', 4)], { prev: { ...r } });
  assert.equal(again.rescored.length, 1, '바뀌지 않은 재실행은 재채점을 더하지 않는다');
});

test('expect — 항목 수가 다르면 받은 수와 함께 실패 (후보를 묶거나 빠뜨리지 않게)', () => {
  assert.throws(() => select([entry('a', 9)], { expect: 2 }), /받은 수 1/);
  assert.throws(() => select([entry('a', 9)], { expect: NaN }), /expect/);
  assert.doesNotThrow(() => select([entry('a', 9)], { expect: 1 }));
  assert.doesNotThrow(() => select([entry('a', 9)]));
});

test('select.mjs — --expect · --digest · --out 이 없으면 usage 와 exit 2, 성공해야 --out 이 생긴다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const [file, digest, out] = ['scores.json', 'digest.json', 'report.json'].map((f) => join(dir, f));
  writeFileSync(file, JSON.stringify([entry('a', 9)]));
  writeFileSync(digest, JSON.stringify({ date: '2026-11-16', url: 'https://x/digest/2026-11-16.md', candidates: [] }));
  const run = (...args) => spawnSync(process.execPath, ['tools/select.mjs', file, '--date', '2026-11-16', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  const none = run('--digest', digest, '--out', out);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /--expect N/);
  assert.equal(run('--expect', '1', '--out', out).status, 2);
  assert.equal(run('--expect', '1', '--digest', digest).status, 2);
  assert.equal(run('--expect', '2', '--digest', digest, '--out', out).status, 1);
  assert.equal(existsSync(out), false, '실패하면 보고서가 생기지 않는다');
  const stale = spawnSync(process.execPath, ['tools/select.mjs', file, '--date', '2026-11-24', '--expect', '1', '--digest', digest, '--out', out], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(stale.status, 1, '지난주 소식지로 추천하지 않는다');
  assert.match(stale.stderr, /이번 주\(2026-11-23\)/);
  assert.equal(run('--expect', '1', '--digest', digest, '--out', out).status, 0);
  const r = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual([r.date, r.issue, r.expect, r.digest], ['2026-11-16', null, 1, { date: '2026-11-16', url: 'https://x/digest/2026-11-16.md' }]);
  assert.deepEqual([r.items.length, r.seen.length, r.rescored.length], [1, 0, 0]);
});

test('select.mjs — --out 이 이미 있으면 첫 결과로 보고, 이유 없는 점수 변경을 거부한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const [file, digest, out] = ['scores.json', 'digest.json', 'report.json'].map((f) => join(dir, f));
  writeFileSync(digest, JSON.stringify({ date: '2026-11-16', url: 'u', candidates: [] }));
  const run = () => spawnSync(process.execPath, ['tools/select.mjs', file, '--date', '2026-11-16', '--expect', '1', '--digest', digest, '--out', out], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  writeFileSync(file, JSON.stringify([entry('a', 7, 1)]));
  assert.equal(run().status, 0);
  writeFileSync(file, JSON.stringify([entry('a', 6, 0)]));
  const bad = run();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /rescore/);
  writeFileSync(file, JSON.stringify([{ ...entry('a', 6, 0), rescore: '이유' }]));
  assert.equal(run().status, 0);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).rescored.map((x) => [x.before.total, x.after.total]), [[7, 6]]);
});
