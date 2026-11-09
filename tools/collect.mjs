#!/usr/bin/env node
// 원천 수집: node tools/collect.mjs --sources a.json[,b.json] --snapshots <dir> --out <file> [--texts <dir>] [--since YYYY-MM-DD]
//          node tools/collect.mjs --sources a.json[,b.json] --check   (스냅숏 없이 원천별 개수만)
// --texts: 본문(CHANGELOG 절)이 있는 새 항목을 <dir>/<원천>/<id>.md 로
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { loadSources, collect, fetchItems, zeroOk, reason, writeTexts } from '../lib/collect.mjs';
import { run } from '../lib/run.mjs';

const { values: a } = parseArgs({ options: { sources: { type: 'string' }, snapshots: { type: 'string' }, out: { type: 'string' }, texts: { type: 'string' }, since: { type: 'string' }, check: { type: 'boolean' } } });
const say = (s) => process.stdout.write(`${s}\n`);
if (!a.sources || (!a.check && (!a.snapshots || !a.out))) {
  process.stderr.write('usage: collect.mjs --sources a.json[,b.json] (--snapshots <dir> --out <file> [--texts <dir>] [--since YYYY-MM-DD] | --check)\n');
  process.exit(2);
}
const since = a.since ?? new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const sources = loadSources(a.sources.split(','));

if (a.check) {
  let bad = 0;
  for (const s of sources) {
    try {
      const n = (await fetchItems(s, since, run)).length;
      if (!n && !zeroOk(s)) bad++;
      say(`${s.id} ${n}`);
    } catch (e) {
      bad++;
      say(`${s.id} 실패: ${reason(e)}`);
    }
  }
  process.exit(bad ? 1 : 0);
}

const r = await collect({ sources, snapshotsDir: a.snapshots, since, run });
writeFileSync(a.out, `${JSON.stringify(r, null, 1)}\n`);
if (a.texts) writeTexts(r, a.texts);
for (const s of r.sources) say(`${s.id} ${s.ok ? `새것 ${s.newItems.length}` : `실패: ${s.error}`}`);
process.exit(r.sources.every((s) => !s.ok) ? 1 : 0);
