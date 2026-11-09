#!/usr/bin/env node
// README 읽기: node tools/readme.mjs --out <dir> <소유자/저장소 | https://github.com/소유자/저장소> ...
// 저장소마다 <dir>/<소유자>__<저장소>.md (본문 80줄 · OS 행 · 보안 행 · 플러그인 훅) 와 stdout 한 줄(파일 · OS 근거 또는 실패)
import { parseArgs } from 'node:util';
import { readmes } from '../lib/readme.mjs';
import { run } from '../lib/run.mjs';

const { values: a, positionals: repos } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } });
if (!a.out || !repos.length) {
  process.stderr.write('usage: readme.mjs --out <dir> <소유자/저장소> ...\n');
  process.exit(2);
}
for (const r of await readmes(repos, a.out, run)) {
  process.stdout.write(r.error ? `${r.repo} 실패: ${r.error}\n` : `${r.repo} → ${r.file} · OS ${r.os}\n`);
}
