import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIELDS, checkDigest, issueBody, picks, renderDigest } from '../lib/digest.mjs';

const collected = { sources: [
  { id: 'cc-changelog', group: '공식', ok: true, newItems: [{ id: '2.1.320', title: '2.1.320', text: '- Windows: 고침' }] },
  { id: 'agent-sdk-ts', group: '공식', ok: true, newItems: [{ id: 'v0.3.320', title: 'v0.3.320', changelog: { url: 'https://raw.githubusercontent.com/a/s/v0.3.320/CHANGELOG.md', status: 404 } }] },
  { id: 'gh-topic', group: '커뮤니티', ok: true, newItems: [{ id: 'o/tool', title: 'o/tool' }] },
  { id: 'codex', group: '인접', ok: true, newItems: [{ id: 'rust-v0.168.0', title: 'rust-v0.168.0' }] },
  { id: 'npm', group: '커뮤니티', ok: false, newItems: [], error: 'curl: (28) timed out' },
] };
const cand = (o) => ({ kind: '도구', what: '무엇 한 줄', details: ['원본에서 읽은 것'], os: '공식 — 세 OS', evidence: 2, cost: 2, reach: 2, security: false, reasons: { evidence: '원본 저장소', cost: '플러그인 하나', reach: '누구나' }, ...o });
const good = () => ({
  date: '2026-11-16', engine: 'v0.2.0', url: 'https://github.com/o/ai-scout/blob/main/digest/2026-11-16.md', issue: null,
  sources: { total: 5, failed: [{ id: 'npm', error: 'curl: (28) timed out' }] },
  conceptSearch: 'harness engineering agent loop',
  candidates: [
    cand({ id: '2.1.320', name: 'Claude Code 2.1.320', source: 'cc-changelog', group: '공식', kind: '변경', url: 'https://code.claude.com/docs/en/changelog', os: 'CHANGELOG: Windows 수정 1줄' }),
    cand({ id: 'o/tool', name: 'tool', source: 'gh-topic', group: '커뮤니티', url: 'https://github.com/o/tool', os: '12: Works on Windows · 13: macOS', cost: 1, details: ['5: 원본에서 읽은 것'] }),
    cand({ id: 'web-thing', name: 'web thing', source: 'web', group: 'web', url: 'https://example.com/x', evidence: 1, reach: 1, security: '설치가 훅을 바꾼다' }),
  ],
  unread: [{ id: 'v0.3.320', name: 'Agent SDK TS v0.3.320', source: 'agent-sdk-ts', group: '공식', url: 'https://github.com/a/s/releases/tag/v0.3.320', reason: 'CHANGELOG 미확인(404)' }],
  adjacent: [{ id: 'rust-v0.168.0', source: 'codex', what: '새 판' }],
  concepts: [{ term: 'guide 와 sensor', definition: '앞에서 막는 것과 뒤에서 재는 것', origin: '해설 블로그', url: 'https://origin.example/x', date: '2026-11-12', layer: '하네스', grade: 1, read: 'https://explainer.example/x' }],
});
// tools/readme.mjs 를 거친 저장소의 보안 행 수(securityCount 와 같은 꼴) — 안 거쳤으면 null
const readme = (repo) => ({ 'o/tool': 0 })[repo] ?? null;
const check = (d, web = 1, rd = readme) => checkDigest(d, collected, web, rd);
const errs = (mut, web, rd) => { const d = good(); mut(d); return check(d, web, rd).join('\n'); };

test('checkDigest — 맞는 소식지는 오류가 없다', () => {
  assert.deepEqual(check(good()), []);
});

test('FIELDS — 개인 층이 읽는 후보 필드 이름 (바꾸면 SCOUT.md 와 개인 층이 깨진다)', () => {
  assert.deepEqual(FIELDS, ['id', 'name', 'source', 'group', 'kind', 'url', 'what', 'details', 'os', 'evidence', 'cost', 'reach', 'security', 'reasons']);
});

test('필수 필드 · 범위 — 어느 후보인지 id 와 함께', () => {
  assert.match(errs((d) => { d.candidates[0].evidence = 3; }), /2\.1\.320: evidence 는 0~2/);
  assert.match(errs((d) => { d.candidates[1].details = []; }), /o\/tool: details/);
  assert.match(errs((d) => { d.candidates[1].security = ''; }), /o\/tool: security/);
  assert.match(errs((d) => { d.candidates[0].kind = '구조'; }), /2\.1\.320: kind/);
  assert.match(errs((d) => { delete d.candidates[2].reasons.reach; }), /web-thing: reasons\.reach/);
  assert.match(errs((d) => { delete d.candidates; }), /candidates/);
});

test('후보 = 수집 새것(인접 제외) + 웹 발견 — 빠진 것 · 남는 것 · 원천 묶음 · 웹 수', () => {
  assert.match(errs((d) => { d.candidates.splice(1, 1); }), /gh-topic: .*빠졌다.*o\/tool/);
  assert.match(errs((d) => { d.candidates.push(cand({ id: 'o/other', name: 'other', source: 'gh-topic', group: '커뮤니티', url: 'https://x' })); }), /gh-topic: .*o\/other/);
  assert.match(errs((d) => { d.candidates[0].group = '커뮤니티'; }), /2\.1\.320: group 은 공식/);
  assert.match(errs(() => {}, 2), /웹 발견이 2개여야 한다 \(받은 수 1\)/);
  assert.match(errs((d) => { d.candidates.push({ ...d.candidates[1] }); }), /o\/tool: id 가 겹친다/);
});

test('인접은 adjacent 에만, 수집 실패는 sources 에 — 수집 결과와 같아야', () => {
  assert.match(errs((d) => { d.adjacent = []; }), /인접.*rust-v0\.168\.0/);
  assert.match(errs((d) => { d.sources.failed = []; }), /수집 실패.*npm/);
  assert.match(errs((d) => { d.sources.total = 4; }), /원천 5곳/);
});

test('GitHub 저장소 후보의 OS 근거는 README 행 번호나 「OS 언급 없음」 (v0.1.3 은 상투문 「README OS 언급 확인」)', () => {
  assert.match(errs((d) => { d.candidates[1].os = 'README OS 언급 확인'; }), /o\/tool: .*행 번호/);
  assert.deepEqual(check({ ...good(), candidates: good().candidates.map((c) => (c.id === 'o/tool' ? { ...c, os: 'README 에 OS 언급 없음' } : c)) }), []);
});

test('GitHub 후보의 details 한 줄 이상은 README 행 번호를 인용 (11-09: 「하나씩 읽는다」를 루프로 몰아 8줄만 읽었다)', () => {
  assert.match(errs((d) => { d.candidates[1].details = ['원본에서 읽은 것']; }), /o\/tool: details .*README 행 번호/);
  assert.doesNotMatch(errs((d) => { d.candidates[2].details = ['행 번호 없음']; }), /web-thing: details/, 'GitHub 저장소가 아니면 묻지 않는다');
});

test('GitHub 후보는 tools/readme.mjs 를 거쳐야 하고, 보안 행이 있는데 ⚠️ 가 없으면 reasons.security (11-09: 훅 · 텔레메트리 ⚠️ 누락 2건)', () => {
  assert.match(errs(() => {}, 1, () => null), /o\/tool: README 파일이 없다/);
  const two = () => 2;
  assert.match(errs(() => {}, 1, two), /o\/tool: README 보안 행 2개 .*reasons\.security/);
  assert.deepEqual(check({ ...good(), candidates: good().candidates.map((c) => (c.id === 'o/tool' ? { ...c, reasons: { ...c.reasons, security: '훅 행은 제거 방법 안내뿐' } } : c)) }, 1, two), []);
  assert.deepEqual(check({ ...good(), candidates: good().candidates.map((c) => (c.id === 'o/tool' ? { ...c, security: '설치가 훅을 건다' } : c)) }, 1, two), []);
});

test('같은 reasons 문장이 커뮤니티 후보 절반 이상이면 거부 (11-09: 헬퍼가 점수를 문구로 — evidence 20/20 같은 문장)', () => {
  const more = (reach) => (d) => reach.forEach((r, i) => d.candidates.push(cand({ id: `o/t${i}`, name: `t${i}`, source: 'gh-topic', group: '커뮤니티', url: `https://example.com/t${i}`, reasons: { evidence: `근거 ${i}`, cost: `비용 ${i}`, reach: r } })));
  // o/tool 의 reach 「누구나」와 합쳐 4개 중 2개
  assert.match(errs(more(['누구나', 'b', 'c'])), /reasons\.reach 「누구나」 가 커뮤니티 후보 2\/4개에 같다/);
  assert.doesNotMatch(errs(more(['누구나', 'b', 'c', 'e'])), /reasons\.reach/, '5개 중 2개는 절반 미만');
  assert.doesNotMatch(errs(() => {}), /커뮤니티 후보/, '공식 · web 후보와 같은 문장은 세지 않는다');
});

test('CHANGELOG 후보 details 의 백틱 낱말은 그 판 절 본문에 있어야 (11-09: 2.1.318 의 `assume_role` 을 2.1.317 에)', () => {
  assert.match(errs((d) => { d.candidates[0].details = ['`assume_role` 추가']; }), /2\.1\.320: details 의 `assume_role` 이 이 판 절 본문에 없다/);
  assert.deepEqual(check({ ...good(), candidates: good().candidates.map((c) => (c.id === '2.1.320' ? { ...c, details: ['`Windows` 고침'] } : c)) }), []);
});

test('본문을 받은 수집 항목은 읽기 실패로 넘기지 않고, CHANGELOG 가 200 이 아니면 「미확인(코드)」', () => {
  assert.match(errs((d) => { d.unread.push({ id: '2.1.320', name: 'x', source: 'cc-changelog', reason: '길다' }); d.candidates.shift(); }), /2\.1\.320: 본문을 받았다/);
  assert.match(errs((d) => { d.unread[0].reason = '판올림'; }), /v0\.3\.320: .*미확인\(404\)/);
});

test('CHANGELOG 200 인데 그 판 절이 없으면 reason 에 「미확인(200 · 절 없음)」 (codex 실측: 200 + 빈 본문)', () => {
  const noSection = structuredClone(collected);
  noSection.sources[1].newItems[0].changelog.status = '200 · 절 없음';
  assert.match(checkDigest(good(), noSection, 1, readme).join('\n'), /v0\.3\.320: .*「미확인\(200 · 절 없음\)」/);
  const d = good();
  d.unread[0].reason = 'CHANGELOG 미확인(200 · 절 없음)';
  assert.deepEqual(checkDigest(d, noSection, 1, readme), []);
});

test('unread 도 group — 못 읽은 공식 항목이 「이번 주 공식 변경」에서 빠지지 않게', () => {
  assert.match(errs((d) => { delete d.unread[0].group; }), /v0\.3\.320: group 은 공식/);
});

test('date 는 그 주 월요일(개인 층이 이 이름으로 찾는다) · url 은 그 날짜 md', () => {
  assert.match(errs((d) => { d.date = '2026-11-17'; }), /월요일/);
  assert.match(errs((d) => { d.url = 'digest/2026-11-16.md'; }), /url/);
});

test('개념 — 최대 3 · 원문 날짜 7일 안 · 층 · 등급 1 은 연 글 · 등급 2 는 원문 · 검색어 낱말 자체는 개념이 아니다', () => {
  assert.match(errs((d) => { d.concepts = Array(4).fill(d.concepts[0]).map((k, i) => ({ ...k, term: `t${i}` })); }), /최대 3/);
  assert.match(errs((d) => { d.concepts[0].date = '2026-02-17'; }), /7일/);
  assert.match(errs((d) => { d.concepts[0].layer = '기타'; }), /layer/);
  assert.match(errs((d) => { delete d.concepts[0].read; }), /등급 1.*read/);
  assert.match(errs((d) => { d.concepts[0].grade = 2; }), /등급 2.*원문/);
  assert.match(errs((d) => { d.concepts[0].term = 'Harness Engineering'; }), /검색어/);
  assert.deepEqual(check({ ...good(), concepts: [{ ...good().concepts[0], grade: 0, read: '' }] }), []);
});

test('picks(「이런 것도 있어요」) — 도구만, 근거 + 비용 + 범용성 − 보안 2 순으로 상위 3, 합 4 미만은 올리지 않는다', () => {
  const c = (id, e, k, r, o = {}) => ({ id, kind: '도구', evidence: e, cost: k, reach: r, security: false, ...o });
  const cs = [c('change', 2, 2, 2, { kind: '변경' }), c('low', 1, 1, 1), c('mid', 2, 1, 1), c('top', 2, 2, 2), c('risky', 2, 2, 2, { security: '훅' }), c('tie', 2, 1, 1), c('late', 2, 1, 1)];
  assert.deepEqual(picks(cs).map((x) => x.id), ['top', 'mid', 'risky']);
});

test('renderDigest — 머리 숫자 · 절 · ⚠️ · 판정 줄 안내 없음', () => {
  const md = renderDigest(good());
  assert.match(md, /^# AI-SCOUT 소식 2026-11-16\n/);
  assert.match(md, /> 원천 5곳\(실패 1곳\) · 후보 3개\(읽기 실패 1개\) · 공식 변경 2건 · 개념 1건 · 엔진 v0\.2\.0/);
  // 못 읽은 공식 항목도 한 줄 — 머리 줄 K(개인 층이 읽는 수)와 같은 기준(v0.2.0 모의: cc-action 404 가 빠져 하나 모자랐다)
  assert.match(md, /## 이번 주 공식 변경 \(2건\)\n- Claude Code 2\.1\.320 — .*\n- Agent SDK TS v0\.3\.320 \(agent-sdk-ts\) — CHANGELOG 미확인\(404\) · https:\/\/github\.com\/a\/s\/releases\/tag\/v0\.3\.320\n/);
  for (const s of ['## 이런 것도 있어요 (1건)', '## 이번 주 개념 (1건)', '- 인접: rust-v0.168.0(codex) — 새 판', '## 후보 전체 (3개)', '## 읽기 실패 (1개)', '- npm — curl: (28) timed out', '⚠️ 설치가 훅을 바꾼다', '12: Works on Windows', '  - 원본에서 읽은 것']) assert.ok(md.includes(s), `md 에 「${s}」 가 없다`);
  assert.match(md, /\*\*guide 와 sensor\*\* — 앞에서 막는 것과 뒤에서 재는 것 · 처음 말한 쪽 \[해설 블로그\]\(https:\/\/origin\.example\/x\) 2026-11-12 · 층 하네스 · 근거 등급 1/);
  assert.ok(!/채택|기각|판정/.test(md), '소식지는 판정 대상이 아니다');
});

test('renderDigest — 개념 0건이면 검색어, 등급 0 은 ⚠️', () => {
  assert.match(renderDigest({ ...good(), concepts: [] }), /## 이번 주 개념 \(0건\)\n없음 — 개념 검색: harness engineering agent loop/);
  assert.match(renderDigest({ ...good(), concepts: [{ ...good().concepts[0], grade: 0 }] }), /근거 등급 0 ⚠️/);
});

test('issueBody — 이슈 본문은 md 그대로, GitHub 한도 65,536자를 넘을 때만 「후보 전체」를 링크로 (11-09: 15K자 md 를 「22KB 라서」 1.7K자 손 요약으로)', () => {
  assert.equal(issueBody(good()), renderDigest(good()));
  const big = good();
  big.candidates[1].details.push('x'.repeat(70000));
  const body = issueBody(big);
  assert.ok(body.length <= 65536, `본문 ${body.length}자`);
  assert.match(body, /## 후보 전체 \(3개\)\n전체는 소식지 md 에 — https:\/\/github\.com\/o\/ai-scout\/blob\/main\/digest\/2026-11-16\.md\n/);
  for (const s of ['## 이런 것도 있어요', '## 이번 주 공식 변경', '## 읽기 실패 (1개)', '## 수집 실패']) assert.ok(body.includes(s), `「${s}」 가 없다`);
});

test('digest.mjs — --check 는 오류마다 한 줄과 exit 1, 통과하면 요약과 exit 0 · --render · --issue 는 stdout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const [file, col, rd] = ['d.json', 'c.json', 'readme'].map((f) => join(dir, f));
  writeFileSync(file, JSON.stringify(good()));
  writeFileSync(col, JSON.stringify(collected));
  mkdirSync(rd);
  writeFileSync(join(rd, 'o__tool.md'), '# o/tool README\n\n1: # tool\n\n## 보안 행 0개 (원본 행 번호 · 플러그인 훅)\nREADME 에 보안 행 없음\n');
  const run = (...args) => spawnSync(process.execPath, ['tools/digest.mjs', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(run('--check', file, '--collect', col, '--readme', rd).status, 2, '--web 을 빠뜨리면 검사가 꺼지지 않게 usage');
  assert.equal(run('--check', file, '--collect', col, '--web', '1').status, 2, '--readme 를 빠뜨리면 보안 행 검사가 꺼지지 않게 usage');
  const bad = run('--check', file, '--collect', col, '--web', '2', '--readme', rd);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /웹 발견이 2개여야 한다/);
  const ok = run('--check', file, '--collect', col, '--web', '1', '--readme', rd);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /통과 · 후보 3개/);
  const md = run('--render', file);
  assert.equal(md.status, 0);
  assert.equal(md.stdout, renderDigest(good()));
  const issue = run('--issue', file);
  assert.equal(issue.status, 0);
  assert.equal(issue.stdout, issueBody(good()));
});
