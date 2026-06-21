const mysql = require('mysql');
const dbpass = require('./server/config/dbpassword');

const cases = [
  { ticker: 'a328130', name: '루닛', buy: '20260409', sell: '20260430' },
  { ticker: 'a469610', name: '이노테크', buy: '20251216', sell: '20251216' },
  { ticker: 'a166480', name: '코아스템켐온', buy: '20241218', sell: '20241219' },
];

function pool(database) {
  return mysql.createPool({
    host: dbpass.host,
    user: dbpass.user,
    password: dbpass.password,
    database,
    connectionLimit: 2,
  });
}

function query(p, sql, args) {
  return new Promise((resolve, reject) => {
    p.query(sql, args, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function main() {
  const daily = pool('stocklistdayall');
  const minute = pool('stocklist');
  for (const c of cases) {
    console.log(`\n[${c.ticker} ${c.name}] ${c.buy} -> ${c.sell}`);
    const days = await query(daily, `SELECT date, open, high, low, close FROM ?? WHERE date BETWEEN ? AND ? ORDER BY date`, [c.ticker, c.buy, c.sell]);
    console.log('daily');
    for (const r of days) console.log(JSON.stringify(r));
    const mins = await query(minute, `SELECT date, time, close FROM ?? WHERE date IN (?, ?) AND time IN ('0900','0901','0902','0903','1530') ORDER BY date,time`, [c.ticker, c.buy, c.sell]);
    console.log('minute-open-close');
    for (const r of mins) console.log(JSON.stringify(r));
  }
  daily.end();
  minute.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
