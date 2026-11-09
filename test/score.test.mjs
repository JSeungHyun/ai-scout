import { test } from 'node:test';
import assert from 'node:assert/strict';
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
