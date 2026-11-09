// 채점 합산과 선택 — 판단(점수 매기기)은 Claude, 합산 · 문턱 · 상한은 여기서 결정론으로
const RANGES = { relevance: 4, evidence: 2, cost: 2, env: 2 };
const FLAGS = ['removes', 'security'];
const KEYS = [...Object.keys(RANGES), ...FLAGS];

const str = (v) => typeof v === 'string' && v.trim() !== '';
const relevanceWhy = (e) => String(e.reasons?.relevance ?? '').trim();

export const total = (s) => s.relevance + s.evidence + s.cost + s.env + (s.removes ? 2 : 0) - (s.security ? 2 : 0);

export function validate(entries) {
  for (const e of entries) {
    const s = e.scores ?? {};
    for (const [k, max] of Object.entries(RANGES)) {
      if (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > max) throw new Error(`${e.id}: ${k} 는 0~${max} 정수여야 한다 (받은 값 ${s[k]})`);
    }
    for (const k of FLAGS) if (typeof s[k] !== 'boolean') throw new Error(`${e.id}: ${k} 는 true/false 여야 한다 (받은 값 ${s[k]})`);
    // 추천에 오를 수 있는 항목만 — 나머지에 요구하면 고정 문구로 채운다(11-09: 24/24)
    const miss = s.relevance >= 2 ? ['why', 'smallest', 'pretest'].filter((k) => !str(e[k])) : [];
    if (miss.length) throw new Error(`${e.id}: 관련성 2 이상은 why · smallest · pretest 를 쓴다 — 빈 것: ${miss.join(', ')}`);
  }
  // 상투문이면 항목마다 프로필 · 하네스와 대조했는지 감사할 수 없다(11-09: 15/24 같은 문장)
  const count = new Map();
  for (const e of entries) count.set(relevanceWhy(e), (count.get(relevanceWhy(e)) ?? 0) + 1);
  for (const [v, n] of count) if (n >= 2 && n * 2 >= entries.length) throw new Error(`reasons.relevance 「${v || '(비어 있음)'}」 가 ${n}/${entries.length}개에 같다 — 항목마다 대조한 프로필 · 하네스 자리(겹치는 「가진 것」 또는 「해당 줄 없음」)를 적는다`);
}

// 연결 후보는 details 밖 변경이 하네스 열린 줄과 닿은 자리 — 점수는 모델 몫, 그 자리를 봤다는 인용만 요구한다
function checkLinks(entries, links) {
  for (const e of entries) for (const l of links.filter((x) => x.id === e.id)) {
    const cites = l.at.map((n) => `${l.doc.split('/').pop()}:${n}`);
    if (!cites.some((c) => relevanceWhy(e).includes(c))) throw new Error(`${e.id}: 연결 후보 — CHANGELOG ${l.line}행 \`${l.word}\` 가 하네스 열린 줄 ${cites.join(' · ')} 와 닿는다. reasons.relevance 에 ${cites[0]} 처럼 그 자리를 인용한다(점수는 판단대로 — 0 이어도 된다)`);
  }
}

// 근거 · 비용 · 보안은 공통 소식지가 정한 값이다 — 개인 층이 옮기다 바꾸지 않게
function matchDigest(entries, digest) {
  const byId = new Map(digest.candidates.map((c) => [c.id, c]));
  for (const e of entries) {
    const c = byId.get(e.id);
    if (!c) continue;
    const want = { evidence: c.evidence, cost: c.cost, security: Boolean(c.security) };
    for (const [k, v] of Object.entries(want)) if (e.scores[k] !== v) throw new Error(`${e.id}: ${k} 는 소식지 값 ${v} 그대로여야 한다 (받은 값 ${e.scores[k]})`);
  }
}

// 첫 select 뒤 점수를 바꾸면 이유와 전 · 후를 남긴다 — 결과를 보고 조용히 뒤집지 않게
function rescore(ranked, prev) {
  if (!prev) return [];
  const before = new Map([...prev.items, ...prev.nearMiss, ...prev.seen].map((e) => [e.id, e]));
  const out = [...prev.rescored];
  for (const e of ranked) {
    const b = before.get(e.id);
    if (!b || KEYS.every((k) => b.scores[k] === e.scores[k])) continue;
    if (typeof e.rescore !== 'string' || !e.rescore.trim()) throw new Error(`${e.id}: 첫 select 뒤 점수를 바꿨다 — 그 항목에 "rescore": "이유" 를 넣는다`);
    out.push({ id: e.id, name: e.name, before: { scores: b.scores, total: b.total }, after: { scores: e.scores, total: e.total }, reason: e.rescore });
  }
  return out;
}

export function select(entries, { threshold = 5, cap = 7, near = 0, expect, digest, links, prev } = {}) {
  // 「5점」 같은 값이 NaN 이 되면 조용히 0건이 된다
  for (const [k, v] of Object.entries({ threshold, cap, near, ...(expect !== undefined && { expect }) })) if (!Number.isInteger(v) || v < 0) throw new Error(`${k} 는 0 이상 정수여야 한다 (받은 값 ${v})`);
  // 후보를 한 줄로 묶거나 빠뜨리면 「본 것」이 조용히 줄어든다
  if (expect !== undefined && entries.length !== expect) {
    const ids = new Set(entries.map((e) => e.id));
    const gone = (digest?.candidates ?? []).map((c) => c.id).filter((id) => !ids.has(id));
    throw new Error(`항목이 ${expect}개여야 한다 (받은 수 ${entries.length}) — 빠뜨리거나 묶은 후보를 찾아 넣는다${gone.length ? ` · scores.json 에 없는 소식지 후보: ${gone.join(', ')}` : ''}`);
  }
  validate(entries);
  if (digest) matchDigest(entries, digest);
  if (links) checkLinks(entries, links);
  const ranked = entries.map((e, i) => ({ ...e, total: total(e.scores), i }))
    .sort((a, b) => b.total - a.total || b.scores.relevance - a.scores.relevance || a.i - b.i)
    .map(({ i, ...e }) => e);
  // 공식 항목은 근거 · 비용 · 환경만으로 6 — 관련성 문턱이 없으면 합계 문턱이 일하지 않는다(v0.1.3)
  const ok = (e) => e.total >= threshold && e.scores.relevance >= 2;
  const items = ranked.filter(ok).slice(0, cap);
  const nearMiss = ranked.filter((e) => !ok(e) && e.scores.relevance > 0).slice(0, near);
  const shown = new Set([...items, ...nearMiss]);
  return {
    items: items.map((e, k) => ({ n: k + 1, ...e })),
    nearMiss,
    seen: ranked.filter((e) => !shown.has(e)),
    rescored: rescore(ranked, prev),
  };
}
