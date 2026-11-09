// 원천을 돌며 항목을 모으고 지난주 스냅숏과 비교한다 — 외부 호출은 모두 run(cmd, args)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractItems, parseLsRemote, diffItems, versionSection } from './items.mjs';

export function loadSources(paths) {
  const all = paths.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
  const seen = new Set();
  for (const s of all) {
    if (seen.has(s.id)) throw new Error(`원천 id 중복: ${s.id}`);
    seen.add(s.id);
  }
  return all;
}

const firstToken = (out) => out.trim().split(/\s/)[0];

export async function fetchItems(source, since, run) {
  const url = source.url?.replaceAll('{since}', since);
  if (source.kind === 'git-tags') {
    const out = await run('git', ['ls-remote', '--tags', '--sort=-v:refname', source.repo]);
    return parseLsRemote(out, source.tagPattern).map((t) => ({ id: t, title: t, url: `${source.repo}/releases/tag/${t}`, repo: source.repo, ref: t }));
  }
  if (source.kind === 'git-head') {
    const sha = firstToken(await run('git', ['ls-remote', source.repo, 'HEAD']));
    return sha ? [{ id: sha, title: `HEAD ${sha.slice(0, 7)}`, url: source.repo, repo: source.repo, ref: sha }] : [];
  }
  if (source.kind === 'pinned-marketplace') return pinned(JSON.parse(await run('curl', [url])), run);
  return extractItems({ ...source, url }, await run('curl', [url]));
}

// 고정 sha 와 저장소 HEAD 가 다른 플러그인만 — 다 최신이면 0개가 정상이다
async function pinned(market, run) {
  const items = [];
  for (const p of market.plugins ?? []) {
    const { url, sha } = p.source ?? {};
    if (!url || !sha) continue;
    const head = firstToken(await run('git', ['ls-remote', url, 'HEAD']));
    if (!head || head === sha) continue;
    const repo = url.replace(/\.git$/, '');
    const [a, b] = [sha.slice(0, 7), head.slice(0, 7)];
    items.push({ id: `${p.name}@${head}`, title: `${p.name}: 고정 ${a} → 최신 ${b}`, url: repo.startsWith('https://github.com/') ? `${repo}/compare/${a}...${b}` : repo, repo, ref: head });
  }
  return items;
}

// 태그 · HEAD 는 이름만 온다 — 무엇이 바뀌었는지는 그 ref 의 CHANGELOG 절을 도구가 받아 둔다(v0.1.3 은 읽기 · 생략 · 「판올림」이 판마다 달랐다)
async function withChangelog(item, run) {
  const gh = item.repo?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  if (!gh) return item;
  const url = `https://raw.githubusercontent.com/${gh[1]}/${item.ref}/CHANGELOG.md`;
  try {
    return { ...item, changelog: { url, status: 200 }, text: versionSection(await run('curl', [url]), item.ref.match(/\d+\.\d+\.\d+/)?.[0]) };
  } catch (e) {
    const why = reason(e);
    return { ...item, changelog: { url, status: Number(why.match(/error: (\d{3})/)?.[1]) || why } };
  }
}

const SNAP_MAX = 3000;

// curl · git 의 원인(404 · DNS · 타임아웃)은 stderr 에 있다
export const reason = (e) => String(e?.stderr || e?.message || e).trim().split('\n').pop();

// 고정 점검(다 최신)과 기간 검색({since})은 0개가 정상이다
export const zeroOk = (s) => s.kind === 'pinned-marketplace' || Boolean(s.url?.includes('{since}'));

export async function collect({ sources, snapshotsDir, since, run }) {
  mkdirSync(snapshotsDir, { recursive: true });
  const out = [];
  for (const s of sources) {
    const row = { id: s.id, group: s.group, url: s.url ?? s.repo, ok: false, newItems: [] };
    try {
      const items = await fetchItems(s, since, run);
      // 0개로 스냅숏을 덮으면 다음 주에 전부가 새것이 된다
      if (!items.length && !zeroOk(s)) throw new Error('항목 0개 — 패턴 확인');
      const file = join(snapshotsDir, `${s.id}.json`);
      const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).ids : null;
      for (const item of diffItems(prev, items, s.firstRun ?? 0)) row.newItems.push(item.ref ? await withChangelog(item, run) : item);
      // 쌓는다 — 순위 경계에서 들락거리거나 페이지가 일부만 잡혀도 돌아온 항목이 다시 새것이 되지 않게
      const keep = [...new Set([...items.map((i) => i.id), ...(prev ?? [])])].slice(0, SNAP_MAX);
      writeFileSync(file, JSON.stringify({ ids: keep, updatedAt: new Date().toISOString() }, null, 1) + '\n');
      row.ok = true;
    } catch (e) {
      row.error = reason(e);
    }
    out.push(row);
  }
  return { generatedAt: new Date().toISOString(), since, sources: out };
}

// 본문은 파일로 — JSON 한 줄에 든 긴 절은 읽는 쪽에서 잘린다
export function writeTexts(result, dir) {
  for (const row of result.sources) {
    for (const item of row.newItems) {
      if (!item.text) continue;
      mkdirSync(join(dir, row.id), { recursive: true });
      writeFileSync(join(dir, row.id, `${item.id.replace(/[^\w.@-]+/g, '_')}.md`), `${item.text}\n`);
    }
  }
}
