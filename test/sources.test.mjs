import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractItems } from '../lib/items.mjs';

const sources = JSON.parse(readFileSync(new URL('../sources.json', import.meta.url), 'utf8'));
const ids = (id, html) => {
  const s = sources.find((x) => x.id === id);
  assert.ok(s, `sources.json 에 ${id} 가 없다`);
  return extractItems(s, html).map((i) => i.id);
};
const a = (href, text = 'x') => `<a class="c" href="${href}">${text}</a>`;

// ? · # 가 붙은 링크는 기존 패턴대로 잡지 않는다 — 같은 글이 다른 id 로 스냅숏에 두 번 들지 않게
test('anthropic-research — /research 목록의 글만, 목록 · 팀 · 다른 구역은 잡지 않는다 (11-16: /research 에만 있는 글 2개를 놓쳤다)', () => {
  const html = [
    a('/research'), a('/research/team/alignment'), a('/research/team/economics'), a('/engineering'), a('/news'), a('/science'), a('/search'),
    a('/institute/econ-scenarios'), a('https://www.anthropic.com/research/absolute'),
    a('/research/claude-electronics-design'), a('/research/coordinated-vulnerability-disclosure-timelines'),
    a('/research/claude-electronics-design', '다시'), a('/research/with-query?utm=1'), a('/research/with-hash#top'),
  ].join('\n');
  assert.deepEqual(ids('anthropic-research', html), ['/research/claude-electronics-design', '/research/coordinated-vulnerability-disclosure-timelines']);
});

test('anthropic-news — /news/ 글과 루트 경로 발표(/claude-…)만, 탐색 링크는 잡지 않는다 (11-09: /claude-fable-and-mythos-5-2 를 놓쳤다)', () => {
  const html = [
    a('/news'), a('/press-kit'), a('/science'), a('/search'), a('/search?topic=agents'), a('/company'), a('/careers'), a('/legal/aup'),
    a('/features/claude-on-mars'), a('/research/early-progress-drug-development'), a('/research/team/economics'), a('/institute/econ-scenarios'),
    a('/images/icons/apple-touch-icon.png'), a('https://claude.com/claude-code'), a('/claude-opus-5-5/sub'),
    a('/news/s1-sec'), a('/claude-fable-and-mythos-5-2'), a('/claude-fable-and-mythos-5-2', '다시'), a('/news/public-benefit-fund'), a('/claude-haiku-5-5?ref=news'),
  ].join('\n');
  assert.deepEqual(ids('anthropic-news', html), ['/news/s1-sec', '/claude-fable-and-mythos-5-2', '/news/public-benefit-fund']);
});
