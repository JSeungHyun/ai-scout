// GitHub 저장소 README — 읽는 깊이(본문 80줄 + OS 행 전체 grep)를 도구가 정해 파일로 남긴다
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reason } from './collect.mjs';

const OS = /windows|winget|powershell|wsl|macos|linux/i;
const NO_OS = 'README 에 OS 언급 없음';

// 첫 줄들이 배지 · HTML 뿐이어도 본문이 나오게 거른다. OS 행은 거르기 전 원본 행 번호로
export function readmeDigest(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return {
    body: lines.filter((l) => !/^\s*<|!\[/.test(l)).slice(0, 80),
    os: lines.flatMap((l, i) => (OS.test(l) ? [`${i + 1}: ${l.trim().slice(0, 200)}`] : [])).slice(0, 10),
  };
}

export async function readmes(repos, dir, run) {
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const r of repos) {
    const repo = r.replace(/^https:\/\/github\.com\//, '').replace(/(\.git)?\/?$/, '');
    try {
      const { body, os } = readmeDigest(await run('curl', [`https://raw.githubusercontent.com/${repo}/HEAD/README.md`]));
      const file = join(dir, `${repo.replace('/', '__')}.md`);
      writeFileSync(file, `# ${repo} README — 본문 80줄(배지 · HTML 거름)\n\n${body.join('\n')}\n\n## OS 행 (원본 행 번호)\n${os.join('\n') || NO_OS}\n`);
      out.push({ repo, file, os: os.slice(0, 5).map((l) => l.slice(0, 120)).join(' · ') || NO_OS });
    } catch (e) {
      out.push({ repo, error: reason(e) });
    }
  }
  return out;
}
