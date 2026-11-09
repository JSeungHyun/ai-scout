import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractItems, jsonPath, parseLsRemote, diffItems, versionSection } from '../lib/items.mjs';

test('sections — 제목 아래 본문, CRLF 도 같다', () => {
  const s = { kind: 'sections', heading: '^## (.+)$' };
  const body = '# Changelog\r\n\r\n## 2.1.319\r\n- a\r\n- b\r\n## 2.1.318\n- c\n';
  assert.deepEqual(extractItems(s, body), [
    { id: '2.1.319', title: '2.1.319', text: '- a\n- b', lines: ['4: - a', '5: - b'] },
    { id: '2.1.318', title: '2.1.318', text: '- c', lines: ['7: - c'] },
  ]);
});

test('sections — 절 줄은 원본 행 번호와 함께, 빈 줄은 뺀다 (11-09: details 9/87줄만 실려 개인 층이 SendMessage 변경을 못 봤다)', () => {
  const [item] = extractItems({ kind: 'sections', heading: '^## (.+)$' }, '# Changelog\n\n## 2.1.317\n\n- Changed `SendMessage`\n\n- Fixed x\n');
  assert.deepEqual(item.lines, ['5: - Changed `SendMessage`', '7: - Fixed x']);
});

test('lines — 캡처 1 이 id, 중복 제거, 상대 경로는 원천 url 기준 절대 url', () => {
  const s = { kind: 'lines', url: 'https://www.anthropic.com/engineering', pattern: 'href="(/engineering/[^"#?]+)"' };
  const body = '<a href="/engineering/x">1</a><a href="/engineering/x">2</a><a href="/engineering/y">3</a>';
  assert.deepEqual(extractItems(s, body).map((i) => [i.id, i.url]), [
    ['/engineering/x', 'https://www.anthropic.com/engineering/x'],
    ['/engineering/y', 'https://www.anthropic.com/engineering/y'],
  ]);
});

test('json — 경로의 [] 는 배열을 편다', () => {
  assert.deepEqual(jsonPath({ servers: [{ server: { name: 'a' } }, { server: { name: 'b' } }] }, 'servers[].server.name'), ['a', 'b']);
  const s = { kind: 'json', path: 'items[].full_name' };
  assert.deepEqual(extractItems(s, '{"items":[{"full_name":"o/r"}]}').map((i) => i.id), ['o/r']);
});

test('parseLsRemote — ^{} 줄은 빼고, 패턴으로 거른다, 순서는 그대로', () => {
  const out = 's1\trefs/tags/v1.3.0\ns1b\trefs/tags/v1.3.0^{}\ns2\trefs/tags/v1.3.0-alpha\ns3\trefs/tags/v1.2.0\n';
  assert.deepEqual(parseLsRemote(out, '^v\\d+\\.\\d+\\.\\d+$'), ['v1.3.0', 'v1.2.0']);
});

test('diffItems 첫 실행 — firstRun 개만, 0 이면 없다', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id, title: id }));
  assert.deepEqual(diffItems(null, items, 2).map((i) => i.id), ['a', 'b']);
  assert.deepEqual(diffItems(null, items, 0), []);
  assert.deepEqual(diffItems(['a'], items, 2).map((i) => i.id), ['b', 'c']);
});

test('sections — 긴 절도 자르지 않는다 (v0.1.3 은 4000자에서 잘라 각 판의 17~35% 만 봤다)', () => {
  const long = Array.from({ length: 900 }, (_, i) => `- Windows: 고친 것 ${i}`).join('\n');
  const [item] = extractItems({ kind: 'sections', heading: '^## (.+)$' }, `## 2.1.317\n${long}\n`);
  assert.equal(item.text, long);
});

test('versionSection — 그 판의 제목부터 같거나 높은 단계 제목 앞까지, v · [] 접두는 무시', () => {
  const md = '# Changelog\n\n## [0.3.320]\n- 다음\n\n## 0.3.319 - 2026-11-08\n### Fixed\n- 고침\n## 0.3.3190\n- 아님\n';
  assert.deepEqual(versionSection(md, '0.3.319'), { text: '### Fixed\n- 고침', lines: ['7: ### Fixed', '8: - 고침'] });
  assert.equal(versionSection(md, '0.3.320').text, '- 다음');
  assert.deepEqual(versionSection(md, '9.9.9'), { text: '', lines: [] }, '판이 없으면 빈 절');
});

test('versionSection — 판을 모르면(HEAD) 첫 절', () => {
  assert.deepEqual(versionSection('# Changelog\r\n\r\n## 5.4.0\r\n- 새것\r\n## 5.3.0\r\n- 옛것\r\n'), { text: '- 새것', lines: ['4: - 새것'] });
});
