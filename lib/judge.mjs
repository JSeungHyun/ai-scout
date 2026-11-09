// 이슈 댓글의 판정 줄 해석 — 스카우트는 댓글을 달지 않는다
// 받는 꼴: 「1 채택」「1. 채택」「1) 채택」「#1 채택」「1번 채택」 + 이유는 「: 」「：」「-」 뒤나 띄어 쓴 나머지
const LINE = /^\s*#?(\d+)\s*[.)번]?\s+(채택|기각|보류|도입)(?:\s*[:：\-–—]\s*|\s+|$)(.*?)\s*$/;
const NUMBERED = /^\s*#?\d+/;
const DONE = new Set(['기각', '보류', '도입']);
// 공개 저장소에는 누구나 댓글을 단다 — 저장소에 권한 있는 사람의 댓글만 판정이다
const JUDGES = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const lines = (body) => String(body ?? '').split(/\r?\n/);

export function parseLines(body) {
  return lines(body).map((l) => l.match(LINE)).filter(Boolean)
    .map((m) => ({ n: Number(m[1]), verdict: m[2], reason: m[3] ?? '' }));
}

export function judge(report, comments) {
  const byN = new Map(report.items.map((i) => [i.n, i]));
  const last = new Map();
  const unparsed = [];
  const ignored = [];
  for (const c of comments) {
    const by = c.user?.login ?? '';
    if (!JUDGES.has(c.author_association)) { ignored.push(by); continue; }
    for (const j of parseLines(c.body)) if (byN.has(j.n)) last.set(j.n, { ...j, by });
    // 숫자로 시작했는데 판정으로 못 읽은 줄 — 사람이 보게 남긴다
    for (const l of lines(c.body)) if (NUMBERED.test(l) && !LINE.test(l)) unparsed.push({ line: l.trim(), by });
  }
  const judgments = [...last.values()].sort((a, b) => a.n - b.n)
    .map(({ n, verdict, reason, by }) => ({ n, id: byN.get(n).id, name: byN.get(n).name, verdict, reason, by }));
  const closable = report.items.every((i) => DONE.has(last.get(i.n)?.verdict));
  return { issue: report.issue, judgments, closable, unparsed, ignored };
}
