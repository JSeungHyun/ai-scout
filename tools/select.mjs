#!/usr/bin/env node
// 선택: node tools/select.mjs <scores.json> --date YYYY-MM-DD [--threshold 5] [--cap 7] [--near 0]
// stdout 에 보고서 JSON { date, issue: null, threshold, cap, items, nearMiss }
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { select } from '../lib/score.mjs';

const { values: a, positionals: [file] } = parseArgs({
  allowPositionals: true,
  options: { date: { type: 'string' }, threshold: { type: 'string', default: '5' }, cap: { type: 'string', default: '7' }, near: { type: 'string', default: '0' } },
});
if (!file || !a.date) {
  process.stderr.write('usage: select.mjs <scores.json> --date YYYY-MM-DD [--threshold 5] [--cap 7] [--near 0]\n');
  process.exit(2);
}
const [threshold, cap, near] = [a.threshold, a.cap, a.near].map(Number);
try {
  const r = select(JSON.parse(readFileSync(file, 'utf8')), { threshold, cap, near });
  process.stdout.write(`${JSON.stringify({ date: a.date, issue: null, threshold, cap, ...r }, null, 1)}\n`);
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}
