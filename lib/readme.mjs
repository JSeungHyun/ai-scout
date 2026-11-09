// GitHub 저장소 README — 읽는 깊이(본문 80줄 + OS · 보안 행 전체 grep + 플러그인 훅)를 도구가 정해 파일로 남긴다
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { reason } from './collect.mjs';

// 소문자 낱말까지 잡으면 오탐이다(11-09: 포럼 「LINUX DO」 · 「short windows first」)
const OS = /\b(Windows|winget|PowerShell|WSL|macOS|Linux)\b/;
const SECURITY = /hook|settings\.json|telemetry|analytics|login|cookie|curl\b.*\|\s*(ba)?sh\b|\b(iwr|irm)\b.*\biex\b|npx/i;
const NO_OS = 'README 에 OS 언급 없음';
const raw = (repo, path) => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`;
const fileOf = (dir, repo) => join(dir, `${repo.replace('/', '__')}.md`);

// 첫 줄들이 배지 · HTML 뿐이어도 본문이 나오게 거른다. 행 번호는 모두 거르기 전 원본 기준 — details 가 인용한다
export function readmeDigest(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l, i) => [`${i + 1}: `, l]);
  const grep = (re, n) => lines.filter(([, l]) => re.test(l)).slice(0, n).map(([no, l]) => no + l.trim().slice(0, 200));
  return {
    body: lines.filter(([, l]) => !/^\s*<|!\[/.test(l)).slice(0, 80).map(([no, l]) => no + l),
    os: grep(OS, 10),
    security: grep(SECURITY, 20),
  };
}

// 훅은 README 밖 hooks/hooks.json 에만 있기도 하다 — 같은 저장소 안 경로의 플러그인만(raw 로 받을 수 있는 범위)
async function pluginHooks(repo, run) {
  let market;
  try {
    market = JSON.parse(await run('curl', [raw(repo, '.claude-plugin/marketplace.json')]));
  } catch {
    return [];
  }
  const out = [];
  for (const p of market.plugins ?? []) {
    if (typeof p.source !== 'string') continue;
    const path = posix.join(market.metadata?.pluginRoot ?? '', p.source, 'hooks/hooks.json');
    try {
      const events = Object.keys(JSON.parse(await run('curl', [raw(repo, path)])).hooks ?? {});
      out.push({ line: `훅 ${path} — ${events.join(' · ') || '이벤트 없음'}`, hit: events.length > 0 });
    } catch (e) {
      const why = reason(e);
      out.push({ line: `훅 ${path} ${/error: 404/.test(why) ? '없음' : `미확인(${why})`}`, hit: false });
    }
  }
  return out;
}

export async function readmes(repos, dir, run) {
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const r of repos) {
    const repo = r.replace(/^https:\/\/github\.com\//, '').replace(/(\.git)?\/?$/, '');
    try {
      const { body, os, security } = readmeDigest(await run('curl', [raw(repo, 'README.md')]));
      const hooks = await pluginHooks(repo, run);
      const n = security.length + hooks.filter((h) => h.hit).length;
      const file = fileOf(dir, repo);
      writeFileSync(file, [
        `# ${repo} README — 본문 80줄(배지 · HTML 거름 · 원본 행 번호)`, '', ...body, '',
        '## OS 행 (원본 행 번호)', ...(os.length ? os : [NO_OS]), '',
        `## 보안 행 ${n}개 (원본 행 번호 · 플러그인 훅)`, ...(security.length ? security : ['README 에 보안 행 없음']), ...hooks.map((h) => h.line),
      ].join('\n') + '\n');
      out.push({ repo, file, os: os.slice(0, 5).map((l) => l.slice(0, 120)).join(' · ') || NO_OS });
    } catch (e) {
      out.push({ repo, error: reason(e) });
    }
  }
  return out;
}

// 소식지 검사용 — 그 저장소 README 파일의 보안 행 수, 파일이 없으면(readme.mjs 를 안 거쳤으면) null
export const securityCount = (dir) => (repo) => {
  const file = fileOf(dir, repo);
  return existsSync(file) ? Number(readFileSync(file, 'utf8').match(/^## 보안 행 (\d+)개/m)?.[1] ?? 0) : null;
};
