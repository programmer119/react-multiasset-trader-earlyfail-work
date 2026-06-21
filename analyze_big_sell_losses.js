const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, 'logsave', '06_09');
const files = {
  130: '_130_0859_4001.txt',
  135: '_135_0858_4002.txt',
  145: '_145_0920_4002.txt',
  140: '_140_0859_4003.txt',
  150: '_150_0920_4001.txt',
  155: '_155_0920_4003.txt',
};

const groups = {
  low: ['130', '135', '145'],
  high: ['140', '150', '155'],
};

function parseFile(file) {
  const text = fs.readFileSync(path.join(base, file), 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^(SELL|SELR) /.test(line)) continue;
    const m = line.match(/^(SELL|SELR)\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(\S+)\s+(a\d+)\s+(.+?)\s+(KOSPI|KOSDAQ)\s+.*?\s+([+-]\d+(?:\.\d+)?)%/);
    if (!m) continue;
    rows.push({
      type: m[1],
      date: m[2],
      time: m[3],
      reason: m[4],
      ticker: m[5],
      name: m[6].trim(),
      market: m[7],
      pct: Number(m[8]),
      line,
    });
  }
  return rows;
}

const all = {};
for (const [top, file] of Object.entries(files)) all[top] = parseFile(file);

for (const [group, tops] of Object.entries(groups)) {
  console.log(`\n[${group}]`);
  for (const top of tops) {
    const losses = all[top].filter((r) => r.pct <= -30).sort((a, b) => a.pct - b.pct);
    const tickers = new Set(losses.map((r) => `${r.ticker} ${r.name}`));
    console.log(`top${top}: <=-30 count=${losses.length}, tickers=${tickers.size}`);
    for (const r of losses.slice(0, 15)) {
      console.log(`  ${r.pct.toFixed(2)}% ${r.date} ${r.time} ${r.reason} ${r.ticker} ${r.name}`);
    }
  }
}

const tickerSummary = {};
for (const [top, rows] of Object.entries(all)) {
  for (const r of rows.filter((x) => x.pct <= -30)) {
    const key = `${r.ticker} ${r.name}`;
    tickerSummary[key] ??= { key, count: 0, worst: 0, tops: new Set(), reasons: {}, rows: [] };
    const s = tickerSummary[key];
    s.count += 1;
    s.worst = Math.min(s.worst, r.pct);
    s.tops.add(top);
    s.reasons[r.reason] = (s.reasons[r.reason] || 0) + 1;
    s.rows.push({ top, ...r });
  }
}

console.log('\n[all tickers by big-loss count]');
Object.values(tickerSummary)
  .sort((a, b) => b.count - a.count || a.worst - b.worst)
  .slice(0, 30)
  .forEach((s) => {
    const reasons = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(',');
    console.log(`${s.count}x worst=${s.worst.toFixed(2)}% tops=${[...s.tops].sort().join('/')} ${s.key} reasons=${reasons}`);
  });
