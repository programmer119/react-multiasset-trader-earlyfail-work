// ticker_cache.js
// 서버0에서 사용

const { idcurl } = require('./consts');
const redisutil = require('./redisutil');
const { defulatConfig } = require('./util');

const REDIS_REFRESH_MS = 60 * 1000;

// 필요한 redis hash key들.
// 실제 네 redis key 이름에 맞게 넣으면 됨.
// 예: dbidtoredisjson(db_id) 결과가 "srhsha_real_kor" 계열이면 그 값들.

let tickerPriceCache = {};
let lastTickerRefreshAt = 0;
let refreshTimer = null;
let refreshing = false;
let _rediskey = '';
function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRedisPriceValue(ticker, rawValue) {
  const vals = safeJsonParse(rawValue);
  if (!Array.isArray(vals)) return null;

  // 거래서버 코드 기준:
  // const [o,h,l,c,vol,x1,x2,caful,warn] = vals;
  const [o, h, l, c, vol, x1, x2, caful, warn] = vals;

  const price = Number(c);
  if (!Number.isFinite(price)) return null;

  return {
    ticker,
    open: Number(o) || 0,
    high: Number(h) || 0,
    low: Number(l) || 0,
    close: price,
    price,
    volume: Number(vol) || 0,
    accumval: Number(x1) || 0,
    accumvol: Number(x2) || 0,
    caful,
    warn,
    updatedAt: Date.now()
  };
}

async function refreshTickerPriceCache() {
  if (refreshing) return;
  refreshing = true;

  try {
    const nextCache = {};

    const r = await redisutil.GetStockPrices(_rediskey);
    if (!r || Object.keys(r).length === 0) {
      console.log(`${_rediskey} redis length is Zero!`);
    }

    Object.entries(r).forEach(([ticker, rawValue]) => {
      const normalized = normalizeRedisPriceValue(ticker, rawValue);
      if (normalized) {
        nextCache[ticker] = normalized;
      }
    });

    if (Object.keys(nextCache).length > 0) {
      tickerPriceCache = nextCache;
      lastTickerRefreshAt = Date.now();
      console.log(`[ticker-cache] refreshed ${Object.keys(tickerPriceCache).length} tickers`);
    } else {
      console.log('[ticker-cache] redis returned empty data, keep previous cache');
    }
  } catch (err) {
    console.error('[ticker-cache] refresh failed', err);
  } finally {
    refreshing = false;
  }
}

function StartTickerCache(rediskey) {
  if (refreshTimer) return;
  if (!defulatConfig.isredismaintenance)
    return;

  redisutil.Initredis(rediskey);
  _rediskey = rediskey;

  // refreshTickerPriceCache();

  refreshTimer = setInterval(() => {
    refreshTickerPriceCache();
  }, REDIS_REFRESH_MS);
}

function GetTickerPrices(tickers = []) {
  const result = {};

  tickers.forEach((ticker) => {
    if (tickerPriceCache[ticker]) {
      result[ticker] = tickerPriceCache[ticker];
    }
  });

  return {
    result,
    meta: {
      requested: tickers.length,
      returned: Object.keys(result).length,
      lastRefreshAt: lastTickerRefreshAt,
      refreshIntervalMs: REDIS_REFRESH_MS
    }
  };
}

module.exports = {
  StartTickerCache,
  GetTickerPrices,
  refreshTickerPriceCache
};
