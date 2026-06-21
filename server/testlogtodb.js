const { GetMarket,} = require('./util');
const fs = require('fs');
const path = require('path');
const QueryByMarket = (marketfncd, query, params = []) => {
    return new Promise((resolve, reject) => {
        marketfncd((connd) => {
            connd.query(query, params, (err, data) => {
                connd.release();

                if (err) {
                    reject(err);
                    return;
                }

                resolve(data);
            });
        });
    });
};

const ParseTradeLogLine = (line) => {
    if (line.startsWith('BUYS ')) {
        const m = line.match(
            /^BUYS\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+\S+\s+(a\d{6})\s+.*?\s+([0-9.]+):([0-9.]+)\s+x\s+(\d+)=.*?\s+A:([0-9.]+)/
        );

        if (!m) return null;

        return {
            tradetype: 'buy',
            ticker: m[6],
            date: `${m[1]}${m[2]}${m[3]}`,
            time: `${m[4]}${m[5]}`,
            price: Number(m[8]),
            amount: Number(m[9]),
            capital: Number(m[10]),
        };
    }

    if (line.startsWith('SELL ')) {
        const m = line.match(
            /^SELL\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+\S+\s+(a\d{6})\s+.*?\s+[0-9.]+>>[0-9.]+:([0-9.]+)\*(\d+).*?\s+A:([0-9.]+)/
        );

        if (!m) return null;

        return {
            tradetype: 'sel',
            ticker: m[6],
            date: `${m[1]}${m[2]}${m[3]}`,
            time: `${m[4]}${m[5]}`,
            price: Number(m[7]),
            amount: Number(m[8]),
            capital: Number(m[9]),
        };
    }

    return null;
};

const SaveTradeLogFolderToDb = async (db_id, folderpath) => {
    const files = fs.readdirSync(folderpath)
        .filter(filename => filename.endsWith('.txt'))
        .map(filename => path.join(folderpath, filename));

    const total = files.length;

    console.log(`총 ${total}개 파일 저장 시작`);

    const marketfncd = GetMarket(db_id, 'd');
    await QueryByMarket(marketfncd, `CREATE DATABASE IF NOT EXISTS simtrade_log`);
    await QueryByMarket(marketfncd, `USE simtrade_log`);


    for (let i = 0; i < files.length; i++) {
        const filepath = files[i];
        const percent = (((i + 1) / total) * 100).toFixed(2);

        console.log(`[${i + 1}/${total}] ${percent}% ${path.basename(filepath)}`);

        try {
            await SaveTradeLogToDb(marketfncd, db_id, filepath);
        } catch (err) {
            console.error(`[ERROR] ${path.basename(filepath)} 저장 실패`);
            console.error(err);
        }
    }

    console.log(`전체 저장 완료: ${total}개`);
};

const SaveTradeLogToDb = async (marketfncd, db_id, filepath) => {

    const text = require('fs').readFileSync(filepath, 'utf8');
    const lines = text.split(/\r?\n/);

    const trades = lines
        .map(ParseTradeLogLine)
        .filter(Boolean);

    if (trades.length <= 0) {
        console.log('저장할 매매 로그 없음');
        return;
    }

    const ticker = trades[0].ticker;

    if (!/^a\d{6}$/.test(ticker)) {
        throw new Error(`invalid ticker: ${ticker}`);
    }


    await QueryByMarket(marketfncd, `
        CREATE TABLE IF NOT EXISTS \`${ticker}\` (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tradetype VARCHAR(10) NOT NULL,
            date CHAR(8) NOT NULL,
            time CHAR(4) NOT NULL,
            capital DECIMAL(24, 6) NOT NULL,
            amount INT NOT NULL,
            price DECIMAL(20, 6) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await QueryByMarket(marketfncd, `TRUNCATE TABLE \`${ticker}\``);

    // for (const trade of trades) {
    //     await QueryByMarket(marketfncd, `
    //         INSERT INTO \`${ticker}\`
    //             (tradetype, date, time, capital, amount, price)
    //         VALUES
    //             (?, ?, ?, ?, ?, ?)
    //     `, [
    //         trade.tradetype,
    //         trade.date,
    //         trade.time,
    //         trade.capital,
    //         trade.amount,
    //         trade.price,
    //     ]);
    // }
    const values = trades.map(trade => [
        trade.tradetype,
        trade.date,
        trade.time,
        trade.capital,
        trade.amount,
        trade.price,
    ]);
    
    await QueryByMarket(marketfncd, `
        INSERT INTO simtrade_log.\`${ticker}\`
            (tradetype, date, time, capital, amount, price)
        VALUES ?
    `, [values]);

    console.log(`${ticker} 저장 완료: ${trades.length}건`);
};

module.exports = {SaveTradeLogFolderToDb}