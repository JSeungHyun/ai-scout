import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { select } from '../lib/score.mjs';
import { renderReport } from '../lib/report.mjs';

const e = (id, [relevance, evidence, cost, env], o = {}) => ({
  id, name: id.toUpperCase(), kind: '도구', source: 'gh-topic', url: `https://github.com/o/${id}`,
  scores: { relevance, evidence, cost, env, removes: false, security: false, ...o.scores },
  reasons: { relevance: `왜 ${id}`, evidence: 'e', cost: 'c', env: 'v', ...o.reasons },
  summary: `무엇 ${id}`, why: '왜', smallest: '작게', pretest: '시험',
});
const entries = [
  e('a', [4, 2, 2, 1]),
  e('s', [1, 2, 2, 2], { scores: { security: true }, reasons: { security: '설치가 훅을 바꾼다' } }),
  e('z', [0, 2, 2, 2]),
  e('w', [0, 2, 2, 2], { scores: { security: true } }),
];
const report = (es = entries, opts = {}) => ({ date: '2026-11-16', issue: null, threshold: 5, cap: 7, expect: es.length, digest: { date: '2026-11-16', url: 'https://x/digest/2026-11-16.md' }, ...select(es, { threshold: 5, near: 3, ...opts }) });

test('renderReport — 머리에 소식지 링크 · 추천은 total 그대로 · 점수마다 이유', () => {
  const md = renderReport(report());
  assert.match(md, /^# AI-SCOUT 2026-11-16\n> 소식지 \[2026-11-16\]\(https:\/\/x\/digest\/2026-11-16\.md\) · 채점 4개 · 문턱 5 · 상한 7\n/);
  for (const s of ['## 이번 주 추천 (1건)', '### 1. (9점) A — 무엇 a', '- 도구 · gh-topic · https://github.com/o/a', '- 점수: 관련성 4(왜 a) · 근거 2(e) · 도입 비용 2(c) · 환경 1(v)', '- 왜 나에게: 왜 · 가장 작은 도입: 작게 · 사전 시험: 시험']) assert.ok(md.includes(s), `md 에 「${s}」 가 없다`);
});

test('renderReport — 아깝게 빠진 것 · 본 것은 한 줄씩 점수와 이유, ⚠️ 는 어느 줄에서도 빠지지 않는다 (v0.1.3 은 18개를 2줄로 묶었다)', () => {
  const md = renderReport(report());
  assert.ok(md.includes('## 아깝게 빠진 것\n- (5점) S — 무엇 s · 관련성 1(왜 s) · 근거 2(e) · 도입 비용 2(c) · 환경 2(v) · ⚠️ 보안 −2(설치가 훅을 바꾼다) · https://github.com/o/s'));
  assert.ok(md.includes('## 본 것 (추천 안 함 · 2개)\n- (6점) Z — 무엇 z · 관련성 0(왜 z)'));
  assert.match(md, /- \(4점\) W — .*⚠️ 보안 −2 · https:\/\/github\.com\/o\/w/);
  assert.ok(!md.includes('## 재채점'), '재채점이 없으면 절도 없다');
});

test('renderReport — 추천 0건 · 지울 수 있음', () => {
  const md = renderReport(report([e('z', [0, 2, 2, 2]), e('r', [1, 0, 0, 2], { scores: { removes: true }, reasons: { removes: '규칙 하나' } })]));
  assert.match(md, /## 이번 주 추천 \(0건\)\n문턱 5 이상 · 관련성 2 이상인 것이 없다\./);
  assert.match(md, /- \(5점\) R — .*지울 수 있음 \+2\(규칙 하나\)/);
});

test('renderReport — 재채점 절에 전 · 후 점수와 바뀐 칸 · 이유 (select 뒤에 뒤집으면 보인다)', () => {
  const first = report([e('a', [1, 2, 2, 2])]);
  const r = report([{ ...e('a', [0, 2, 2, 2]), rescore: 'SDK 훅이라 무관' }], { prev: first });
  assert.match(renderReport(r), /## 재채점\n- A: 7점 → 6점 \(관련성 1 → 0\) — SDK 훅이라 무관\n/);
});

test('report.mjs — 점수 절 뒤에 --notes 를 붙여 stdout 으로', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const [file, notes] = ['r.json', 'notes.md'].map((f) => join(dir, f));
  writeFileSync(file, JSON.stringify(report()));
  writeFileSync(notes, '## 이번 주 개념 (0건)\n없음\n');
  const run = (...args) => spawnSync(process.execPath, ['tools/report.mjs', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(run().status, 2);
  const out = run(file, '--notes', notes);
  assert.equal(out.status, 0);
  assert.equal(out.stdout, renderReport(report(), '## 이번 주 개념 (0건)\n없음\n'));
  assert.ok(out.stdout.endsWith('## 이번 주 개념 (0건)\n없음\n'));
});
