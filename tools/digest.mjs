#!/usr/bin/env node
// 절 줄 채움: node tools/digest.mjs --lines <digest/날짜.json> --collect <collect --out 파일>   (CHANGELOG 절이 있는 판 후보에 lines — 같은 파일에 쓴다)
// 소식지 검사: node tools/digest.mjs --check <digest/날짜.json> --collect <collect --out 파일> --web <웹 발견 수> --readme <readme.mjs --out 폴더>
// 소식지 md:   node tools/digest.mjs --render <digest/날짜.json>   (stdout)
// 이슈 본문:   node tools/digest.mjs --issue <digest/날짜.json>    (stdout — md 그대로, GitHub 한도를 넘을 때만 후보 전체를 링크로)
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkDigest, issueBody, picks, renderDigest, withLines } from '../lib/digest.mjs';
import { securityCount } from '../lib/readme.mjs';

const { values: a } = parseArgs({ options: { lines: { type: 'string' }, check: { type: 'string' }, render: { type: 'string' }, issue: { type: 'string' }, collect: { type: 'string' }, web: { type: 'string' }, readme: { type: 'string' } } });
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const usage = () => {
  process.stderr.write('usage: digest.mjs --lines <digest/날짜.json> --collect <collect 출력> | --check <digest/날짜.json> --collect <collect 출력> --web <웹 발견 수> --readme <readme.mjs --out 폴더> | --render <digest/날짜.json> | --issue <digest/날짜.json>\n');
  process.exit(2);
};

if (a.render || a.issue) {
  process.stdout.write(a.render ? renderDigest(read(a.render)) : issueBody(read(a.issue)));
  process.exit(0);
}
if (a.lines) {
  if (!a.collect) usage();
  const d = withLines(read(a.lines), read(a.collect));
  writeFileSync(a.lines, `${JSON.stringify(d, null, 1)}\n`);
  process.stdout.write(`절 줄 채움 · ${d.candidates.filter((c) => c.lines).length}개 판 → ${a.lines}\n`);
  process.exit(0);
}
// --web · --readme 가 선택이면 루틴이 빠뜨릴 때 웹 발견 수 · 보안 행 검사가 조용히 꺼진다
if (!a.check || !a.collect || !/^\d+$/.test(a.web ?? '') || !a.readme) usage();
const d = read(a.check);
const errs = checkDigest(d, read(a.collect), Number(a.web), securityCount(a.readme));
if (errs.length) {
  process.stderr.write(errs.map((e) => `- ${e}\n`).join(''));
  process.exit(1);
}
process.stdout.write(`통과 · 후보 ${d.candidates.length}개 · 읽기 실패 ${d.unread.length}개 · 이런 것도 있어요 ${picks(d.candidates).length}건 · 개념 ${d.concepts.length}건\n`);
