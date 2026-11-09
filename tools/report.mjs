#!/usr/bin/env node
// 개인 보고서 md: node tools/report.mjs <reports/날짜.json> [--notes <나머지 절 md>]   (stdout)
// 추천 · 아깝게 빠진 것 · 본 것 · 재채점 절은 JSON 에서, 그 뒤에 notes 를 그대로 붙인다
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { renderReport } from '../lib/report.mjs';

const { values: a, positionals: [file] } = parseArgs({ allowPositionals: true, options: { notes: { type: 'string' } } });
if (!file) {
  process.stderr.write('usage: report.mjs <reports/날짜.json> [--notes <md>]\n');
  process.exit(2);
}
process.stdout.write(renderReport(JSON.parse(readFileSync(file, 'utf8')), a.notes ? readFileSync(a.notes, 'utf8') : ''));
