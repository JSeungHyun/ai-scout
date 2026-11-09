// 연결 후보 — 하네스 문서의 열린 줄과 소식지 공식 판 절 줄이 같은 식별자로 닿는 자리. details 밖 변경도 개인 층 앞에 놓인다(11-09: SendMessage 를 놓쳤다)
const OPEN = /⚠|⏸|^- 보류|^- \[ \]/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 「겪은 문제」 절의 raw 기준 주소 + 백틱 .md 경로 — 기준 주소가 없으면 하네스가 없는 프로필
export function harnessDocs(profile) {
  const sec = profile.replace(/\r\n/g, '\n').split(/^## /m).find((s) => s.startsWith('겪은 문제')) ?? '';
  const ticks = [...sec.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]);
  const base = ticks.find((t) => /^https:\/\/\S+\/$/.test(t));
  return base ? ticks.filter((t) => t.endsWith('.md')).map((t) => (t.startsWith('https://') ? t : base + t)) : [];
}

// 대문자 · _ · - 를 품은 6자 이상 백틱 낱말만 — 일반 낱말(check · note)까지 넣으면 29건이 걸리고 거의 다 잡음이었다(11-09 검증 시험)
function openWords(text) {
  const open = text.replace(/\r\n/g, '\n').split('\n').map((t, i) => [i + 1, t]).filter(([, t]) => OPEN.test(t));
  const words = new Map();
  for (const [n, t] of open) for (const m of t.matchAll(/`([^`]{3,40})`/g)) {
    const k = m[1].replace(/^\//, '').split(/[ (]/)[0];
    if (k.length >= 6 && /[A-Z_-]/.test(k.slice(1))) words.set(k, [...new Set([...(words.get(k) ?? []), n])]);
  }
  return { open: open.map(([n, t]) => `${n}: ${t}`), words };
}

export async function link(profile, digest, run) {
  const docs = [];
  for (const url of harnessDocs(profile)) docs.push({ url, ...openWords(await run('curl', [url])) });
  const links = [];
  for (const c of digest.candidates) for (const l of c.lines ?? []) {
    const [, n, text] = l.match(/^(\d+): (.*)$/);
    for (const d of docs) for (const [word, at] of d.words) {
      if (new RegExp(`(^|[^\\w-])${esc(word)}($|[^\\w-])`).test(text)) links.push({ id: c.id, line: Number(n), word, text, doc: d.url, at });
    }
  }
  return { docs: docs.map((d) => ({ url: d.url, open: d.open, words: [...d.words.keys()] })), links };
}
