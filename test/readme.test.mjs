import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readmeDigest, readmes, securityCount } from '../lib/readme.mjs';

test('readmeDigest — 배지 · HTML 줄을 거르고 본문 80줄, 원본 행 번호를 붙인다(details 가 행 번호로 인용하게)', () => {
  const md = ['<p align="center">', '[![ci](https://x/badge.svg)](https://x)', '# 이름', ...Array.from({ length: 100 }, (_, i) => `본문 ${i}`)].join('\r\n');
  const { body } = readmeDigest(md);
  assert.equal(body.length, 80);
  assert.equal(body[0], '3: # 이름');
  assert.equal(body[79], '82: 본문 78');
});

test('readmeDigest — OS 행은 원본 행 번호와 함께 (배지 줄에 있어도 센다)', () => {
  const md = '# 이름\n\n![Windows](badge.svg)\n설치\nWorks on macOS and Linux.\n끝';
  assert.deepEqual(readmeDigest(md).os, ['3: ![Windows](badge.svg)', '5: Works on macOS and Linux.']);
  assert.deepEqual(readmeDigest('# 이름\n본문').os, []);
});

test('readmeDigest — OS 는 대소문자 · 낱말 경계로 (11-09 오탐: 포럼 「LINUX DO」 · 「short windows first」)', () => {
  const md = 'Join LINUX DO forum\nRetry short windows first\nWindows 지원\nuse winget or WSL\nmacOS only\nLinuxbrew';
  assert.deepEqual(readmeDigest(md).os, ['3: Windows 지원', '4: use winget or WSL', '5: macOS only']);
});

test('readmeDigest — 보안 행(훅 · 설정 · 텔레메트리 · 로그인 · 파이프 설치 · npx)을 원본 행 번호로 (11-09: 훅이 README 80줄 밖에만 있어 ⚠️ 를 놓쳤다)', () => {
  const md = [
    '# 이름', 'Installs a post-commit hook', 'Anonymous Telemetry is on by default', 'curl -fsSL https://x/install.sh | bash',
    'iwr https://x/i.ps1 | iex', 'irm https://x/i.ps1 | iex', 'npx tool init', 'Edits ~/.claude/settings.json', 'Login with GitHub', 'reads browser cookies',
    'opt out of analytics', 'curl https://api.example.com/v1', '평범한 줄',
  ].join('\n');
  assert.deepEqual(readmeDigest(md).security.map((l) => l.split(':')[0]), ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  assert.deepEqual(readmeDigest('# 이름\n본문').security, []);
});

const e404 = Object.assign(new Error('Command failed'), { stderr: 'curl: (22) The requested URL returned error: 404\n' });

test('readmes — 저장소마다 파일 하나(본문 · OS 행 · 보안 행)와 stdout 용 한 줄, 404 는 실패로', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const calls = [];
  const run = async (cmd, args) => {
    calls.push(args[0]);
    if (args[0].includes('/o/gone/') || args[0].endsWith('marketplace.json')) throw e404;
    return args[0].includes('/o/a/') ? '# A\nWindows 지원\nnpx a init' : '# B\n본문';
  };
  const r = await readmes(['o/a', 'https://github.com/o/b', 'o/gone'], dir, run);
  assert.deepEqual(calls, [
    'https://raw.githubusercontent.com/o/a/HEAD/README.md', 'https://raw.githubusercontent.com/o/a/HEAD/.claude-plugin/marketplace.json',
    'https://raw.githubusercontent.com/o/b/HEAD/README.md', 'https://raw.githubusercontent.com/o/b/HEAD/.claude-plugin/marketplace.json',
    'https://raw.githubusercontent.com/o/gone/HEAD/README.md',
  ]);
  assert.deepEqual(r, [
    { repo: 'o/a', file: join(dir, 'o__a.md'), os: '2: Windows 지원' },
    { repo: 'o/b', file: join(dir, 'o__b.md'), os: 'README 에 OS 언급 없음' },
    { repo: 'o/gone', error: 'curl: (22) The requested URL returned error: 404' },
  ]);
  const a = readFileSync(join(dir, 'o__a.md'), 'utf8');
  assert.match(a, /\n1: # A\n2: Windows 지원\n/);
  assert.match(a, /## OS 행 \(원본 행 번호\)\n2: Windows 지원/);
  assert.match(a, /## 보안 행 1개 \(원본 행 번호 · 플러그인 훅\)\n3: npx a init\n$/);
  assert.match(readFileSync(join(dir, 'o__b.md'), 'utf8'), /README 에 OS 언급 없음[\s\S]*## 보안 행 0개 .*\nREADME 에 보안 행 없음\n$/);
  assert.equal(existsSync(join(dir, 'o__gone.md')), false);
});

test('readmes — marketplace.json 이 있으면 플러그인 경로의 hooks/hooks.json 유무와 이벤트 이름 (11-09: 훅이 hooks.json 에만 있었다)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  const market = { metadata: { pluginRoot: './plugins' }, plugins: [{ name: 'p', source: './p' }, { name: 'q', source: 'q' }, { name: 'ext', source: { source: 'github', repo: 'x/y' } }] };
  const files = {
    'README.md': '# M\n본문',
    '.claude-plugin/marketplace.json': JSON.stringify(market),
    'plugins/p/hooks/hooks.json': JSON.stringify({ hooks: { PostToolUse: [], SessionStart: [] } }),
  };
  const run = async (cmd, args) => {
    const path = args[0].replace('https://raw.githubusercontent.com/o/m/HEAD/', '');
    if (!(path in files)) throw e404;
    return files[path];
  };
  const [r] = await readmes(['o/m'], dir, run);
  // 이벤트가 있는 hooks.json 도 보안 행으로 센다
  assert.match(readFileSync(r.file, 'utf8'), /## 보안 행 1개 .*\nREADME 에 보안 행 없음\n훅 plugins\/p\/hooks\/hooks\.json — PostToolUse · SessionStart\n훅 plugins\/q\/hooks\/hooks\.json 없음\n$/);
});

test('securityCount — 소식지 검사용: README 파일의 보안 행 수, 파일이 없으면 null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-'));
  await readmes(['o/a'], dir, async (cmd, args) => { if (args[0].endsWith('marketplace.json')) throw e404; return '# A\nnpx a\ncurl -s x | sh'; });
  const count = securityCount(dir);
  assert.equal(count('o/a'), 2);
  assert.equal(count('o/none'), null);
});
