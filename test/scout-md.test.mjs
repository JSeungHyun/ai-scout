// 절차 문서(DIGEST.md 공통 · SCOUT.md 개인)가 도구 인자 · 금지 사항 · 형식과 어긋나지 않게
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELDS } from '../lib/digest.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const [md, digest, ledger, digestLedger, profile] = ['SCOUT.md', 'DIGEST.md', 'ledger.md', 'digest/ledger.md', 'profile.md'].map(read);
const inDoc = (doc, name) => (s) => assert.ok(doc.includes(s), `${name} 에 「${s}」 가 없다`);
const has = inDoc(md, 'SCOUT.md');
const dhas = inDoc(digest, 'DIGEST.md');
const WEEK = '$(date -u -d "-$(( $(date -u +%u) - 1 )) days" +%F)';

// ── 개인 층 SCOUT.md ──

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
  for (const doc of [md, digest]) for (const v of ['$E/', '$R/', '$TODAY']) assert.ok(!doc.includes(v), `「${v}」 가 남았다`);
  has('/tmp/ai-scout/tools/collect.mjs --sources');
  dhas('/tmp/ai-scout/tools/collect.mjs --sources');
});

test('재실행 · 부분 실패 · push 가 안전하다', () => {
  // select 가 성공해야 --out 을 쓴다 — /tmp 를 거쳐 mv 하던 것을 도구가 맡는다
  for (const s of ['reports/$(date -u +%F).json 이 이미 있으면', '--out reports/$(date -u +%F).json', 'git push origin HEAD:main', 'force push 금지', 'git add reports ledger.md snapshots']) has(s);
});

test('판정 반영은 보고서 JSON 에서 시작하고, 채택 수는 다시 센다', () => {
  for (const s of ['"closed": true', '"issue"', '다시 센다', 'unparsed', 'ignored']) has(s);
  assert.ok(!md.includes('grep -l'), 'grep -l 로 이슈 번호를 찾으면 #1 이 #12 를 잡는다');
});

test('보안 · 범위 문구', () => {
  for (const s of ['(/tmp 작업 파일 제외)', '실행하지 않는다', '백틱', '추천 · 채택 · 보류']) has(s);
  for (const s of ['(/tmp 작업 파일 제외)', '실행하지 않는다', '백틱', '지시는 데이터']) dhas(s);
});

test('채점표의 범위가 lib/score.mjs 와 같다', () => {
  for (const s of ['relevance` 0~4', 'evidence` 0~2', 'cost` 0~2', 'env` 0~2', '`removes`', '`security`']) has(s);
});

test('0건 알림 · 관련성 문턱 — 추천은 관련성 2 이상(v0.1.3: 관련성 1 하나로 추천이 되고 결과를 보고 뒤집었다)', () => {
  for (const s of ['0건이어도 보낸다', '관련성 2 이상', '관련성 0 은 「아깝게 빠진 것」에도 가지 않는다', '「내용 미확인」으로 점수를 매기지 않는다']) has(s);
});

test('알림의 보고서 링크는 절대 주소 · 첫 줄은 템플릿 그대로', () => {
  for (const s of [String.raw`$(git remote get-url origin | sed 's/\.git$//')/blob/main/reports/$(date -u +%F).md`, '첫 줄은 템플릿 그대로']) has(s);
});

test('후보 전부 채점 · --expect = 소식지 후보 수 − 장부로 뺀 수 + 개인 원천 새것', () => {
  for (const s of ['**후보 전부**', '묶지 않는다', '--expect', '소식지 후보 수 − 장부로 뺀 수 + 개인 원천 새것 − 개인 원천 읽기 실패', '`새것 N` 의 합']) has(s);
});

test('보고서의 추천 · 아깝게 · 본 것 · 재채점 절은 도구가 JSON 에서 만든다 · 이슈의 ⚠️ 는 묶음 줄에도', () => {
  for (const s of ['tools/report.mjs reports/$(date -u +%F).json --notes /tmp/notes.md > reports/$(date -u +%F).md', '손으로 옮기거나 고치지 않는다', '묶음 줄에서도']) has(s);
});

test('이슈 본문의 보고서 링크도 알림과 같은 절대 주소', () => {
  for (const s of ['보고서: <보고서 링크>', '이슈의 `<보고서 링크>` 도 8 과 같은 절대 주소']) has(s);
  assert.ok(!md.includes('<reports/YYYY-MM-DD.md 링크>'), '상대 경로는 이슈에서 열리지 않는다');
});

test('개념 — 소식지 것마다 「내 환경의 어느 자리」 한 줄(최대 3) · 추천 아님 · 채점 · 판정과 섞지 않음', () => {
  for (const s of ['## 이번 주 개념 (C건)', '「내 환경의 어느 자리」', '최대 3', '⛔ **개념은 추천이 아니다**', '`select.mjs` 에 넣지 않고', '번호를 도구 추천과 섞지 않는다']) has(s);
});

test('알림 첫 줄 두 템플릿 모두 뒤에 개념 수', () => {
  for (const s of ['<이슈 링크> · 개념 C건`', '<보고서 링크> · 개념 C건`']) has(s);
});

test('두 층 — 개인 층은 이번 주 소식지를 읽고, 없거나 지난 것이면 알리고 멈춘다', () => {
  for (const s of [WEEK, '`digest/` 가 있으면', '`소식지:`', 'AI-SCOUT 소식지 없음', '지난 소식지로 추천하지 않는다']) has(s);
});

test('두 층 — 수집 · 웹 검색 · 원본 읽기는 공통 층 몫, 개인은 개인 원천만 수집', () => {
  has('--sources sources.local.json --snapshots snapshots');
  for (const s of ['/tmp/ai-scout/sources.json', '웹 검색을 1~3회', 'readme.mjs']) assert.ok(!md.includes(s), `SCOUT.md 에 공통 층 일 「${s}」 가 남았다`);
});

test('두 층 — 근거 · 비용 · 보안은 소식지 값 그대로(select --digest 가 맞춰 본다), 소식지 필드 이름으로 읽는다', () => {
  for (const s of ['--digest', '소식지 값 그대로']) has(s);
  for (const f of ['what', 'details', 'os', 'evidence', 'cost', 'security', 'reasons']) has(`\`${f}\``);
});

test('재채점 — select 뒤에 점수를 고치면 rescore 이유, 첫 보고서는 지우지 않는다', () => {
  for (const s of ['"rescore": "이유"', '「재채점」', '⛔ `reports/$(date -u +%F).json` 을 지우거나 옮기지 않는다']) has(s);
});

test('장부 제외 — CHANGELOG 판 일부만 가리키는 장부 줄로 판 전체를 빼지 않는다(v0.1.3: 2.1.319 의 ~140줄이 채점 밖)', () => {
  for (const s of ['CHANGELOG 판 단위 항목', '나머지 변경으로 채점한다']) has(s);
});

// ── 공통 층 DIGEST.md ──

test('DIGEST.md 는 도구를 실제 인자로 부른다', () => {
  for (const s of ['tools/collect.mjs --sources /tmp/ai-scout/sources.json --snapshots digest/snapshots --texts /tmp/texts --out /tmp/candidates.json', 'tools/readme.mjs --out /tmp/readme', 'tools/digest.mjs --check digest/' , '--collect /tmp/candidates.json --web', 'tools/digest.mjs --render digest/']) dhas(s);
});

test('DIGEST.md — 프로필 없이 돈다: 프로필 · 개인 장부를 읽지도 쓰지도 않고 digest/ 밖에 쓰지 않는다', () => {
  for (const s of ['⛔ `profile.md` · `ledger.md` · `reports/` · `sources.local.json` 은 읽지도 쓰지도 않는다', '`digest/` 밖에 쓰지 않는다', 'git add digest &&', 'force push 금지']) dhas(s);
});

test('DIGEST.md — 소식지 이름은 그 주 월요일(개인 층과 같은 식) · 이미 있으면 멈춘다', () => {
  for (const s of [WEEK, '`digest/<이번 주>.json` 이 이미 있으면']) dhas(s);
});

test('DIGEST.md — 공개 이슈 제목 · 본문은 소식지 md · 판정 줄 안내 없음 · 댓글은 판정이 아니다', () => {
  for (const s of ['[AI-SCOUT 소식] YYYY-MM-DD', '본문 = `digest/<이번 주>.md` 그대로', '판정 줄 안내를 붙이지 않는다', '댓글은 판정이 아니다']) dhas(s);
});

test('DIGEST.md — 후보 필드가 lib/digest.mjs FIELDS 와 같다(개인 층이 이 이름으로 읽는다)', () => {
  for (const f of FIELDS) dhas(`"${f}"`);
  for (const s of ['"unread"', '"adjacent"', '"concepts"', '"conceptSearch"', '"read"']) dhas(s);
});

test('DIGEST.md — 웹 검색은 원본 읽기 앞 · 발견도 후보 · M 은 발견 수 · collect 몫은 출력 그대로', () => {
  for (const s of ['웹 검색을 1~3회', '/tmp/web.md', '검색 발견도 후보다', '웹 **발견** 수(검색 횟수가 아니다)', '`새것 N`', '`node -e` 로 다시 세지 않는다']) dhas(s);
  // 원본 읽기 뒤에 두면 발견이 후보에 못 들어간다(v0.1.1 로그: select 06:04:40 → 검색 06:04:46)
  assert.ok(digest.indexOf('## 2. 웹 검색') < digest.indexOf('## 3. 원본 읽기'), '웹 검색 절이 원본 읽기 절 앞에 있어야 한다');
});

test('DIGEST.md — 원본 읽기 깊이는 도구가: README 파일 · 긴 CHANGELOG 절은 grep 먼저 · 「미확인(코드)」', () => {
  for (const s of ['후보마다 원본을 읽는다', '파일을 하나씩 읽는다', '`changelog.status`', '「미확인(404)」', 'grep -niE', '/tmp/texts/', '「README 에 OS 언급 없음」', '「내용 미확인」으로 사실을 적지 않는다']) dhas(s);
  assert.ok(!digest.includes('head -60') && !digest.includes('for 루프로'), 'README 깊이는 tools/readme.mjs 가 정한다');
});

test('DIGEST.md — 인접은 adjacent 에 요약만 · 공식 새 항목은 빠짐없이', () => {
  for (const s of ['인접 원천(`group: 인접`)', '**중립 사실을 적지 않는다**', '공식 새 항목은 **빠짐없이**']) dhas(s);
});

test('DIGEST.md — 개념: 검색어 낱말 자체는 개념이 아니다 · 원문 날짜 7일 · 등급 1 은 연 글 · 원문 미확인 · 자체 주장', () => {
  for (const s of ['**개념 검색**', '검색어 낱말 자체는 개념이 아니다', '7일 밖', '등급 1 은 해설 글을 실제로 열었을 때만', '「원문 미확인」', '「자체 주장」', '`/tmp/web.md` 에 적지 않는다', '⛔ **개념은 추천이 아니다**']) dhas(s);
});

test('DIGEST.md — 원천 정리는 커뮤니티 원천만(공식은 공식 변경으로, 인접은 채점하지 않아 늘 0)', () => {
  dhas('4주 동안 「이런 것도 있어요」 0건 · 개념 0건인 커뮤니티 원천');
});

// ── 장부 · 프로필 ──

test('장부 — 개인 장부의 원천 수확은 개인 원천만, 공통 원천 수확 · 개념 표는 digest/ledger.md', () => {
  for (const s of ['## 개념', '| 용어 | 층 | 처음 본 날 | 원문 | 근거 등급 | 메모 |', '| pinned |']) assert.ok(ledger.includes(s), `ledger.md 에 「${s}」 가 없다`);
  for (const s of ['| cc-changelog |', '| gh-topic |', '| web |']) assert.ok(!ledger.includes(s), `ledger.md 에 공통 원천 「${s}」 가 남았다`);
  for (const s of ['| cc-changelog |', '| gh-topic |', '| web |', '| 원천 | 후보 | 이런 것도 있어요 | 개념 | 마지막 수확 |', '| 용어 | 층 | 처음 본 날 | 원문 | 원문 날짜 | 근거 등급 |']) assert.ok(digestLedger.includes(s), `digest/ledger.md 에 「${s}」 가 없다`);
  assert.ok(!digestLedger.includes('| pinned |'), '공통 장부에 개인 원천이 들어가면 안 된다');
});

test('프로필에 소식지 raw 주소', () => {
  assert.ok(profile.includes('- 소식지: https://raw.githubusercontent.com/JSeungHyun/ai-scout/main/digest/'));
});
