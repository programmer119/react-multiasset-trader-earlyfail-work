const express = require('express');
const crypto = require('crypto');
const mysql = require('mysql');

const PORT = Number(process.env.MINUTE_CACHE_PORT || 4197);
const TOKEN = process.env.MINUTE_CACHE_TOKEN || '';
const BOOTSTRAP_SECRET = process.env.MINUTE_CACHE_BOOTSTRAP_SECRET || '';
const START_MINUTE = 9 * 60;
const MAX_MINUTES = 7 * 60;
const CHUNK_SIZE = Number(process.env.MINUTE_CACHE_CHUNK_SIZE || 45);
const CONCURRENCY = Number(process.env.MINUTE_CACHE_CONCURRENCY || 4);
const MAX_TICKERS_PER_REQUEST = Number(process.env.MINUTE_CACHE_MAX_TICKERS || 400);

const app = express();
app.use(express.json({ limit: '10mb' }));

const cache = new Map();
const closeCache = new Map();
const countCache = new Map();
const pending = new Map();
const closePending = new Map();
let dbCredentials = null;
let pools = null;
const stats = {
    startedAt: new Date().toISOString(),
    hits: 0,
    misses: 0,
    nullHits: 0,
    dbLoads: 0,
    dbRows: 0,
    dbMs: 0,
    requests: 0,
    errors: 0,
};

const IsNaq = (dbId) => String(dbId || '').includes('naq') || String(dbId || '').includes('nas');

const checkToken = (req, res, next) => {
    if (!TOKEN || req.headers['x-minute-cache-token'] === TOKEN || (req.body && req.body.token === TOKEN)) {
        next();
        return;
    }

    res.status(401).json({ ok: false, error: 'unauthorized' });
};

app.use((req, res, next) => {
    if (req.path === '/health')
        next();
    else
        checkToken(req, res, next);
});

const createPools = (credentials) => {
    const baseConfig = {
        host: credentials.host,
        user: credentials.user,
        password: credentials.password,
        connectionLimit: Number(process.env.MINUTE_CACHE_DB_CONNECTION_LIMIT || 64),
        multipleStatements: true,
        idleTimeout: 10000,
    };

    pools = {
        stocklist: mysql.createPool({ ...baseConfig, database: 'stocklist' }),
        minute_nasstocklist: mysql.createPool({ ...baseConfig, database: 'minute_nasstocklist' }),
    };
};

const decryptBootstrapPayload = (payload) => {
    if (!BOOTSTRAP_SECRET || !payload || !payload.iv || !payload.tag || !payload.data)
        return null;

    const key = crypto.createHash('sha256').update(String(BOOTSTRAP_SECRET)).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.data, 'base64')),
        decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
};

const GetMarket = (dbId, gb) => (callback) => {
    if (!pools)
        throw new Error('db not bootstrapped');

    const pool = IsNaq(dbId) && gb === 'm' ? pools.minute_nasstocklist : pools.stocklist;
    pool.getConnection((err, conn) => {
        if (err)
            throw err;
        callback(conn);
    });
};

const minuteTimeToIndex = (time) => {
    const timestr = String(time).padStart(4, '0');
    const hour = Number(timestr.slice(0, 2));
    const minute = Number(timestr.slice(2, 4));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;

    const index = hour * 60 + minute - START_MINUTE;
    return index >= 0 && index < MAX_MINUTES ? index : -1;
};

const makeKey = (dbId, date, ticker) => {
    const market = IsNaq(dbId) ? 'naq' : 'kor';
    return `${market}:${String(date)}:${String(ticker).toLowerCase()}`;
};

const toBase64 = (typedArray) => Buffer.from(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength
).toString('base64');

const compactRows = (rows, includeValue = true) => {
    const indexes = [];
    const closes = [];
    const values = includeValue ? [] : null;

    rows.forEach((row) => {
        const index = minuteTimeToIndex(row.time);
        if (index < 0) return;
        if (row.close == null || row.close === '') return;

        const close = Number(row.close);
        if (!Number.isFinite(close) || close <= 0) return;

        indexes.push(index);
        closes.push(close);
        if (values)
            values.push(Number(row.value || 0));
    });

    return {
        indexes: Uint16Array.from(indexes),
        closes: Uint32Array.from(closes),
        values: values ? Float64Array.from(values) : null,
        points: indexes.length,
    };
};

const expandCloseToFloat32 = (compact) => {
    const minutes = new Float32Array(MAX_MINUTES);
    minutes.fill(NaN);
    for (let i = 0; i < compact.indexes.length; ++i) {
        minutes[compact.indexes[i]] = compact.closes[i];
    }
    return minutes;
};

const toCacheItem = (ticker, compact) => {
    const item = {
        ticker: String(ticker).toLowerCase(),
        version: 2,
        layout: 'sparse-columnar',
        encoding: compact.values ? {
        idx: 'uint16-base64',
        close: 'uint32-base64',
        value: 'float64-base64',
        } : {
        idx: 'uint16-base64',
        close: 'uint32-base64',
        },
        startMinute: START_MINUTE,
        maxMinutes: MAX_MINUTES,
        points: compact.points,
        indexes: compact.indexes,
        closes: compact.closes,
        values: compact.values,
    };

    if (!compact.values) {
        item.sparsePayloadNoValue = {
            ticker: item.ticker,
            version: item.version,
            layout: item.layout,
            encoding: item.encoding,
            startMinute: item.startMinute,
            maxMinutes: item.maxMinutes,
            points: item.points,
            idx: toBase64(item.indexes),
            close: toBase64(item.closes),
        };
    }

    return item;
};

const toSparsePayload = (item, includeValue = true) => {
    if (!includeValue && item.sparsePayloadNoValue)
        return item.sparsePayloadNoValue;

    const encoding = includeValue
        ? item.encoding
        : {
            idx: item.encoding.idx,
            close: item.encoding.close,
        };

    const payload = {
        ticker: item.ticker,
        version: item.version,
        layout: item.layout,
        encoding,
        startMinute: item.startMinute,
        maxMinutes: item.maxMinutes,
        points: item.points,
        idx: toBase64(item.indexes),
        close: toBase64(item.closes),
    };

    if (includeValue && item.values)
        payload.value = toBase64(item.values);

    return payload;
};

const toMinuteClosePayload = (item) => {
    if (!item) return null;
    if (item.version !== 2) return item;

    return {
        ticker: item.ticker,
        points: item.points,
        encoding: 'float32-base64',
        startMinute: item.startMinute,
        maxMinutes: item.maxMinutes,
        data: toBase64(expandCloseToFloat32(item)),
    };
};

const queryMinuteCountChunk = (dbId, tickers, date) => {
    const started = Date.now();
    return new Promise((resolve) => {
        if (!tickers.length) {
            resolve(new Map());
            return;
        }

        const marketfnc = GetMarket(dbId, 'm');
        marketfnc((conn) => {
            const sqlParts = [];
            const values = [];

            tickers.forEach((ticker) => {
                const tickerstr = String(ticker).toLowerCase();
                sqlParts.push('SELECT COUNT(*) as cnt FROM ?? WHERE code=? AND date=? AND time>? AND time<?');
                values.push(tickerstr, tickerstr, String(date), '0900', '1600');
            });

            conn.query(sqlParts.join(';'), values, (err, results) => {
                conn.release();

                if (err || !Array.isArray(results)) {
                    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR')) {
                        resolve(null);
                        return;
                    }
                    ++stats.errors;
                    resolve(null);
                    return;
                }

                const result = new Map();
                tickers.forEach((ticker, index) => {
                    const key = makeKey(dbId, date, ticker);
                    const rows = tickers.length === 1
                        ? results
                        : (Array.isArray(results[index]) ? results[index] : []);
                    const count = rows && rows[0] && rows[0].cnt != null ? Number(rows[0].cnt) : 0;
                    result.set(key, Number.isFinite(count) ? count : 0);
                });

                ++stats.dbLoads;
                stats.dbMs += Date.now() - started;
                resolve(result);
            });
        });
    });
};

const queryMinuteCloseChunk = (dbId, tickers, date, includeValue = true) => {
    const started = Date.now();
    return new Promise((resolve) => {
        if (!tickers.length) {
            resolve(new Map());
            return;
        }

        const marketfnc = GetMarket(dbId, 'm');
        marketfnc((conn) => {
            const sqlParts = [];
            const values = [];

            tickers.forEach((ticker) => {
                const tickerstr = String(ticker).toLowerCase();
                sqlParts.push(`SELECT time,close${includeValue ? ',value' : ''} FROM ?? WHERE code=? AND date=? AND time>? AND time<?`);
                values.push(tickerstr, tickerstr, String(date), '0900', '1600');
            });

            conn.query(sqlParts.join(';'), values, (err, results) => {
                conn.release();

                if (err || !Array.isArray(results)) {
                    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR')) {
                        resolve(null);
                        return;
                    }
                    ++stats.errors;
                    resolve(null);
                    return;
                }

                const result = new Map();
                let rowsInChunk = 0;

                tickers.forEach((ticker, index) => {
                    const rows = tickers.length === 1
                        ? results
                        : (Array.isArray(results[index]) ? results[index] : []);
                    const key = makeKey(dbId, date, ticker);

                    if (rows.length <= 0) {
                        result.set(key, null);
                        return;
                    }

                    rowsInChunk += rows.length;
                    const compact = compactRows(rows, includeValue);
                    result.set(key, toCacheItem(ticker, compact));
                });

                ++stats.dbLoads;
                stats.dbRows += rowsInChunk;
                stats.dbMs += Date.now() - started;
                resolve(result);
            });
        });
    });
};

const queryMinuteCloseRangeTicker = (dbId, ticker, startDate, endDate, includeValue = true) => {
    const started = Date.now();
    return new Promise((resolve) => {
        const marketfnc = GetMarket(dbId, 'm');
        marketfnc((conn) => {
            const tickerstr = String(ticker).toLowerCase();
            conn.query(
                `SELECT date,time,close${includeValue ? ',value' : ''} FROM ?? WHERE code=? AND date>=? AND date<=? AND time>? AND time<? ORDER BY date,time`,
                [tickerstr, tickerstr, String(startDate), String(endDate), '0900', '1600'],
                (err, rows) => {
                    conn.release();

                    if (err) {
                        if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR') {
                            resolve({ ticker: tickerstr, dates: new Map(), rows: 0, tableMissing: true });
                            return;
                        }
                        ++stats.errors;
                        resolve(null);
                        return;
                    }

                    const rowsByDate = new Map();
                    (rows || []).forEach((row) => {
                        const date = String(row.date);
                        if (!rowsByDate.has(date))
                            rowsByDate.set(date, []);
                        rowsByDate.get(date).push(row);
                    });

                    const dates = new Map();
                    rowsByDate.forEach((dateRows, date) => {
                        const compact = compactRows(dateRows, includeValue);
                        dates.set(date, compact.points > 0 ? toCacheItem(tickerstr, compact) : null);
                    });

                    ++stats.dbLoads;
                    stats.dbRows += rows ? rows.length : 0;
                    stats.dbMs += Date.now() - started;
                    resolve({ ticker: tickerstr, dates, rows: rows ? rows.length : 0, tableMissing: false });
                }
            );
        });
    });
};

const makeChunks = (items, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
};

const promisePool = async (items, limit, worker) => {
    let nextIndex = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (nextIndex < items.length) {
            const curIndex = nextIndex++;
            await worker(items[curIndex], curIndex);
        }
    });
    await Promise.all(workers);
};

const queryMinuteCloseSingleSafe = (dbId, ticker, date, includeValue = true) => {
    const started = Date.now();
    return new Promise((resolve) => {
        const marketfnc = GetMarket(dbId, 'm');
        marketfnc((conn) => {
            const tickerstr = String(ticker).toLowerCase();
            conn.query(
                `SELECT time,close${includeValue ? ',value' : ''} FROM ?? WHERE code=? AND date=? AND time>? AND time<?`,
                [tickerstr, tickerstr, String(date), '0900', '1600'],
                (err, rows) => {
                    conn.release();
                    const key = makeKey(dbId, date, ticker);
                    const result = new Map();

                    if (err) {
                        if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR') {
                            result.set(key, null);
                            resolve(result);
                            return;
                        }
                        ++stats.errors;
                        resolve(null);
                        return;
                    }

                    if (!rows || rows.length <= 0) {
                        result.set(key, null);
                        resolve(result);
                        return;
                    }

                    const compact = compactRows(rows, includeValue);
                    result.set(key, compact.points > 0 ? toCacheItem(tickerstr, compact) : null);
                    ++stats.dbLoads;
                    stats.dbRows += rows.length;
                    stats.dbMs += Date.now() - started;
                    resolve(result);
                }
            );
        });
    });
};

const queryMinuteCloseChunkStrict = async (dbId, tickers, date, includeValue = true) => {
    const batchResult = await queryMinuteCloseChunk(dbId, tickers, date, includeValue);
    if (batchResult) return batchResult;

    const result = new Map();
    await promisePool(tickers, Math.min(CONCURRENCY, tickers.length), async (ticker) => {
        const singleResult = await queryMinuteCloseSingleSafe(dbId, ticker, date, includeValue);
        const key = makeKey(dbId, date, ticker);
        result.set(key, singleResult && singleResult.has(key) ? singleResult.get(key) : null);
    });

    return result;
};

const loadMissing = async (dbId, date, tickers, targetCache = cache, targetPending = pending, includeValue = true) => {
    const chunks = makeChunks(tickers, CHUNK_SIZE);
    await promisePool(chunks, CONCURRENCY, async (chunk) => {
        const chunkResult = await queryMinuteCloseChunkStrict(dbId, chunk, date, includeValue);

        chunk.forEach((ticker) => {
            const key = makeKey(dbId, date, ticker);
            const value = chunkResult && chunkResult.has(key) ? chunkResult.get(key) : null;
            targetCache.set(key, value);
            targetPending.delete(key);
        });
    });
};

const ensureLoaded = async (dbId, date, tickers, targetCache = cache, targetPending = pending, includeValue = true) => {
    const uniqueTickers = Array.from(new Set(tickers.map((ticker) => String(ticker).toLowerCase())));
    const needLoad = [];
    const waitList = [];

    uniqueTickers.forEach((ticker) => {
        const key = makeKey(dbId, date, ticker);
        if (targetCache.has(key)) return;

        let promise = targetPending.get(key);
        if (!promise) {
            needLoad.push(ticker);
            promise = null;
        } else {
            waitList.push(promise);
        }
    });

    if (needLoad.length) {
        const loadPromise = loadMissing(dbId, date, needLoad, targetCache, targetPending, includeValue);
        needLoad.forEach((ticker) => targetPending.set(makeKey(dbId, date, ticker), loadPromise));
        waitList.push(loadPromise);
    }

    if (waitList.length) {
        await Promise.all(waitList);
    }
};

app.get('/health', (req, res) => {
    res.json({ ok: true, port: PORT, dbReady: !!pools, stats });
});

app.get('/status', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        ok: true,
        port: PORT,
        dbReady: !!pools,
        cacheSize: cache.size,
        closeCacheSize: closeCache.size,
        countCacheSize: countCache.size,
        pendingSize: pending.size,
        closePendingSize: closePending.size,
        stats,
        memory: {
            heapMB: Math.round(memory.heapUsed / 1024 / 1024),
            rssMB: Math.round(memory.rss / 1024 / 1024),
        },
    });
});

app.post('/bootstrap-db', (req, res) => {
    try {
        const credentials = decryptBootstrapPayload(req.body && req.body.payload);
        if (!credentials || !credentials.host || !credentials.user || !credentials.password) {
            res.status(400).json({ ok: false, error: 'invalid bootstrap payload' });
            return;
        }

        dbCredentials = credentials;
        createPools(dbCredentials);
        res.json({ ok: true });
    } catch (err) {
        ++stats.errors;
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/clear', (req, res) => {
    const before = cache.size;
    const beforeClose = closeCache.size;
    const beforeCount = countCache.size;
    cache.clear();
    closeCache.clear();
    countCache.clear();
    pending.clear();
    closePending.clear();
    res.json({ ok: true, cleared: before, clearedClose: beforeClose, clearedCounts: beforeCount });
});

app.post('/invalidate', (req, res) => {
    const { db_id: dbId = '', date, ticker } = req.body || {};
    let removed = 0;

    if (date && ticker) {
        const key = makeKey(dbId, date, ticker);
        removed += cache.delete(key) ? 1 : 0;
        removed += closeCache.delete(key) ? 1 : 0;
        removed += countCache.delete(key) ? 1 : 0;
    } else if (date) {
        const prefix = `${IsNaq(dbId) ? 'naq' : 'kor'}:${String(date)}:`;
        Array.from(cache.keys()).forEach((key) => {
            if (key.startsWith(prefix)) {
                cache.delete(key);
                ++removed;
            }
        });
        Array.from(countCache.keys()).forEach((key) => {
            if (key.startsWith(prefix)) {
                countCache.delete(key);
                ++removed;
            }
        });
        Array.from(closeCache.keys()).forEach((key) => {
            if (key.startsWith(prefix)) {
                closeCache.delete(key);
                ++removed;
            }
        });
    }

    res.json({ ok: true, removed });
});

app.get('/minute-close', async (req, res) => {
    const started = Date.now();
    ++stats.requests;

    const dbId = req.query.db_id || '';
    const date = String(req.query.date || '');
    const tickers = String(req.query.tickers || '')
        .split(',')
        .map((ticker) => ticker.trim().toLowerCase())
        .filter(Boolean);

    if (!/^\d{8}$/.test(date)) {
        res.status(400).json({ ok: false, error: 'date must be yyyymmdd' });
        return;
    }

    if (!tickers.length || tickers.length > MAX_TICKERS_PER_REQUEST) {
        res.status(400).json({ ok: false, error: `tickers must be 1..${MAX_TICKERS_PER_REQUEST}` });
        return;
    }

    await ensureLoaded(dbId, date, tickers);

    const data = {};
    tickers.forEach((ticker) => {
        const key = makeKey(dbId, date, ticker);
        const value = cache.get(key) || null;
        if (value) ++stats.hits;
        else ++stats.nullHits;
        data[ticker] = toMinuteClosePayload(value);
    });

    res.json({
        ok: true,
        date,
        count: tickers.length,
        elapsedMs: Date.now() - started,
        data,
    });
});

app.get('/minute-count-v2', async (req, res) => {
    const started = Date.now();
    ++stats.requests;

    const dbId = req.query.db_id || '';
    const date = String(req.query.date || '');
    const tickers = String(req.query.tickers || '')
        .split(',')
        .map((ticker) => ticker.trim().toLowerCase())
        .filter(Boolean);

    if (!/^\d{8}$/.test(date)) {
        res.status(400).json({ ok: false, error: 'date must be yyyymmdd' });
        return;
    }

    if (!tickers.length || tickers.length > MAX_TICKERS_PER_REQUEST) {
        res.status(400).json({ ok: false, error: `tickers must be 1..${MAX_TICKERS_PER_REQUEST}` });
        return;
    }

    const data = {};
    const missing = [];
    tickers.forEach((ticker) => {
        const key = makeKey(dbId, date, ticker);
        if (cache.has(key)) {
            const value = cache.get(key) || null;
            data[ticker] = value ? value.points : 0;
            ++stats.hits;
            return;
        }
        if (countCache.has(key)) {
            data[ticker] = countCache.get(key);
            ++stats.hits;
            return;
        }
        missing.push(ticker);
    });

    const chunks = makeChunks(missing, CHUNK_SIZE);
    await promisePool(chunks, CONCURRENCY, async (chunk) => {
        const counts = await queryMinuteCountChunk(dbId, chunk, date);
        chunk.forEach((ticker) => {
            const key = makeKey(dbId, date, ticker);
            const count = counts && counts.has(key) ? counts.get(key) : 0;
            countCache.set(key, count);
            data[ticker] = count;
            if (count > 0) ++stats.hits;
            else ++stats.nullHits;
        });
    });

    res.json({
        ok: true,
        version: 2,
        date,
        count: tickers.length,
        elapsedMs: Date.now() - started,
        data,
    });
});

app.get('/minute-data-v2', async (req, res) => {
    const started = Date.now();
    ++stats.requests;

    const dbId = req.query.db_id || '';
    const date = String(req.query.date || '');
    const tickers = String(req.query.tickers || '')
        .split(',')
        .map((ticker) => ticker.trim().toLowerCase())
        .filter(Boolean);
    const includeValue = String(req.query.include_value || 'true') !== 'false';

    if (!/^\d{8}$/.test(date)) {
        res.status(400).json({ ok: false, error: 'date must be yyyymmdd' });
        return;
    }

    if (!tickers.length || tickers.length > MAX_TICKERS_PER_REQUEST) {
        res.status(400).json({ ok: false, error: `tickers must be 1..${MAX_TICKERS_PER_REQUEST}` });
        return;
    }

    const sourceCache = includeValue ? cache : closeCache;
    await ensureLoaded(dbId, date, tickers, sourceCache, includeValue ? pending : closePending, includeValue);

    const data = {};
    tickers.forEach((ticker) => {
        const key = makeKey(dbId, date, ticker);
        const value = sourceCache.get(key) || null;
        if (value) ++stats.hits;
        else ++stats.nullHits;
        data[ticker] = value ? toSparsePayload(value, includeValue) : null;
    });

    res.json({
        ok: true,
        version: 2,
        date,
        count: tickers.length,
        elapsedMs: Date.now() - started,
        data,
    });
});

app.get('/minute-data-v2-range', async (req, res) => {
    const started = Date.now();
    ++stats.requests;

    const dbId = req.query.db_id || '';
    const startDate = String(req.query.start_date || '');
    const endDate = String(req.query.end_date || '');
    const tickers = String(req.query.tickers || '')
        .split(',')
        .map((ticker) => ticker.trim().toLowerCase())
        .filter(Boolean);
    const includeValue = String(req.query.include_value || 'true') !== 'false';

    if (!/^\d{8}$/.test(startDate) || !/^\d{8}$/.test(endDate)) {
        res.status(400).json({ ok: false, error: 'start_date/end_date must be yyyymmdd' });
        return;
    }

    if (startDate > endDate) {
        res.status(400).json({ ok: false, error: 'start_date must be <= end_date' });
        return;
    }

    if (!tickers.length || tickers.length > MAX_TICKERS_PER_REQUEST) {
        res.status(400).json({ ok: false, error: `tickers must be 1..${MAX_TICKERS_PER_REQUEST}` });
        return;
    }

    const sourceCache = includeValue ? cache : closeCache;
    const data = {};
    const failed = [];
    let rows = 0;
    let cachedDates = 0;
    const uniqueTickers = Array.from(new Set(tickers));

    await promisePool(uniqueTickers, Math.min(CONCURRENCY, uniqueTickers.length), async (ticker) => {
        const rangeResult = await queryMinuteCloseRangeTicker(dbId, ticker, startDate, endDate, includeValue);
        if (!rangeResult) {
            failed.push(ticker);
            return;
        }

        rows += rangeResult.rows;
        data[ticker] = {};
        rangeResult.dates.forEach((value, date) => {
            const key = makeKey(dbId, date, ticker);
            sourceCache.set(key, value);
            data[ticker][date] = value ? toSparsePayload(value, includeValue) : null;
            ++cachedDates;
            if (value) ++stats.hits;
            else ++stats.nullHits;
        });
    });

    if (failed.length) {
        res.status(503).json({
            ok: false,
            error: 'minute range load failed',
            startDate,
            endDate,
            failed,
            elapsedMs: Date.now() - started,
        });
        return;
    }

    res.json({
        ok: true,
        version: 2,
        startDate,
        endDate,
        count: uniqueTickers.length,
        rows,
        cachedDates,
        elapsedMs: Date.now() - started,
        data,
    });
});

app.listen(PORT, () => {
    console.log(`[minute-cache-server] listening on ${PORT}`);
});
