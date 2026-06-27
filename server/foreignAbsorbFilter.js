const fs = require('fs');
const path = require('path');
const seriesCache = {};
let resolvedSeriesDir = null;
let loggedPathError = false;

function toStockCode(ticker) {
    const raw = String(ticker || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (/^a\d{6}$/.test(lower)) return lower.substring(1);
    if (/^\d{6}$/.test(raw)) return raw;
    return raw.replace(/^a/i, '');
}

function toYmd(value) {
    if (!value) return '';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value.substring(0, 10).replace(/-/g, '');
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
    return '';
}

function pointDateToYmd(pointDate) {
    return String(pointDate || '').substring(0, 10).replace(/-/g, '');
}

function parseNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function uniqueExistingDirs(dirs) {
    const seen = {};
    const out = [];
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        if (!dir) continue;
        const full = path.resolve(dir);
        if (seen[full]) continue;
        seen[full] = true;
        if (fs.existsSync(full)) out.push(full);
    }
    return out;
}

function getCandidateSeriesDirs(config) {
    const cfg = config || {};
    const cfgDir = cfg.foreignabsorbseriesdir || '';
    const cfgDataDir = cfg.foreignabsorbdatadir || '';
    const dirs = [];

    if (cfgDir) dirs.push(cfgDir);
    if (cfgDataDir) {
        dirs.push(cfgDataDir);
        dirs.push(path.join(cfgDataDir, 'stock-series'));
        dirs.push(path.join(cfgDataDir, 'outputs', 'stock-series'));
    }

    dirs.push(path.resolve(__dirname, '..', 'outputs', 'stock-series'));
    dirs.push(path.resolve(__dirname, '..', '..', 'halbae-strategy-designer', 'outputs', 'stock-series'));

    return uniqueExistingDirs(dirs);
}

function resolveSeriesDir(config) {
    if (resolvedSeriesDir !== null) return resolvedSeriesDir;
    const dirs = getCandidateSeriesDirs(config);
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        try {
            const testFiles = fs.readdirSync(dir).filter(name => /\.js$/i.test(name));
            if (testFiles.length > 0) {
                resolvedSeriesDir = dir;
                return resolvedSeriesDir;
            }
        }
        catch (e) {}
    }
    resolvedSeriesDir = '';
    return resolvedSeriesDir;
}

function parseSeriesFile(text, code) {
    const marker = `window.KOSPI_STOCK_SERIES["${code}"]=`;
    let idx = text.indexOf(marker);
    if (idx < 0) {
        const altMarker = `window.KOSPI_STOCK_SERIES['${code}']=`;
        idx = text.indexOf(altMarker);
        if (idx < 0) return null;
        idx += altMarker.length;
    }
    else {
        idx += marker.length;
    }

    let jsonText = text.substring(idx).trim();
    if (jsonText.endsWith(';')) jsonText = jsonText.substring(0, jsonText.length - 1).trim();
    return JSON.parse(jsonText);
}

function normalizeSeries(raw) {
    if (!raw || !Array.isArray(raw.points)) return [];
    const out = [];
    for (let i = 0; i < raw.points.length; i++) {
        const p = raw.points[i];
        if (!Array.isArray(p) || p.length < 4) continue;
        const date = pointDateToYmd(p[0]);
        const close = parseNumber(p[1], 0);
        const listedShares = parseNumber(p[2], 0);
        const foreignShares = parseNumber(p[3], 0);
        if (!date || close <= 0 || listedShares <= 0 || foreignShares < 0) continue;
        out.push({
            date,
            close,
            listedShares,
            foreignShares,
            foreignShareRate: foreignShares / listedShares * 100,
        });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}

function loadSeries(code, logFn, config) {
    if (!code) return null;
    if (Object.prototype.hasOwnProperty.call(seriesCache, code)) return seriesCache[code];

    const dir = resolveSeriesDir(config);
    if (!dir) {
        if (!loggedPathError) {
            loggedPathError = true;
            if (typeof logFn === 'function') logFn(`[FOREIGN_ABSORB_DATA_PATH_MISSING] check defulatConfig.foreignabsorbseriesdir in util.js`);
        }
        seriesCache[code] = null;
        return null;
    }

    const file = path.join(dir, `${code}.js`);
    try {
        if (!fs.existsSync(file)) {
            seriesCache[code] = null;
            return null;
        }
        const text = fs.readFileSync(file, 'utf8');
        const raw = parseSeriesFile(text, code);
        const points = normalizeSeries(raw);
        seriesCache[code] = points.length > 0 ? points : null;
        return seriesCache[code];
    }
    catch (e) {
        if (typeof logFn === 'function') logFn(`[FOREIGN_ABSORB_DATA_READ_ERROR] ${code} ${e.message}`);
        seriesCache[code] = null;
        return null;
    }
}

function findEndIndexBeforeDate(points, ymd) {
    let lo = 0;
    let hi = points.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (points[mid].date < ymd) {
            ans = mid;
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return ans;
}

function buildResult(pass, reason, detail) {
    return Object.assign({pass, reason}, detail || {});
}

function CheckForeignAbsorbBuyFilter(tradestock, curChartIdx, config, logFn) {
    const defulatConfig = config || {};
    if (!defulatConfig.useforeignabsorbfilter) return buildResult(true, 'disabled');

    const ticker = tradestock && tradestock.ticker ? tradestock.ticker : '';
    const code = toStockCode(ticker);
    if (!/^\d{6}$/.test(code)) return buildResult(false, 'invalid-code', {code});
    if (code.indexOf('900') === 0) return buildResult(false, 'foreign-listed-company', {code});

    const chartdatas = tradestock && Array.isArray(tradestock.chartdatas) ? tradestock.chartdatas : [];
    const cur = chartdatas[curChartIdx];
    const curYmd = toYmd(cur && cur.date);
    if (!curYmd) return buildResult(false, 'missing-current-date', {code});

    const points = loadSeries(code, logFn, defulatConfig);
    if (!points) return buildResult(false, 'missing-series', {code, curYmd});

    const lookbackDays = Math.max(2, Number(defulatConfig.foreignabsorblookbackdays) || 20);
    const endIdx = findEndIndexBeforeDate(points, curYmd); // D+1 safe: use only data before current trading day.
    if (endIdx < 0) return buildResult(false, 'no-prior-foreign-data', {code, curYmd});

    const startIdx = endIdx - lookbackDays + 1;
    if (startIdx < 0) return buildResult(false, 'not-enough-lookback', {code, curYmd, endDate: points[endIdx].date, need: lookbackDays, have: endIdx + 1});

    const start = points[startIdx];
    const end = points[endIdx];
    if (!start || !end || start.close <= 0 || start.listedShares <= 0 || end.listedShares <= 0) {
        return buildResult(false, 'invalid-window-data', {code, curYmd});
    }

    const priceReturnPct = (end.close / start.close - 1) * 100;
    const shareChangeP = end.foreignShareRate - start.foreignShareRate;
    let increaseDays = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) {
        if (points[i].foreignShareRate > points[i - 1].foreignShareRate) increaseDays++;
    }

    const maxPriceReturnPct = Number(defulatConfig.foreignabsorbmaxpricereturnpct);
    const minShareIncreaseP = Number(defulatConfig.foreignabsorbminshareincreasep);
    const minIncreaseDays = Number(defulatConfig.foreignabsorbminincreasedays);
    const excludeRateP = Number(defulatConfig.foreignabsorbexcluderatep);
    const recentDays = Math.max(1, Number(defulatConfig.foreignabsorbcancelrecentdays) || 5);
    const cancelDropP = Number(defulatConfig.foreignabsorbcanceldropp);

    if (end.foreignShareRate >= excludeRateP || start.foreignShareRate >= excludeRateP) {
        return buildResult(false, 'foreign-rate-outlier', {code, curYmd, endDate: end.date, foreignShareRate: end.foreignShareRate});
    }

    if (priceReturnPct > maxPriceReturnPct) {
        return buildResult(false, 'price-not-pullback', {code, curYmd, startDate: start.date, endDate: end.date, priceReturnPct, shareChangeP, increaseDays});
    }
    if (shareChangeP < minShareIncreaseP) {
        return buildResult(false, 'foreign-increase-too-small', {code, curYmd, startDate: start.date, endDate: end.date, priceReturnPct, shareChangeP, increaseDays});
    }
    if (increaseDays < minIncreaseDays) {
        return buildResult(false, 'foreign-increase-days-too-small', {code, curYmd, startDate: start.date, endDate: end.date, priceReturnPct, shareChangeP, increaseDays});
    }

    const recentStartIdx = Math.max(startIdx, endIdx - recentDays + 1);
    const recentStart = points[recentStartIdx];
    const recentShareChangeP = end.foreignShareRate - recentStart.foreignShareRate;
    if (recentShareChangeP <= cancelDropP) {
        return buildResult(false, 'foreign-recent-selling', {code, curYmd, startDate: start.date, endDate: end.date, priceReturnPct, shareChangeP, recentShareChangeP, increaseDays});
    }

    return buildResult(true, 'foreign-absorb-pass', {
        code,
        curYmd,
        startDate: start.date,
        endDate: end.date,
        priceReturnPct,
        shareChangeP,
        recentShareChangeP,
        increaseDays,
        endForeignShareRate: end.foreignShareRate,
        lookbackDays,
    });
}

function FormatForeignAbsorbFilterResult(result) {
    if (!result) return '';
    const parts = [];
    if (result.code) parts.push(`code:${result.code}`);
    if (result.curYmd) parts.push(`cur:${result.curYmd}`);
    if (result.startDate || result.endDate) parts.push(`window:${result.startDate || '?'}~${result.endDate || '?'}`);
    if (Number.isFinite(result.priceReturnPct)) parts.push(`price:${result.priceReturnPct.toFixed(2)}%`);
    if (Number.isFinite(result.shareChangeP)) parts.push(`foreign:${result.shareChangeP.toFixed(3)}%p`);
    if (Number.isFinite(result.recentShareChangeP)) parts.push(`recent:${result.recentShareChangeP.toFixed(3)}%p`);
    if (Number.isFinite(result.increaseDays)) parts.push(`incdays:${result.increaseDays}`);
    if (Number.isFinite(result.endForeignShareRate)) parts.push(`rate:${result.endForeignShareRate.toFixed(3)}%`);
    parts.push(`reason:${result.reason}`);
    return parts.join(' ');
}

module.exports = {
    CheckForeignAbsorbBuyFilter,
    FormatForeignAbsorbFilterResult,
    toStockCode,
};
