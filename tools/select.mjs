#!/usr/bin/env node
// 선택: node tools/select.mjs <scores.json> --digest <소식지 JSON> --links <link.mjs 출력> --date YYYY-MM-DD --expect N --out <reports/날짜.json> [--threshold 5] [--cap 7] [--near 0]
// 성공해야 --out 에 보고서 JSON { date, issue: null, threshold, cap, expect, digest, items, nearMiss, seen, rescored } 를 쓴다
// --out 이 이미 있으면 첫 결과로 보고, 바뀐 점수에는 rescore 이유를 요구한다
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { select } from '../lib/score.mjs';

const { values: a, positionals: [file] } = parseArgs({
  allowPositionals: true,
  options: { date: { type: 'string' }, threshold: { type: 'string', default: '5' }, cap: { type: 'string', default: '7' }, near: { type: 'string', default: '0' }, expect: { type: 'string' }, digest: { type: 'string' }, links: { type: 'string' }, out: { type: 'string' } },
});
// --expect · --links 가 선택이면 루틴이 빠뜨릴 때 항목 수 · 연결 후보 검사가 조용히 꺼진다
if (!file || !a.date || a.expect === undefined || !a.digest || !a.links || !a.out) {
  process.stderr.write('usage: select.mjs <scores.json> --digest <소식지 JSON> --links <link.mjs 출력> --date YYYY-MM-DD --expect N --out <reports/날짜.json> [--threshold 5] [--cap 7] [--near 0]\n');
  process.exit(2);
}
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const [threshold, cap, near, expect] = [a.threshold, a.cap, a.near, a.expect].map(Number);
// 소식지 이름은 그 주 월요일(UTC) — 지난 소식지로 추천하지 않게 문장만이 아니라 여기서도 막는다
const week = new Date(`${a.date}T00:00:00Z`);
week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
try {
  const digest = read(a.digest);
  const monday = week.toISOString().slice(0, 10);
  if (digest.date !== monday) throw new Error(`소식지 ${digest.date} 는 이번 주(${monday}) 것이 아니다 — 「소식지 없음」 알림을 보내고 멈춘다`);
  const { links } = read(a.links);
  if (!Array.isArray(links)) throw new Error(`${a.links} 는 tools/link.mjs 출력이어야 한다 (links 배열이 없다)`);
  const prev = existsSync(a.out) ? read(a.out) : undefined;
  const r = select(read(file), { threshold, cap, near, expect, digest, links, prev });
  writeFileSync(a.out, `${JSON.stringify({ date: a.date, issue: null, threshold, cap, expect, digest: { date: digest.date, url: digest.url }, ...r }, null, 1)}\n`);
  process.stdout.write(`추천 ${r.items.length} · 아깝게 ${r.nearMiss.length} · 본 것 ${r.seen.length} · 재채점 ${r.rescored.length} → ${a.out}\n`);
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}
