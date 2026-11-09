#!/usr/bin/env node
// 원천 수집: node tools/collect.mjs --sources a.json[,b.json] --snapshots <dir> --out <file> [--since YYYY-MM-DD]
//          node tools/collect.mjs --sources a.json[,b.json] --check   (스냅숏 없이 원천별 개수만)
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { loadSources, collect, fetchItems, zeroOk, reason } from '../lib/collect.mjs';

// fetch 대신 curl — 클라우드 프록시를 확실히 따른다
const exec = promisify(execFile);
const CURL = ['-sSL', '--fail', '--max-time', '20', '-A', 'ai-scout'];
const run = async (cmd, args) => (await exec(cmd, cmd === 'curl' ? [...CURL, ...args] : args, { timeout: 30000, maxBuffer: 64 << 20 })).stdout;

const { values: a } = parseArgs({ options: { sources: { type: 'string' }, snapshots: { type: 'string' }, out: { type: 'string' }, since: { type: 'string' }, check: { type: 'boolean' } } });
const say = (s) => process.stdout.write(`${s}\n`);
if (!a.sources || (!a.check && (!a.snapshots || !a.out))) {
  process.stderr.write('usage: collect.mjs --sources a.json[,b.json] (--snapshots <dir> --out <file> [--since YYYY-MM-DD] | --check)\n');
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
for (const s of r.sources) say(`${s.id} ${s.ok ? `새것 ${s.newItems.length}` : `실패: ${s.error}`}`);
process.exit(r.sources.every((s) => !s.ok) ? 1 : 0);
