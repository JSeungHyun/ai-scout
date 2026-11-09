// 채점 합산과 선택 — 판단(점수 매기기)은 Claude, 합산 · 문턱 · 상한은 여기서 결정론으로
const RANGES = { relevance: 4, evidence: 2, cost: 2, env: 2 };
const FLAGS = ['removes', 'security'];

export const total = (s) => s.relevance + s.evidence + s.cost + s.env + (s.removes ? 2 : 0) - (s.security ? 2 : 0);

export function validate(entries) {
  for (const e of entries) {
    const s = e.scores ?? {};
    for (const [k, max] of Object.entries(RANGES)) {
      if (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > max) throw new Error(`${e.id}: ${k} 는 0~${max} 정수여야 한다 (받은 값 ${s[k]})`);
    }
    for (const k of FLAGS) if (typeof s[k] !== 'boolean') throw new Error(`${e.id}: ${k} 는 true/false 여야 한다 (받은 값 ${s[k]})`);
  }
}

export function select(entries, { threshold = 5, cap = 7, near = 0, expect } = {}) {
  // 「5점」 같은 값이 NaN 이 되면 조용히 0건이 된다
  for (const [k, v] of Object.entries({ threshold, cap, near, ...(expect !== undefined && { expect }) })) if (!Number.isInteger(v) || v < 0) throw new Error(`${k} 는 0 이상 정수여야 한다 (받은 값 ${v})`);
  // 후보를 한 줄로 묶거나 빠뜨리면 「본 것」이 조용히 줄어든다
  if (expect !== undefined && entries.length !== expect) throw new Error(`항목이 ${expect}개여야 한다 (받은 수 ${entries.length}) — 빠뜨리거나 묶은 후보를 찾아 넣는다`);
  validate(entries);
  const ranked = entries.map((e, i) => ({ ...e, total: total(e.scores), i }))
    .sort((a, b) => b.total - a.total || b.scores.relevance - a.scores.relevance || a.i - b.i)
    .map(({ i, ...e }) => e);
  // 관련성 0 = 「있으면 좋다」 — 근거 · 비용 · 환경 점수만으로 문턱을 넘지 못하게
  const ok = (e) => e.total >= threshold && e.scores.relevance > 0;
  const pass = ranked.filter(ok);
  return {
    items: pass.slice(0, cap).map((e, k) => ({ n: k + 1, ...e })),
    nearMiss: ranked.filter((e) => !ok(e)).slice(0, near),
  };
}
