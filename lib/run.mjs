// 외부 호출 — fetch 대신 curl 로 클라우드 프록시를 확실히 따른다
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CURL = ['-sSL', '--fail', '--max-time', '20', '-A', 'ai-scout'];

export const run = async (cmd, args) => (await exec(cmd, cmd === 'curl' ? [...CURL, ...args] : args, { timeout: 30000, maxBuffer: 64 << 20 })).stdout;
