#!/usr/bin/env node
// 연결 후보: node tools/link.mjs --profile profile.md --digest <소식지 JSON> --out <파일>
// --out 에 { docs: [{ url, open: ["13: …"], words }], links: [{ id, line, word, text, doc, at }] } — 하네스가 없는 프로필이면 둘 다 빈 목록
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { link } from '../lib/link.mjs';
import { reason } from '../lib/collect.mjs';
import { run } from '../lib/run.mjs';

const { values: a } = parseArgs({ options: { profile: { type: 'string' }, digest: { type: 'string' }, out: { type: 'string' } } });
if (!a.profile || !a.digest || !a.out) {
  process.stderr.write('usage: link.mjs --profile profile.md --digest <소식지 JSON> --out <파일>\n');
  process.exit(2);
}
const say = (s) => process.stdout.write(`${s}\n`);
try {
  const r = await link(readFileSync(a.profile, 'utf8'), JSON.parse(readFileSync(a.digest, 'utf8')), run);
  writeFileSync(a.out, `${JSON.stringify(r, null, 1)}\n`);
  const sum = (k) => r.docs.reduce((n, d) => n + d[k].length, 0);
  say(`하네스 문서 ${r.docs.length}곳 · 열린 줄 ${sum('open')} · 낱말 ${sum('words')} · 연결 후보 ${r.links.length}건 → ${a.out}`);
  for (const l of r.links) say(`- ${l.id} CHANGELOG ${l.line}행 \`${l.word}\` ↔ ${l.doc.split('/').pop()}:${l.at.join(',')}`);
} catch (e) {
  process.stderr.write(`하네스 문서를 못 읽었다: ${reason(e)}\n`);
  process.exit(1);
}
