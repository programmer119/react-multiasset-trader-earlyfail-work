const fs = require('fs');
const path = require('path');
const dbTopstocklistlog = require('../server/config/db_topstocklistlog');
const { IsETF } = require('../server/tradeutilcommon');

const startDate = String(process.env.start_date || process.argv[2] || '20221026').replace(/[^0-9]/g, '');
const endDate = String(process.env.end_date || process.argv[3] || '20260529').replace(/[^0-9]/g, '');
const rankLimit = Number(process.env.rank_limit || process.argv[4] || 500);
const markets = new Set(['KOSPI', 'KOSDAQ']);

const query = (sql, params = []) => new Promise((resolve, reject) => {
  dbTopstocklistlog((conn) => {
    conn.query(sql, params, (err, rows) => {
      conn.release();
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
});

const tableDate = (tableName) => {
  const match = String(tableName).match(/^kosstock_(\d{8})$/);
  return match ? match[1] : '';
};

const escapeIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const parseRank = (rankstr) => {
  const parts = String(rankstr || '').trim().split(/\s+/);
  if (parts.length < 2) return null;
  const market = parts[0];
  const rank = Number(parts[parts.length - 1]);
  if (!markets.has(market) || !Number.isFinite(rank)) return null;
  return { market, rank };
};

const writeCsv = (filePath, rows) => {
  const header = [
    'ticker',
    'name',
    'markets',
    'firstDate',
    'lastDate',
    'hitDays',
    'bestRank',
    'bestRankMarket',
    'bestRankDate',
    'maxMarketcap',
  ];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    lines.push(header.map((key) => {
      const value = row[key] == null ? '' : String(row[key]);
      return `"${value.replace(/"/g, '""')}"`;
    }).join(','));
  });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
};

const main = async () => {
  if (startDate.length !== 8 || endDate.length !== 8 || !Number.isFinite(rankLimit)) {
    throw new Error(`bad args start=${startDate} end=${endDate} rank=${rankLimit}`);
  }

  const tableRows = await query('SHOW TABLES');
  const tables = tableRows
    .map((row) => Object.values(row)[0])
    .map((name) => ({ name, date: tableDate(name) }))
    .filter((item) => item.date && item.date >= startDate && item.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const candidates = new Map();
  let rowHits = 0;
  let etfSkipped = 0;

  for (const table of tables) {
    const sql = `
      SELECT ticker, name, rankstr, marketcap
      FROM ${escapeIdentifier(table.name)}
      WHERE USE1 != 'up'
        AND USE1 != 'p'
        AND CAST(SUBSTRING_INDEX(rankstr, ' ', -1) AS UNSIGNED) <= ?
        AND CAST(SUBSTRING_INDEX(rankstr, ' ', 1) AS CHAR) IN ('KOSPI', 'KOSDAQ')
    `;
    const rows = await query(sql, [rankLimit]);
    for (const row of rows) {
      const parsed = parseRank(row.rankstr);
      if (!parsed || parsed.rank > rankLimit) continue;
      if (IsETF(row.name || '')) {
        ++etfSkipped;
        continue;
      }

      const ticker = String(row.ticker || '').toLowerCase();
      if (!ticker) continue;
      ++rowHits;

      if (!candidates.has(ticker)) {
        candidates.set(ticker, {
          ticker,
          name: row.name || '',
          markets: new Set(),
          firstDate: table.date,
          lastDate: table.date,
          hitDays: 0,
          bestRank: parsed.rank,
          bestRankMarket: parsed.market,
          bestRankDate: table.date,
          maxMarketcap: Number(row.marketcap) || 0,
        });
      }

      const item = candidates.get(ticker);
      item.name = item.name || row.name || '';
      item.markets.add(parsed.market);
      item.firstDate = item.firstDate < table.date ? item.firstDate : table.date;
      item.lastDate = item.lastDate > table.date ? item.lastDate : table.date;
      item.hitDays += 1;
      if (parsed.rank < item.bestRank) {
        item.bestRank = parsed.rank;
        item.bestRankMarket = parsed.market;
        item.bestRankDate = table.date;
      }
      item.maxMarketcap = Math.max(item.maxMarketcap, Number(row.marketcap) || 0);
    }
  }

  const resultRows = Array.from(candidates.values())
    .map((item) => ({ ...item, markets: Array.from(item.markets).sort().join('|') }))
    .sort((a, b) => {
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
      return a.ticker.localeCompare(b.ticker);
    });

  const outDir = path.resolve(__dirname, '..', 'runlogs');
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const base = `top500_non_etf_candidates_${startDate}_${endDate}_${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const csvPath = path.join(outDir, `${base}.csv`);

  const summary = {
    startDate,
    endDate,
    rankLimit,
    tableCount: tables.length,
    firstTableDate: tables[0] ? tables[0].date : null,
    lastTableDate: tables[tables.length - 1] ? tables[tables.length - 1].date : null,
    rowHits,
    etfSkipped,
    candidateCount: resultRows.length,
    tickers: resultRows.map((row) => row.ticker),
    rows: resultRows,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  writeCsv(csvPath, resultRows);

  console.log(JSON.stringify({
    startDate,
    endDate,
    rankLimit,
    tableCount: tables.length,
    firstTableDate: summary.firstTableDate,
    lastTableDate: summary.lastTableDate,
    rowHits,
    etfSkipped,
    candidateCount: resultRows.length,
    jsonPath,
    csvPath,
    first20: resultRows.slice(0, 20).map((row) => row.ticker),
  }, null, 2));
};

main().then(() => process.exit(0)).catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
