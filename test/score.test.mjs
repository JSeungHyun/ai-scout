import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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

test('관련성 0(있으면 좋다)은 합계가 문턱을 넘어도 추천에 오르지 않는다', () => {
  const r = select([entry('nice', 6, 0), entry('real', 5, 2)], { threshold: 5, near: 2 });
  assert.deepEqual(r.items.map((i) => i.id), ['real']);
  assert.deepEqual(r.nearMiss.map((i) => i.id), ['nice']);
});

test('expect — 항목 수가 다르면 받은 수와 함께 실패 (후보를 묶거나 빠뜨리지 않게)', () => {
  assert.throws(() => select([entry('a', 9)], { expect: 2 }), /받은 수 1/);
  assert.throws(() => select([entry('a', 9)], { expect: NaN }), /expect/);
  assert.doesNotThrow(() => select([entry('a', 9)], { expect: 1 }));
  assert.doesNotThrow(() => select([entry('a', 9)]));
});

test('select.mjs — --expect 가 없으면 usage 와 exit 2 (루틴이 빠뜨려 검사가 꺼지지 않게)', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'scout-')), 'scores.json');
  writeFileSync(file, JSON.stringify([entry('a', 9)]));
  const run = (...args) => spawnSync(process.execPath, ['tools/select.mjs', file, '--date', '2026-11-09', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  const none = run();
  assert.equal(none.status, 2);
  assert.match(none.stderr, /--expect N/);
  assert.equal(run('--expect', '2').status, 1);
  assert.equal(run('--expect', '1').status, 0);
});
