#!/usr/bin/env node
// 판정: node tools/judge.mjs --report <reports/날짜.json> --comments <file>
// comments = 내장 GitHub MCP issue_read get_comments 결과 그대로 ([{ body, user: { login }, author_association }])
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { judge } from '../lib/judge.mjs';

const { values: a } = parseArgs({ options: { report: { type: 'string' }, comments: { type: 'string' } } });
if (!a.report || !a.comments) {
  process.stderr.write('usage: judge.mjs --report <reports/날짜.json> --comments <file>\n');
  process.exit(2);
}
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
process.stdout.write(`${JSON.stringify(judge(read(a.report), read(a.comments)), null, 1)}\n`);
