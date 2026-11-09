// 공통 소식지 — JSON 검사와 md 만들기. 개인 층은 후보를 FIELDS 이름으로 읽는다
export const FIELDS = ['id', 'name', 'source', 'group', 'kind', 'url', 'what', 'details', 'lines', 'os', 'evidence', 'cost', 'reach', 'security', 'reasons'];
const RANGED = ['evidence', 'cost', 'reach'];
const LAYERS = ['프롬프트', '컨텍스트', '하네스', '루프', '그래프'];
const GH_REPO = /^https:\/\/github\.com\/([^/\s]+\/[^/\s#?]+?)\/?$/;
const PICK_MIN = 4;
const ISSUE_MAX = 65536;

const str = (v) => typeof v === 'string' && v.trim() !== '';
const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? Date.parse(`${s}T00:00:00Z`) / 864e5 : NaN);
const minus = (a, b) => a.filter((x) => !b.includes(x));

// 「이런 것도 있어요」 — 프로필 없는 기준. 억지로 채우지 않게 합이 낮으면 올리지 않는다
export function picks(candidates) {
  return candidates.map((c, i) => ({ c, i, s: c.evidence + c.cost + c.reach - (c.security ? 2 : 0) }))
    .filter(({ c, s }) => c.kind === '도구' && s >= PICK_MIN)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 3).map(({ c }) => c);
}

// item: 수집 항목(CHANGELOG 절 text) · readme: 저장소 → README 파일의 보안 행 수, 파일이 없으면 null
function checkCandidate(c, no, item, readme) {
  const at = c.id ?? '(id 없음)';
  const details = Array.isArray(c.details) ? c.details : [];
  for (const k of ['id', 'name', 'source', 'group', 'url', 'what', 'os']) if (!str(c[k])) no(`${at}: ${k} 가 비었다`);
  if (!['도구', '변경'].includes(c.kind)) no(`${at}: kind 는 도구 | 변경 (받은 값 ${c.kind})`);
  if (!details.some(str)) no(`${at}: details 에 원본에서 읽은 내용을 한 줄 이상 — 못 읽었으면 unread 로`);
  for (const k of RANGED) {
    if (!Number.isInteger(c[k]) || c[k] < 0 || c[k] > 2) no(`${at}: ${k} 는 0~2 정수여야 한다 (받은 값 ${c[k]})`);
    if (!str(c.reasons?.[k])) no(`${at}: reasons.${k} 가 비었다`);
  }
  if (c.security !== false && !str(c.security)) no(`${at}: security 는 false 또는 이유 문자열 (받은 값 ${JSON.stringify(c.security)})`);
  // 개인 층은 판 단위로 판정한다 — 다른 판의 변경을 옮겨 적으면 판정이 틀린다(11-09: 2.1.318 의 assume_role 을 2.1.317 에)
  if (item?.text) for (const [, w] of details.join('\n').matchAll(/`([^`\n]+)`/g)) if (!item.text.includes(w)) no(`${at}: details 의 \`${w}\` 이 이 판 절 본문에 없다 — 백틱 안은 그 판 원문 그대로`);
  // details 는 고른 줄이다 — 개인 층 link.mjs 가 나머지 줄까지 하네스와 맞춘다(11-09: 87줄 중 9줄만 실려 SendMessage 를 놓쳤다)
  if (item?.lines && JSON.stringify(c.lines) !== JSON.stringify(item.lines)) no(`${at}: lines 는 collect 의 그 판 절 줄(원본 행 번호) 그대로 — tools/digest.mjs --lines 로 채운다`);
  const repo = c.url?.match(GH_REPO)?.[1];
  if (!repo) return;
  // 읽기 깊이는 readme.mjs 가 정하고, 읽었는지는 행 번호로 본다 — 「하나씩 읽는다」 문구는 세 판 연속 우회됐다
  if (!/\d+:|OS 언급 없음/.test(c.os ?? '')) no(`${at}: GitHub 저장소 후보의 os 에 README 행 번호(「12: …」)나 「README 에 OS 언급 없음」 — tools/readme.mjs 출력 그대로`);
  if (!details.some((x) => /\d+:/.test(x))) no(`${at}: details 한 줄 이상에 README 행 번호(「48: …」) — tools/readme.mjs 파일에서 읽은 줄을 인용`);
  const n = readme(repo);
  if (n === null) no(`${at}: README 파일이 없다 — tools/readme.mjs --out 에 이 저장소를 넣는다(못 받았으면 unread)`);
  else if (n > 0 && c.security === false && !str(c.reasons?.security)) no(`${at}: README 보안 행 ${n}개 — ⚠️ 면 security 에 이유, 아니면 왜 ⚠️ 가 아닌지 reasons.security 에`);
}

// 점수를 문구로 바꾸는 헬퍼는 근거를 비운다(11-09: evidence 20/20 같은 문장) — 개인 층은 이 문장으로 판정한다
function checkBoilerplate(candidates, no) {
  const community = candidates.filter((c) => c.group === '커뮤니티');
  const count = new Map();
  for (const c of community) for (const [k, v] of Object.entries(c.reasons ?? {})) count.set(`${k}\0${v}`, (count.get(`${k}\0${v}`) ?? 0) + 1);
  for (const [key, n] of count) {
    const [k, v] = key.split('\0');
    if (n >= 2 && n * 2 >= community.length) no(`reasons.${k} 「${v}」 가 커뮤니티 후보 ${n}/${community.length}개에 같다 — 후보마다 원본에서 읽은 근거로`);
  }
}

function checkConcepts(d, no) {
  if (d.concepts.length > 3) no(`개념은 최대 3 (받은 수 ${d.concepts.length}) — 알림이 소음이 되지 않게`);
  const query = String(d.conceptSearch ?? '').toLowerCase();
  for (const k of d.concepts) {
    const at = k.term ?? '(term 없음)';
    for (const f of ['term', 'definition', 'origin', 'url']) if (!str(k[f])) no(`${at}: 개념 ${f} 가 비었다`);
    const off = day(k.date) - day(d.date);
    if (!(off >= -7 && off <= 6)) no(`${at}: 원문 날짜 date 는 소식지 주의 7일 안이어야 한다 (받은 값 ${k.date}) — 오래된 글은 「이번 주」 개념이 아니다`);
    if (!LAYERS.includes(k.layer)) no(`${at}: layer 는 ${LAYERS.join(' | ')} (받은 값 ${k.layer})`);
    if (![0, 1, 2].includes(k.grade)) no(`${at}: grade 는 0~2 (받은 값 ${k.grade})`);
    if (k.grade === 1 && !str(k.read)) no(`${at}: 등급 1 은 해설 글을 실제로 열었을 때만 — 연 글 주소를 read 에 (검색 요약뿐이면 0)`);
    if (k.grade === 2 && k.read !== k.url) no(`${at}: 등급 2 는 원문을 읽었을 때만 — read 가 원문 url 과 같아야 한다`);
    if (str(k.term) && query.includes(k.term.toLowerCase())) no(`${at}: 검색어 낱말 자체는 개념이 아니다 — 그 낱말과 함께 나온 새 용어만`);
  }
}

const itemsOf = (collected) => new Map(collected.sources.flatMap((r) => r.newItems.map((i) => [`${r.id}\0${i.id}`, i])));

// 절 줄은 손으로 옮기지 않는다 — collect 출력에서 그 판 후보에 채운다
export function withLines(d, collected) {
  const itemOf = itemsOf(collected);
  return { ...d, candidates: d.candidates.map((c) => {
    const lines = itemOf.get(`${c.source}\0${c.id}`)?.lines;
    return lines ? { ...c, lines } : c;
  }) };
}

// 수집 결과(collect --out)와 맞춰 본다 — 후보 = 수집 새것(인접 제외) + 웹 발견
export function checkDigest(d, collected, web, readme) {
  const errs = [];
  const no = (m) => errs.push(m);
  const date = day(d.date);
  if (Number.isNaN(date) || new Date(date * 864e5).getUTCDay() !== 1) no(`date 는 그 주 월요일(UTC) YYYY-MM-DD 여야 한다 (받은 값 ${d.date}) — 개인 층이 이 이름으로 찾는다`);
  if (!str(d.url) || !d.url.startsWith('https://') || !d.url.endsWith(`/digest/${d.date}.md`)) no(`url 은 소식지 md 의 https 주소(…/digest/${d.date}.md)여야 한다 (받은 값 ${d.url})`);
  for (const k of ['engine', 'conceptSearch']) if (!str(d[k])) no(`${k} 가 비었다`);
  const lists = ['candidates', 'unread', 'adjacent', 'concepts'].filter((k) => !Array.isArray(d[k]));
  if (lists.length) return [...errs, ...lists.map((k) => `${k} 는 배열이어야 한다`)];

  const rows = collected.sources;
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const itemOf = itemsOf(collected);
  for (const c of d.candidates) checkCandidate(c, no, itemOf.get(`${c.source}\0${c.id}`), readme);
  checkBoilerplate(d.candidates, no);
  for (const u of d.unread) for (const k of ['id', 'name', 'source', 'reason']) if (!str(u[k])) no(`${u.id ?? '(id 없음)'}: unread.${k} 가 비었다`);

  // 개인 층은 id 로 장부 · 소식지 값을 맞춘다
  const all = [...d.candidates, ...d.unread];
  const ids = new Set();
  for (const c of all) {
    if (ids.has(c.id)) no(`${c.id}: id 가 겹친다`);
    ids.add(c.id);
    // unread 도 — 「이번 주 공식 변경」은 group 으로 고른다
    const want = c.source === 'web' ? 'web' : rowOf.get(c.source)?.group;
    if (want && c.group !== want) no(`${c.id}: group 은 ${want} (받은 값 ${c.group})`);
  }

  const bySource = new Map();
  for (const c of all) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c.id]);
  for (const r of rows.filter((x) => x.group !== '인접')) {
    const want = r.newItems.map((i) => i.id);
    const got = bySource.get(r.id) ?? [];
    if (minus(want, got).length) no(`${r.id}: 수집 새것이 빠졌다 — ${minus(want, got).join(', ')} (candidates 나 unread 에 하나씩, 묶지 않는다)`);
    if (minus(got, want).length) no(`${r.id}: 수집 새것에 없는 항목 — ${minus(got, want).join(', ')}`);
  }
  for (const s of bySource.keys()) if (s !== 'web' && (!rowOf.has(s) || rowOf.get(s).group === '인접')) no(`${s}: 후보의 원천이 될 수 없다 — 인접은 adjacent 에, 웹 발견은 source "web"`);
  const webN = (bySource.get('web') ?? []).length;
  if (webN !== web) no(`웹 발견이 ${web}개여야 한다 (받은 수 ${webN}) — /tmp/web.md 한 줄마다 후보 하나(source "web")`);

  const adj = rows.filter((r) => r.group === '인접').flatMap((r) => r.newItems.map((i) => i.id));
  const adjGot = d.adjacent.map((a) => a.id);
  const adjOff = [...minus(adj, adjGot), ...minus(adjGot, adj)];
  if (adjOff.length) no(`인접 새것은 adjacent 에 하나씩(채점 · 중립 사실 없이 what 한 줄) — 어긋난 것: ${adjOff.join(', ')}`);
  for (const a of d.adjacent) if (!str(a.what)) no(`${a.id}: adjacent.what 이 비었다`);

  if (d.sources?.total !== rows.length) no(`sources.total 은 원천 ${rows.length}곳 (받은 값 ${d.sources?.total})`);
  const failed = rows.filter((r) => !r.ok).map((r) => r.id);
  const failedGot = (d.sources?.failed ?? []).map((f) => f.id);
  if (minus(failed, failedGot).length || minus(failedGot, failed).length) no(`sources.failed 는 수집 실패 원천과 같아야 한다 — ${failed.join(', ') || '없음'} (받은 값 ${failedGot.join(', ') || '없음'})`);

  // 도구가 받은 본문 · HTTP 코드를 그대로 쓰게(v0.1.3 은 CHANGELOG 200 을 「판올림」으로, 404 를 표시 없이 넘겼다)
  for (const u of d.unread) {
    const item = itemOf.get(`${u.source}\0${u.id}`);
    if (!item) continue;
    if (item.text) no(`${u.id}: 본문을 받았다(/tmp/texts) — 읽기 실패로 넘기지 말고 candidates 에`);
    const st = item.changelog?.status;
    const mark = /^\d{3}/.test(String(st)) ? `미확인(${st})` : '미확인';
    if (st !== undefined && st !== 200 && !String(u.reason).includes(mark)) no(`${u.id}: CHANGELOG ${st} — reason 에 「${mark}」`);
  }
  checkConcepts(d, no);
  return errs;
}

const warn = (c) => (c.security ? ` · ⚠️ ${c.security}` : '');
const unreadLine = (u) => `- ${u.name} (${u.source}) — ${u.reason}${u.url ? ` · ${u.url}` : ''}`;

// md 는 JSON 에서만 만든다 — 사람이 옮겨 적다 생기는 점수 오류를 막는다
export function renderDigest(d, linkCandidates = false) {
  const official = d.candidates.filter((c) => c.group === '공식');
  // 못 읽은 공식 항목도 센다 — 개인 층 K 도 이 머리 줄에서 읽는다
  const officialUnread = d.unread.filter((u) => u.group === '공식');
  const officialN = official.length + officialUnread.length;
  const top = picks(d.candidates);
  const or = (xs, none) => (xs.length ? xs : [none]);
  return `${[
    `# AI-SCOUT 소식 ${d.date}`,
    `> 원천 ${d.sources.total}곳(실패 ${d.sources.failed.length}곳) · 후보 ${d.candidates.length}개(읽기 실패 ${d.unread.length}개) · 공식 변경 ${officialN}건 · 개념 ${d.concepts.length}건 · 엔진 ${d.engine}`,
    '> 누구에게나 같은 소식지다 — 프로필 없이 중립 사실만 적는다. 내 환경에 맞춘 추천은 개인 스카우트가 이 소식지를 읽어 고른다.',
    '',
    `## 이런 것도 있어요 (${top.length}건)`,
    ...or(top.map((c) => `- **${c.name}** — ${c.what} · 근거 ${c.evidence} · 비용 ${c.cost} · 범용성 ${c.reach}${warn(c)} · ${c.url}`), `이번 주는 없다 — 근거 + 비용 + 범용성이 ${PICK_MIN} 이상인 도구가 없다.`),
    '',
    `## 이번 주 개념 (${d.concepts.length}건)`,
    ...or(d.concepts.map((k) => `- **${k.term}** — ${k.definition} · 처음 말한 쪽 [${k.origin}](${k.url}) ${k.date} · 층 ${k.layer} · 근거 등급 ${k.grade}${k.grade === 0 ? ' ⚠️' : ''}`), `없음 — 개념 검색: ${d.conceptSearch}`),
    '',
    `## 이번 주 공식 변경 (${officialN}건)`,
    ...official.map((c) => `- ${c.name} — ${c.what} · ${c.url}`),
    ...officialUnread.map(unreadLine),
    ...(d.adjacent.length ? [`- 인접: ${d.adjacent.map((a) => `${a.id}(${a.source}) — ${a.what}`).join(' · ')}`] : []),
    '',
    `## 후보 전체 (${d.candidates.length}개)`,
    ...(linkCandidates ? [`전체는 소식지 md 에 — ${d.url}`] : d.candidates.flatMap((c) => [
      `- **${c.name}** (${c.source} · ${c.kind}) — ${c.what} · 근거 ${c.evidence}(${c.reasons.evidence}) · 비용 ${c.cost}(${c.reasons.cost}) · 범용성 ${c.reach}(${c.reasons.reach}) · OS: ${c.os}${warn(c)} · ${c.url}`,
      ...c.details.map((x) => `  - ${x}`),
    ])),
    '',
    `## 읽기 실패 (${d.unread.length}개)`,
    ...or(d.unread.map(unreadLine), '없음'),
    '',
    '## 수집 실패',
    ...or(d.sources.failed.map((f) => `- ${f.id} — ${f.error}`), '없음'),
  ].join('\n')}\n`;
}

// 길이 판단을 모델에 맡기면 틀린 근거로 줄인다(11-09: 15K자 md 를 「22KB 라서」 손 요약) — GitHub 한도를 넘을 때만 후보 전체를 링크로
export function issueBody(d) {
  const md = renderDigest(d);
  return md.length <= ISSUE_MAX ? md : renderDigest(d, true);
}
