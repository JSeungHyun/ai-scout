#!/usr/bin/env node
// 소식지 검사: node tools/digest.mjs --check <digest/날짜.json> --collect <collect --out 파일> --web <웹 발견 수>
// 소식지 md:   node tools/digest.mjs --render <digest/날짜.json>   (stdout)
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkDigest, picks, renderDigest } from '../lib/digest.mjs';

const { values: a } = parseArgs({ options: { check: { type: 'string' }, render: { type: 'string' }, collect: { type: 'string' }, web: { type: 'string' } } });
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

if (a.render) {
  process.stdout.write(renderDigest(read(a.render)));
  process.exit(0);
}
// --web 이 선택이면 루틴이 빠뜨릴 때 웹 발견 수 검사가 조용히 꺼진다
if (!a.check || !a.collect || !/^\d+$/.test(a.web ?? '')) {
  process.stderr.write('usage: digest.mjs --check <digest/날짜.json> --collect <collect 출력> --web <웹 발견 수> | --render <digest/날짜.json>\n');
  process.exit(2);
}
const d = read(a.check);
const errs = checkDigest(d, read(a.collect), Number(a.web));
if (errs.length) {
  process.stderr.write(errs.map((e) => `- ${e}\n`).join(''));
  process.exit(1);
}
process.stdout.write(`통과 · 후보 ${d.candidates.length}개 · 읽기 실패 ${d.unread.length}개 · 이런 것도 있어요 ${picks(d.candidates).length}건 · 개념 ${d.concepts.length}건\n`);
