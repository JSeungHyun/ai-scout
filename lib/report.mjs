// 개인 보고서의 점수 절 — md 와 JSON 이 어긋나지 않게 보고서 JSON 에서만 만든다(v0.1.3 은 md 가 JSON 과 다른 목록을 적었다)
const NAMES = { relevance: '관련성', evidence: '근거', cost: '도입 비용', env: '환경', removes: '지울 수 있음', security: '보안' };
const why = (e, k) => (e.reasons?.[k] ? `(${e.reasons[k]})` : '');

const parts = (e) => [
  ...['relevance', 'evidence', 'cost', 'env'].map((k) => `${NAMES[k]} ${e.scores[k]}${why(e, k)}`),
  ...(e.scores.removes ? [`지울 수 있음 +2${why(e, 'removes')}`] : []),
  ...(e.scores.security ? [`⚠️ 보안 −2${why(e, 'security')}`] : []),
].join(' · ');

const line = (e) => `- (${e.total}점) ${e.name} — ${e.summary} · ${parts(e)} · ${e.url}`;

const rescoreLine = (x) => {
  const changed = Object.keys(x.after.scores).filter((k) => x.before.scores[k] !== x.after.scores[k])
    .map((k) => `${NAMES[k] ?? k} ${x.before.scores[k]} → ${x.after.scores[k]}`).join(' · ');
  return `- ${x.name}: ${x.before.total}점 → ${x.after.total}점 (${changed}) — ${x.reason}`;
};

export function renderReport(r, notes = '') {
  const L = [
    `# AI-SCOUT ${r.date}`,
    `> 소식지 [${r.digest.date}](${r.digest.url}) · 채점 ${r.items.length + r.nearMiss.length + r.seen.length}개 · 문턱 ${r.threshold} · 상한 ${r.cap}`,
    '',
    `## 이번 주 추천 (${r.items.length}건)`,
  ];
  if (!r.items.length) L.push(`문턱 ${r.threshold} 이상 · 관련성 2 이상인 것이 없다.`);
  for (const e of r.items) L.push(`### ${e.n}. (${e.total}점) ${e.name} — ${e.summary}`, `- ${e.kind} · ${e.source} · ${e.url}`, `- 점수: ${parts(e)}`, `- 왜 나에게: ${e.why} · 가장 작은 도입: ${e.smallest} · 사전 시험: ${e.pretest}`);
  if (r.nearMiss.length) L.push('', '## 아깝게 빠진 것', ...r.nearMiss.map(line));
  L.push('', `## 본 것 (추천 안 함 · ${r.seen.length}개)`, ...r.seen.map(line));
  if (r.rescored?.length) L.push('', '## 재채점', ...r.rescored.map(rescoreLine));
  return `${L.join('\n')}\n${notes ? `\n${notes.trim()}\n` : ''}`;
}
