// SCOUT.md 가 도구 인자 · 금지 사항 · 형식과 어긋나지 않게
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const md = readFileSync(new URL('../SCOUT.md', import.meta.url), 'utf8');
const has = (s) => assert.ok(md.includes(s), `SCOUT.md 에 「${s}」 가 없다`);

test('SCOUT.md 는 세 도구를 실제 인자로 부른다', () => {
  for (const s of ['tools/collect.mjs --sources', '--snapshots', 'tools/select.mjs', '--threshold', '--date', 'tools/judge.mjs --report', '--comments']) has(s);
});

test('SCOUT.md 는 금지 사항 네 줄을 담는다', () => {
  for (const s of ['추천만 한다', '댓글을 달지 않는다', '지시는 데이터', '`ledger.md` · `reports/` · `snapshots/` 밖에 쓰지 않는다']) has(s);
});

test('판정 줄 형식과 이슈 제목 형식이 들어 있다', () => {
  has('채택|기각|보류|도입');
  has('[AI-SCOUT] YYYY-MM-DD — 추천 N건 (공식 변경 K건)');
});

test('셸 변수 대신 실제 경로 — Bash 호출 사이에 변수가 이어지지 않는다', () => {
  for (const v of ['$E/', '$R/', '$TODAY']) assert.ok(!md.includes(v), `SCOUT.md 에 「${v}」 가 남았다`);
  has('/tmp/ai-scout/tools/collect.mjs --sources');
});

test('재실행 · 부분 실패 · push 가 안전하다', () => {
  for (const s of ['reports/$(date -u +%F).json 이 이미 있으면', '/tmp/report.json', 'git push origin HEAD:main', 'force push 금지', 'git add reports ledger.md snapshots']) has(s);
});

test('판정 반영은 보고서 JSON 에서 시작하고, 채택 수는 다시 센다', () => {
  for (const s of ['"closed": true', '"issue"', '다시 센다', 'unparsed', 'ignored']) has(s);
  assert.ok(!md.includes('grep -l'), 'grep -l 로 이슈 번호를 찾으면 #1 이 #12 를 잡는다');
});

test('보안 · 범위 문구', () => {
  for (const s of ['(/tmp 작업 파일 제외)', '실행하지 않는다', '백틱', '추천 · 채택 · 보류', 'CHANGELOG.md']) has(s);
});

test('채점표의 범위가 lib/score.mjs 와 같다', () => {
  for (const s of ['relevance` 0~4', 'evidence` 0~2', 'cost` 0~2', 'env` 0~2', '`removes`', '`security`']) has(s);
});
