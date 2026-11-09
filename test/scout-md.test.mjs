// SCOUT.md 가 도구 인자 · 금지 사항 · 형식과 어긋나지 않게
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const md = readFileSync(new URL('../SCOUT.md', import.meta.url), 'utf8');
const ledger = readFileSync(new URL('../ledger.md', import.meta.url), 'utf8');
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

test('첫 실행(11-09)에서 빠진 단계 — 후보 읽기 · 웹 검색 · 0건 알림 · 관련성 0', () => {
  for (const s of ['채점 전에 후보마다 원본을 읽는다', '「내용 미확인」으로 점수를 매기지 않는다', '웹 검색을 1~3회', '0건이어도 보낸다', '관련성 0 은 추천에 오르지 않는다']) has(s);
});

test('재시험(v0.1.1)에서 빠진 것 — 웹 검색은 5 의 원본 읽기 바로 앞 · M 은 발견 수', () => {
  for (const s of ['검색 발견도 scores.json 에 넣는다', '/tmp/web.md', '웹 **발견** 수(검색 횟수가 아니다)']) has(s);
  // §3 끝에 두면 select 뒤로 밀린다(v0.1.1 로그: select 06:04:40 → 검색 06:04:46)
  const [score, web, read] = ['## 5. 채점', '웹 검색을 1~3회', '**채점 전에 후보마다 원본을 읽는다**'].map((s) => md.indexOf(s));
  assert.ok(score < web && web < read, '웹 검색 문장은 §5 안, 원본 읽기 앞에 있어야 한다');
});

test('재시험(v0.1.1)에서 빠진 것 — README 는 저장소마다 따로 · M 의 collect 몫은 출력 그대로', () => {
  for (const s of ['저장소마다 따로 출력한다', '한 번의 for 루프로 몰아 읽지 않는다', '출력이 잘리면 나눠 다시 읽는다', '`새것 N` 의 합', '`node -e` 로 다시 세지 않는다']) has(s);
});

test('재시험(v0.1.1)에서 빠진 것 — 알림의 보고서 링크는 절대 주소 · 첫 줄은 템플릿 그대로', () => {
  for (const s of [String.raw`$(git remote get-url origin | sed 's/\.git$//')/blob/main/reports/$(date -u +%F).md`, '첫 줄은 템플릿 그대로']) has(s);
});

test('재시험(v0.1.1)에서 빠진 것 — README 는 배지 · HTML 을 걸러 읽고 OS 언급은 grep 으로', () => {
  for (const s of [String.raw`grep -vE '^\s*<|!\[' | head -80`, "grep -niE 'windows|winget|powershell|wsl|macos|linux' | head -5", '걸린 행(번호 포함)', 'README 에 OS 언급 없음']) has(s);
  assert.ok(!md.includes('head -60'), 'README 첫 60행은 배지 · HTML 뿐일 수 있다');
});

test('재시험(v0.1.1)에서 빠진 것 — 후보 전부 채점 · 인접은 요약만 · --expect', () => {
  for (const s of ['**후보 전부**', '묶지 않는다', '인접 원천(`group: 인접`)', '**채점하지 않는다**', '--expect', 'M − 장부로 뺀 수 − 인접 수']) has(s);
});

test('재시험(v0.1.1)에서 빠진 것 — md 점수는 JSON total · 본 것은 한 줄씩 · ⚠️ 는 묶음 줄에도', () => {
  for (const s of ['JSON 의 `total` 을 그대로', 'scores.json 의 나머지를 한 줄씩', '묶음 줄에서도']) has(s);
});

test('재시험(v0.1.1)에서 빠진 것 — 「미확인」은 CHANGELOG HTTP 코드가 200 이 아닐 때만', () => {
  for (const s of ["-o /tmp/cl.md -w '%{http_code}'", '200 이 아닐 때만']) has(s);
});

test('원천 정리에서 인접 원천은 뺀다 — 채점하지 않으니 매번 추천 0건이다', () => {
  has('4주 동안 추천 0건 · 개념 0건인 원천(인접 원천 제외)');
});

test('이슈 본문의 보고서 링크도 알림과 같은 절대 주소', () => {
  for (const s of ['보고서: <보고서 링크>', '이슈의 `<보고서 링크>` 도 8 과 같은 절대 주소']) has(s);
  assert.ok(!md.includes('<reports/YYYY-MM-DD.md 링크>'), '상대 경로는 이슈에서 열리지 않는다');
});

test('개념 칸(11-09) — 보고서 절 · 개념 검색 · 하네스 층 · 추천 아님', () => {
  for (const s of ['## 이번 주 개념 (C건)', '**개념 검색**', '**우리 하네스의 어느 층인가**', '⛔ **개념은 추천이 아니다**', '「원문 미확인」', '「자체 주장」']) has(s);
});

test('개념은 채점 · 판정과 섞지 않는다 — M · --expect · 이슈 번호', () => {
  // 개념 발견이 /tmp/web.md 에 들어가면 M 이 늘어 --expect 가 어긋난다
  for (const s of ['`/tmp/web.md` 에 적지 않는다', '`select.mjs` 에 넣지 않고', '번호를 도구 추천과 섞지 않는다']) has(s);
});

test('알림 첫 줄 두 템플릿 모두 뒤에 개념 수', () => {
  for (const s of ['<이슈 링크> · 개념 C건`', '<보고서 링크> · 개념 C건`']) has(s);
});

test('장부에 「개념」 표가 있다 — 같은 용어를 다시 올리지 않게', () => {
  for (const s of ['## 개념', '| 용어 | 층 | 처음 본 날 | 원문 | 근거 등급 | 메모 |']) assert.ok(ledger.includes(s), `ledger.md 에 「${s}」 가 없다`);
});
