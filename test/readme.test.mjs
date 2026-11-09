import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readmeDigest, readmes } from '../lib/readme.mjs';

test('readmeDigest — 배지 · HTML 줄을 거르고 본문 80줄 (v0.1.3 은 셸 함수로 14줄씩만 읽었다)', () => {
  const md = ['<p align="center">', '[![ci](https://x/badge.svg)](https://x)', '# 이름', ...Array.from({ length: 100 }, (_, i) => `본문 ${i}`)].join('\r\n');
  const { body } = readmeDigest(md);
  assert.equal(body.length, 80);
  assert.equal(body[0], '# 이름');
  assert.equal(body[79], '본문 78');
});

test('readmeDigest — OS 행은 원본 행 번호와 함께 (배지 줄에 있어도 센다)', () => {
  const md = '# 이름\n\n![win](windows.svg)\n설치\nWorks on macOS and Linux.\n끝';
  assert.deepEqual(readmeDigest(md).os, ['3: ![win](windows.svg)', '5: Works on macOS and Linux.']);
  assert.deepEqual(readmeDigest('# 이름\n본문').os, []);
});

test('readmes — 저장소마다 파일 하나와 OS 근거 한 줄, 404 는 실패로', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const e404 = Object.assign(new Error('Command failed'), { stderr: 'curl: (22) The requested URL returned error: 404\n' });
  const calls = [];
  const run = async (cmd, args) => {
    calls.push(args[0]);
    if (args[0].includes('/o/gone/')) throw e404;
    return args[0].includes('/o/a/') ? '# A\nWindows 지원' : '# B\n본문';
  };
  const r = await readmes(['o/a', 'https://github.com/o/b', 'o/gone'], dir, run);
  assert.deepEqual(calls, ['https://raw.githubusercontent.com/o/a/HEAD/README.md', 'https://raw.githubusercontent.com/o/b/HEAD/README.md', 'https://raw.githubusercontent.com/o/gone/HEAD/README.md']);
  assert.deepEqual(r, [
    { repo: 'o/a', file: join(dir, 'o__a.md'), os: '2: Windows 지원' },
    { repo: 'o/b', file: join(dir, 'o__b.md'), os: 'README 에 OS 언급 없음' },
    { repo: 'o/gone', error: 'curl: (22) The requested URL returned error: 404' },
  ]);
  const a = readFileSync(join(dir, 'o__a.md'), 'utf8');
  assert.match(a, /# A/);
  assert.match(a, /## OS 행 \(원본 행 번호\)\n2: Windows 지원/);
  assert.match(readFileSync(join(dir, 'o__b.md'), 'utf8'), /README 에 OS 언급 없음/);
  assert.equal(existsSync(join(dir, 'o__gone.md')), false);
});
