const db_tradelog = require('./config/db_tradelog')

function IsSafeTradeLogDbId(db_id) {
    return typeof db_id === 'string' && /^[A-Za-z0-9_]+$/.test(db_id);
}

function NormalizeTradeLogDateKey(value) {
    if (!value) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    }

    const dateKey = String(value).replace(/\D/g, '');
    return /^\d{8}$/.test(dateKey) ? dateKey : '';
}

function BuildTodayTradeLogTableName(db_id, dateKey) {
    if (!IsSafeTradeLogDbId(db_id)) return '';
    if (!/^\d{8}$/.test(dateKey)) return '';
    return `${db_id}_${dateKey.slice(0, 4)}_${dateKey.slice(4, 6)}_${dateKey.slice(6, 8)}`;
}

function NormalizeTradeTicker(ticker) {
    if (ticker === undefined || ticker === null) return '';
    const value = String(ticker).trim();
    if (/^\d{6}$/.test(value)) return `a${value}`;
    return value;
}

function NormalizeTradeTime(value) {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) {
        return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
    }

    const text = String(value).trim();
    const matched = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (!matched) return text;

    const parts = matched[1].split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${(parts[2] || '00').padStart(2, '0')}`;
}

function ToNumberOrZero(value) {
    if (value === undefined || value === null || value === '') return 0;
    const numberValue = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function PickFirstDefined(row, keys) {
    for (const key of keys) {
        if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return '';
}

function NormalizeTodayTradeRow(row, idx) {
    const longshort = String(PickFirstDefined(row, ['longshort', 'macdlongshort', 'reason', 'signal'])).trim();
    const sideRaw = String(PickFirstDefined(row, ['side', 'sell_buy_dvsn', 'sll_buy_dvsn_cd', 'tradetype', 'type'])).toUpperCase();
    let side = '';

    if (sideRaw === '01' || sideRaw.includes('SELL') || sideRaw.includes('SHORT')) side = 'SELL';
    else if (sideRaw === '02' || sideRaw.includes('BUY') || sideRaw.includes('LONG')) side = 'BUY';
    else if (longshort.toUpperCase().includes('SHORT')) side = 'SELL';
    else if (longshort.toUpperCase().includes('LONG')) side = 'BUY';

    const ticker = NormalizeTradeTicker(PickFirstDefined(row, ['ticker', 'code', 'symbol', 'pdno', 'stockcode']));
    const name = String(PickFirstDefined(row, ['name', 'stockname', 'prdt_name', 'company'])).trim();
    const time = NormalizeTradeTime(PickFirstDefined(row, ['time', 'datetime', 'date', 'created_at', 'updated_at']));
    const price = ToNumberOrZero(PickFirstDefined(row, ['price', 'avg_prvs', 'averagebuyprice', 'ord_unpr', 'ccld_prc']));
    const quantity = ToNumberOrZero(PickFirstDefined(row, ['quantity', 'qty', 'count', 'ord_qty', 'order_qty', 'ccld_qty']));
    const reason = String(PickFirstDefined(row, ['reason', 'longshort', 'macdlongshort', 'signal'])).trim();

    return {
        id: String(PickFirstDefined(row, ['id', 'odno', 'ord_no', 'order_no'])) || `${idx + 1}`,
        side,
        ticker,
        name,
        time,
        price,
        quantity,
        reason,
        longshort,
        raw: `${longshort || reason} ${ticker}${name ? ` (${name})` : ''}${time ? ` ${time}` : ''}${price ? ` P:${price}` : ''}`.trim()
    };
}

function SortTodayTradeRows(rows) {
    return rows.sort((a, b) => {
        const at = a.time || '';
        const bt = b.time || '';
        if (at < bt) return -1;
        if (at > bt) return 1;
        return 0;
    });
}

function GetTodayTradeRows(db_id, date) {
    const dateKey = NormalizeTradeLogDateKey(date);
    const tablename = BuildTodayTradeLogTableName(db_id, dateKey);

    return new Promise((resolve) => {
        if (!db_id) {
            resolve({ error: 'MISSING_DB_ID', message: 'db_id is required' });
            return;
        }

        if (!IsSafeTradeLogDbId(db_id)) {
            resolve({ error: 'INVALID_DB_ID', message: 'db_id format is invalid' });
            return;
        }

        if (!dateKey) {
            resolve({ error: 'INVALID_DATE', message: 'date must be YYYYMMDD' });
            return;
        }

        if (!tablename) {
            resolve({ error: 'INVALID_TABLE_NAME', message: 'trade log table name is invalid' });
            return;
        }

        db_tradelog((conn) => {
            const query = `SELECT * FROM \`${tablename}\``;
            conn.query(query, (err, datas) => {
                conn.release();

                if (err) {
                    if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146) {
                        resolve({ db_id, date: dateKey, rows: [] });
                        return;
                    }

                    resolve({ error: 'QUERY_FAILED', message: err.code || err.message || String(err) });
                    return;
                }

                const rows = SortTodayTradeRows((datas || []).map((row, idx) => NormalizeTodayTradeRow(row, idx)));
                resolve({ db_id, date: dateKey, rows });
            });
        });
    });
}

module.exports = {
    GetTodayTradeRows,
}
