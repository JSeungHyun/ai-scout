import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractItems, jsonPath, parseLsRemote, diffItems } from '../lib/items.mjs';

test('sections — 제목 아래 본문, CRLF 도 같다', () => {
  const s = { kind: 'sections', heading: '^## (.+)$' };
  const body = '# Changelog\r\n\r\n## 2.1.319\r\n- a\r\n- b\r\n## 2.1.318\n- c\n';
  assert.deepEqual(extractItems(s, body), [
    { id: '2.1.319', title: '2.1.319', text: '- a\n- b' },
    { id: '2.1.318', title: '2.1.318', text: '- c' },
  ]);
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
