// 원천 본문 → 항목 목록, 지난주 스냅숏과 비교
const TEXT_MAX = 4000;

const uniq = (xs) => [...new Set(xs)];

export function extractItems(source, body) {
  const text = body.replace(/\r\n/g, '\n');
  if (source.kind === 'sections') return sections(text, new RegExp(source.heading));
  if (source.kind === 'lines') {
    const ids = uniq([...text.matchAll(new RegExp(source.pattern, 'g'))].map((m) => m[1]));
    return ids.map((id) => ({ id, title: id, url: source.url ? new URL(id, source.url).href : id }));
  }
  if (source.kind === 'json') return uniq(jsonPath(JSON.parse(text), source.path)).map((id) => ({ id, title: id }));
  throw new Error(`본문으로 뽑을 수 없는 kind: ${source.kind}`);
}

function sections(text, heading) {
  const items = [];
  let cur = null;
  const close = () => cur && items.push({ ...cur, text: cur.lines.join('\n').trim().slice(0, TEXT_MAX) });
  for (const line of text.split('\n')) {
    const m = line.match(heading);
    if (m) { close(); cur = { id: m[1], title: m[1], lines: [] }; } else if (cur) cur.lines.push(line);
  }
  close();
  return items.map(({ lines, ...item }) => item);
}

// 'a[].b.c' — [] 는 배열을 편다
export function jsonPath(obj, path) {
  let vals = [obj];
  for (const seg of path.split('.')) {
    const spread = seg.endsWith('[]');
    vals = vals.map((v) => v?.[spread ? seg.slice(0, -2) : seg]).filter((v) => v !== undefined && v !== null);
    if (spread) vals = vals.flatMap((v) => (Array.isArray(v) ? v : []));
  }
  return vals.filter((v) => typeof v === 'string' || typeof v === 'number').map(String);
}

export function parseLsRemote(out, tagPattern) {
  const re = tagPattern ? new RegExp(tagPattern) : null;
  const names = out.split(/\r?\n/).map((l) => l.split('\t')[1]).filter((ref) => ref && !ref.endsWith('^{}'))
    .map((ref) => ref.replace(/^refs\/tags\//, ''));
  return uniq(names.filter((n) => !re || re.test(n)));
}

// 스냅숏이 없으면(첫 실행) 앞의 firstRun 개만 새것으로 본다
export function diffItems(prevIds, items, firstRun) {
  if (!prevIds) return items.slice(0, firstRun);
  const seen = new Set(prevIds);
  return items.filter((i) => !seen.has(i.id));
}
