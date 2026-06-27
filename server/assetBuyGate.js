const globalval = require('./globalval');
const {defulatConfig} = require('./util');
const {GetYMD, GetChangePerLog} = require('./tradeutilcommon');

const getState = () => {
    if(!globalval.assetBuyGate)
    {
        globalval.assetBuyGate = {
            yesterdayUp:false,
            yesterdayDate:'',
            yesterdayChangePer:0,
            todayStartCapital:0,
            todayCashDate:'',
            todayStartCanUseCash:0,
            todaySellCash:0,
            previousSellCash:0,
            todayOldCashUsed:0,
            sellCashLogDate:'',
            sellCashBlockCount:0,
            sellCashClipCount:0,
            buyBlockTransition:{active:false, tag:'', date:''},
            sellCashTransition:{active:false, tagPrefix:'', date:''},
            buyBlockDayLock:{active:false, tag:'', date:''},
            sellCashDayLock:{active:false, tagPrefix:'', date:''},
            todayAssetDownFilter:{active:false, date:'', lastChangePer:0},
            assetHistory:[],
        };
    }
    return globalval.assetBuyGate;
}


const normalizeHistoryDate = (value) => {
    if(!value)
        return '';
    if(value instanceof Date)
        return GetYMD(value);
    return String(value);
}

const rememberAssetHistory = (today, totalcapital) => {
    const state = getState();
    if(!state.assetHistory)
        state.assetHistory = [];

    const date = normalizeHistoryDate(today);
    const asset = Number(totalcapital || 0);
    if(!date || !Number.isFinite(asset) || asset <= 0)
        return;

    const last = state.assetHistory[state.assetHistory.length - 1];
    if(last && last.date === date)
        last.asset = asset;
    else
        state.assetHistory.push({date, asset});

    if(state.assetHistory.length > 30)
        state.assetHistory = state.assetHistory.slice(-30);
}

const getRecentAssetValues = (count) => {
    const state = getState();
    const history = Array.isArray(state.assetHistory) ? state.assetHistory : [];
    return history.slice(-count).map((item) => Number(item.asset || 0)).filter((asset) => Number.isFinite(asset) && asset > 0);
}

const getAssetDefenseBypassState = (totalcapital) => {
    const mode = defulatConfig.assetDefenseBypassMode || 'none';
    if(mode === 'none')
        return {mode, active:false, reason:'none'};

    const currentAsset = Number(totalcapital || 0);
    if(!Number.isFinite(currentAsset) || currentAsset <= 0)
        return {mode, active:false, reason:'no-current-asset'};

    if(mode === 'currentAbovePast5Assets')
    {
        const recent5 = getRecentAssetValues(5);
        if(recent5.length < 5)
            return {mode, active:false, reason:'need-5-history'};
        return {mode, active:currentAsset > Math.max(...recent5), reason:`cur>${Math.round(Math.max(...recent5))}`};
    }

    if(mode === 'currentAbovePast5Avg')
    {
        const recent5 = getRecentAssetValues(5);
        if(recent5.length < 5)
            return {mode, active:false, reason:'need-5-history'};
        const avg5 = recent5.reduce((sum, value) => sum + value, 0) / recent5.length;
        return {mode, active:currentAsset > avg5, reason:`cur>${Math.round(avg5)}`};
    }

    if(mode === 'avgCurrentToPast4AbovePast6')
    {
        const recent6 = getRecentAssetValues(6);
        if(recent6.length < 6)
            return {mode, active:false, reason:'need-6-history'};
        const past4 = recent6.slice(-4);
        const avgCurrentToPast4 = [currentAsset, ...past4].reduce((sum, value) => sum + value, 0) / 5;
        const past6 = recent6[0];
        return {mode, active:avgCurrentToPast4 > past6, reason:`avg5>${Math.round(past6)}`};
    }

    return {mode, active:false, reason:'unknown-mode'};
}

const shouldBypassAssetUseFilter = (totalcapital) => {
    return getAssetDefenseBypassState(totalcapital).active;
}


const getAvgCurrentToPast4BelowPast6BuyBlockState = (totalcapital) => {
    const mode = 'avgCurrentToPast4BelowPast6BuyBlock';
    const currentAsset = Number(totalcapital || 0);
    if(!Number.isFinite(currentAsset) || currentAsset <= 0)
        return {mode, active:false, reason:'no-current-asset'};

    const recent6 = getRecentAssetValues(6);
    if(recent6.length < 6)
        return {mode, active:false, reason:'need-6-history'};

    const past4 = recent6.slice(-4);
    const avgCurrentToPast4 = [currentAsset, ...past4].reduce((sum, value) => sum + value, 0) / 5;
    const past6 = recent6[0];
    const active = avgCurrentToPast4 < past6;
    return {
        mode,
        active,
        reason:`avg5:${Math.round(avgCurrentToPast4)} ${active ? '<' : '>='} past6:${Math.round(past6)}`,
    };
}

const setTodayStartCapital = (totalcapital) => {
    const state = getState();
    state.todayStartCapital = totalcapital || 0;
    globalval.assetBuyGateTodayStartCapital = state.todayStartCapital;
}

const setYesterdayResult = (today, totalcapital, beforetotalcapital, changedper) => {
    rememberAssetHistory(today, totalcapital);
    const state = getState();
    state.yesterdayUp = totalcapital >= beforetotalcapital;
    state.yesterdayDate = today;
    state.yesterdayChangePer = Number.isFinite(changedper) ? changedper : 0;
    globalval.assetBuyGateYesterdayUp = state.yesterdayUp;
    globalval.assetBuyGateYesterdayDate = state.yesterdayDate;
    globalval.assetBuyGateYesterdayChangePer = state.yesterdayChangePer;
}

const initCashForDay = (account, chartdata, getCanUseCashAmount) => {
    const ymd = chartdata && chartdata.date ? GetYMD(chartdata.date) : '';
    const state = getState();
    if(!ymd || state.todayCashDate === ymd)
        return;

    state.previousSellCash = state.todaySellCash || 0;
    state.todayCashDate = ymd;
    state.todayStartCanUseCash = getCanUseCashAmount(account);
    state.todaySellCash = 0;
    state.todayOldCashUsed = 0;
    state.sellCashLogDate = ymd;
    state.sellCashBlockCount = 0;
    state.sellCashClipCount = 0;
    state.buyBlockTransition = {active:false, tag:'', date:ymd};
    state.sellCashTransition = {active:false, tagPrefix:'', date:ymd};
    state.buyBlockDayLock = {active:false, tag:'', date:ymd};
    state.sellCashDayLock = {active:false, tagPrefix:'', date:ymd};
    state.todayAssetDownFilter = {active:false, date:ymd, lastChangePer:0};
    globalval.assetBuyGatePreviousSellCash = state.previousSellCash;
    globalval.assetBuyGateTodayCashDate = state.todayCashDate;
    globalval.assetBuyGateTodayStartCanUseCash = state.todayStartCanUseCash;
    globalval.assetBuyGateTodaySellCash = state.todaySellCash;
    globalval.assetBuyGateTodayOldCashUsed = state.todayOldCashUsed;
}

const isAvgCurrentToPast4BelowPast6BuyBlockMode = () => (
    defulatConfig.assetDefenseMode === 'avgCurrentToPast4BelowPast6BuyBlock' ||
    defulatConfig.useAvgCurrentToPast4BelowPast6BuyBlock
);

const isAvgCurrentToPast4BelowPast6SellCashBlockMode = () => (
    defulatConfig.assetDefenseMode === 'avgCurrentToPast4BelowPast6SellCashBlock' ||
    defulatConfig.useAvgCurrentToPast4BelowPast6SellCashBlock
);

const isAvgCurrentToPast4BelowPast6Mode = () => (
    isAvgCurrentToPast4BelowPast6BuyBlockMode() ||
    isAvgCurrentToPast4BelowPast6SellCashBlockMode()
);

const isCashTrackingEnabled = () => !!(
    defulatConfig.useBlockSameDaySellCashOnEquityWeakness ||
    defulatConfig.useBlockSameDaySellCashAlways ||
    defulatConfig.useBlockSameDaySellCashOnTodayAssetDown ||
    isAvgCurrentToPast4BelowPast6SellCashBlockMode()
);

const isAssetDefenseDayLockEnabled = () => !!defulatConfig.assetDefenseDayLock;

const getLockedBuyBlockTag = (tag) => {
    if(!isAssetDefenseDayLockEnabled())
        return tag;

    const state = getState();
    const ymd = state.todayCashDate || '';
    if(!state.buyBlockDayLock || state.buyBlockDayLock.date !== ymd)
        state.buyBlockDayLock = {active:false, tag:'', date:ymd};

    if(tag)
    {
        state.buyBlockDayLock = {active:true, tag, date:ymd};
        return tag;
    }

    return state.buyBlockDayLock.active ? state.buyBlockDayLock.tag : '';
}

const getLockedSellCashTagPrefix = (tagPrefix) => {
    if(!isAssetDefenseDayLockEnabled())
        return tagPrefix;

    const state = getState();
    const ymd = state.todayCashDate || '';
    if(!state.sellCashDayLock || state.sellCashDayLock.date !== ymd)
        state.sellCashDayLock = {active:false, tagPrefix:'', date:ymd};

    if(tagPrefix)
    {
        state.sellCashDayLock = {active:true, tagPrefix, date:ymd};
        return tagPrefix;
    }

    return state.sellCashDayLock.active ? state.sellCashDayLock.tagPrefix : '';
}

const shouldLimitBuyToOldCash = (totalcapital) => {
    return !!getSellCashTagPrefixForTotal(totalcapital);
}

const getCarryLockedCash = () => {
    const mode = defulatConfig.assetupsellcashcarrymode;
    if(!defulatConfig.useBlockSameDaySellCashOnEquityWeakness || !mode)
        return 0;

    const state = getState();
    const previousSellCash = state.previousSellCash || 0;
    if(previousSellCash <= 0)
        return 0;

    if(mode === 'weak1')
        return previousSellCash;

    if(mode === 'weak2' && !state.yesterdayUp)
        return previousSellCash;

    return 0;
}

const getOldCashRemaining = () => {
    const state = getState();
    return Math.max(0, (state.todayStartCanUseCash || 0) - (state.todayOldCashUsed || 0) - getCarryLockedCash());
}

const registerSellCash = (addmoney) => {
    if(!isCashTrackingEnabled() || addmoney <= 0)
        return;
    const state = getState();
    state.todaySellCash = (state.todaySellCash || 0) + addmoney;
    globalval.assetBuyGateTodaySellCash = state.todaySellCash;
}

const registerBuyCash = (buymoney) => {
    if(!isCashTrackingEnabled() || !buymoney)
        return;

    const state = getState();
    if(buymoney < 0)
    {
        state.todayOldCashUsed = Math.max(0, (state.todayOldCashUsed || 0) + buymoney);
        globalval.assetBuyGateTodayOldCashUsed = state.todayOldCashUsed;
        return;
    }

    const oldCashUsed = Math.min(buymoney, getOldCashRemaining());
    state.todayOldCashUsed = (state.todayOldCashUsed || 0) + oldCashUsed;
    globalval.assetBuyGateTodayOldCashUsed = state.todayOldCashUsed;
}

const getConditionState = (totalcapital) => {
    const state = getState();
    const startCapital = state.todayStartCapital || globalval.earlyprofitlockbeforetotalcapital || 0;
    const hasHistory = !!state.yesterdayDate;
    const yesterdayUp = !!state.yesterdayUp;
    const todayUp = startCapital > 0 && totalcapital >= startCapital;
    const ok = !hasHistory || (yesterdayUp && todayUp);
    return {state, startCapital, hasHistory, yesterdayUp, todayUp, ok};
}

const toFiniteNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

const getTodayAssetDownThresholds = () => ({
    filterPercent: toFiniteNumber(defulatConfig.todayAssetDownFilterPercent, 0),
    exitPercent: toFiniteNumber(defulatConfig.todayAssetDownExitPercent, 0),
});

const getTodayAssetChangePercentForTotal = (totalcapital) => {
    const condition = getConditionState(totalcapital);
    if(!(condition.startCapital > 0))
        return 0;
    return ((Number(totalcapital || 0) - condition.startCapital) / condition.startCapital) * 100;
}

const getTodayAssetDownFilterStateForTotal = (totalcapital) => {
    const state = getState();
    const ymd = state.todayCashDate || '';
    if(!state.todayAssetDownFilter || state.todayAssetDownFilter.date !== ymd)
        state.todayAssetDownFilter = {active:false, date:ymd, lastChangePer:0};

    const condition = getConditionState(totalcapital);
    const thresholds = getTodayAssetDownThresholds();
    if(!(condition.startCapital > 0))
    {
        state.todayAssetDownFilter = {active:false, date:ymd, lastChangePer:0};
        return {active:false, changePercent:0, ...thresholds, reason:'no-start-capital'};
    }

    const changePercent = getTodayAssetChangePercentForTotal(totalcapital);
    let active = !!state.todayAssetDownFilter.active;

    if(!active && changePercent < thresholds.filterPercent)
        active = true;
    else if(active && changePercent >= thresholds.exitPercent)
        active = false;

    state.todayAssetDownFilter = {
        active,
        date:ymd,
        lastChangePer:changePercent,
        filterPercent:thresholds.filterPercent,
        exitPercent:thresholds.exitPercent,
    };

    return {
        active,
        changePercent,
        ...thresholds,
        reason:`ret:${formatPercent(changePercent)} filter<${formatPercent(thresholds.filterPercent)} exit>=${formatPercent(thresholds.exitPercent)}`,
    };
}

const formatPercent = (value) => {
    const n = Number(value);
    if(!Number.isFinite(n))
        return '-';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
}

const isConditionOkForTotal = (totalcapital) => {
    return getConditionState(totalcapital).ok;
}

const isTodayAssetDownForTotal = (totalcapital) => {
    return getTodayAssetDownFilterStateForTotal(totalcapital).active;
}

const getRawBuyBlockTagForTotal = (totalcapital) => {
    let tag = '';
    const avg5DownMode = isAvgCurrentToPast4BelowPast6BuyBlockMode();
    if(avg5DownMode && getAvgCurrentToPast4BelowPast6BuyBlockState(totalcapital).active)
        tag = 'AVG5_ASSET_DOWN_BUY_BLOCK';
    else if(defulatConfig.useBlockBuyOnTodayAssetDown && isTodayAssetDownForTotal(totalcapital))
        tag = 'TODAY_ASSET_DOWN_BUY_BLOCK';
    else if(defulatConfig.useassetupbuygate && !isConditionOkForTotal(totalcapital))
        tag = 'ASSET_BUY_GATE_ALLBUY_BLOCK';

    if(tag && !avg5DownMode && shouldBypassAssetUseFilter(totalcapital))
        return '';

    return tag;
}

const getBuyBlockTagForTotal = (totalcapital) => {
    return getLockedBuyBlockTag(getRawBuyBlockTagForTotal(totalcapital));
}

const shouldBlockBuy = (totalcapital) => !!getBuyBlockTagForTotal(totalcapital);

const getRawSellCashTagPrefixForTotal = (totalcapital) => {
    if(defulatConfig.useBlockSameDaySellCashAlways)
        return 'SAME_DAY_SELL_CASH_ALWAYS';
    if(defulatConfig.useBlockSameDaySellCashOnTodayAssetDown && isTodayAssetDownForTotal(totalcapital))
        return 'SAME_DAY_SELL_CASH_TODAY_ASSET_DOWN';
    if(isAvgCurrentToPast4BelowPast6SellCashBlockMode() && getAvgCurrentToPast4BelowPast6BuyBlockState(totalcapital).active)
        return 'SAME_DAY_SELL_CASH_AVG5_ASSET_DOWN';
    if(defulatConfig.useBlockSameDaySellCashOnEquityWeakness && !isConditionOkForTotal(totalcapital))
        return 'SAME_DAY_SELL_CASH_EQUITY_WEAKNESS';
    return '';
}

const getSellCashTagPrefixForTotal = (totalcapital) => {
    return getLockedSellCashTagPrefix(getRawSellCashTagPrefixForTotal(totalcapital));
}

const buildTransitionLogDetail = (totalcapital, canusecashamount) => {
    const condition = getConditionState(totalcapital);
    const yChange = Number.isFinite(condition.state.yesterdayChangePer) ? GetChangePerLog(condition.state.yesterdayChangePer) : '-';
    const bypass = getAssetDefenseBypassState(totalcapital);
    const bypassText = bypass.active ? ` BYPASS:${bypass.mode}(${bypass.reason})` : '';
    const avg5DownMode = isAvgCurrentToPast4BelowPast6Mode();
    const avg5Down = avg5DownMode ? getAvgCurrentToPast4BelowPast6BuyBlockState(totalcapital) : null;
    const avg5DownText = avg5Down ? ` TREND:${avg5Down.mode}(${avg5Down.reason})` : '';
    const state = getState();
    const todayAssetDown = getTodayAssetDownFilterStateForTotal(totalcapital);
    const todayAssetDownText = ` RET:${formatPercent(todayAssetDown.changePercent)} FILTER<${formatPercent(todayAssetDown.filterPercent)} EXIT>=${formatPercent(todayAssetDown.exitPercent)} CURFILTER:${todayAssetDown.active ? 'ON' : 'OFF'}`;
    const dayLockText = defulatConfig.assetDefenseDayLock ? ` DAYLOCK:buy:${state.buyBlockDayLock && state.buyBlockDayLock.active ? 'ON' : 'OFF'}/sellcash:${state.sellCashDayLock && state.sellCashDayLock.active ? 'ON' : 'OFF'}` : '';
    return `H:${condition.hasHistory ? 'Y' : 'N'} Y:${condition.yesterdayUp ? 'KEEP' : 'DN'}(${condition.state.yesterdayDate || '-'}/${yChange}) T:${condition.todayUp ? 'KEEP' : 'DN'} start:${Math.round(condition.startCapital)} cur:${Math.round(totalcapital)} cash:${Math.round(canusecashamount || 0)}${todayAssetDownText}${bypassText}${avg5DownText}${dayLockText}`;
}

const logBuyBlockTransition = ({
    totalcapital,
    useconsolelog,
    timeString,
    reason,
    ticker,
    name,
    canusecashamount,
    addSimulationLog,
}) => {
    if(!useconsolelog || !addSimulationLog)
        return;

    const state = getState();
    if(!state.buyBlockTransition)
        state.buyBlockTransition = {active:false, tag:'', date:state.todayCashDate || ''};

    const tag = getBuyBlockTagForTotal(totalcapital);
    const active = !!tag;
    const prev = state.buyBlockTransition;
    const detail = buildTransitionLogDetail(totalcapital, canusecashamount);

    if(active && (!prev.active || prev.tag !== tag))
    {
        if(prev.active && prev.tag && prev.tag !== tag)
            addSimulationLog(`[${prev.tag}_END] ${timeString} ${reason || ''} ${ticker || ''} ${name || ''} ${detail}`);
        addSimulationLog(`[${tag}_START] ${timeString} ${reason || ''} ${ticker || ''} ${name || ''} ${detail}`);
    }
    else if(!active && prev.active && prev.tag)
    {
        addSimulationLog(`[${prev.tag}_END] ${timeString} ${reason || ''} ${ticker || ''} ${name || ''} ${detail}`);
    }

    state.buyBlockTransition = {
        active,
        tag,
        date:state.todayCashDate || '',
    };
}

const logSellCashTransition = ({
    totalcapital,
    useconsolelog,
    timeString,
    reason,
    ticker,
    name,
    canusecashamount,
    addSimulationLog,
}) => {
    if(!useconsolelog || !addSimulationLog)
        return;

    const state = getState();
    if(!state.sellCashTransition)
        state.sellCashTransition = {active:false, tagPrefix:'', date:state.todayCashDate || ''};

    const tagPrefix = getSellCashTagPrefixForTotal(totalcapital);
    const active = !!tagPrefix;
    const prev = state.sellCashTransition;
    const detail = buildTransitionLogDetail(totalcapital, canusecashamount);
    const oldRemain = getOldCashRemaining();
    const carryLock = getCarryLockedCash();
    const dayLockText = defulatConfig.assetDefenseDayLock ? ` dayLock:${state.sellCashDayLock && state.sellCashDayLock.active ? 'ON' : 'OFF'}` : '';
    const cashDetail = `oldRemain:${Math.round(oldRemain)} carryLock:${Math.round(carryLock)} todaySell:${Math.round(state.todaySellCash || 0)}${dayLockText}`;

    if(active && (!prev.active || prev.tagPrefix !== tagPrefix))
    {
        if(prev.active && prev.tagPrefix && prev.tagPrefix !== tagPrefix)
            addSimulationLog(`[${prev.tagPrefix}_END] ${timeString} ${reason || ''} ${ticker || ''} ${name || ''} ${detail} ${cashDetail}`);
        addSimulationLog(`[${tagPrefix}_START] ${timeString} ${reason || ''} ${ticker || ''} ${name || ''} ${detail} ${cashDetail}`);
    }
    else if(!active && prev.active && prev.tagPrefix)
    {
        addSimulationLog(`[${prev.tagPrefix}_END] ${timeString} ${reason || ''} ${ticker || ''} ${name || ''} ${detail} ${cashDetail}`);
    }

    state.sellCashTransition = {
        active,
        tagPrefix,
        date:state.todayCashDate || '',
    };
}

const shouldSkipJiJiBuJinShort = (account, tradestockdic, getAllStockCapitalValue, getCanUseCashAmount) => {
    if(!defulatConfig.useBlockSameDaySellCashOnEquityWeakness)
        return false;

    const totalcapital = getAllStockCapitalValue(account, tradestockdic) + getCanUseCashAmount(account);
    return !isConditionOkForTotal(totalcapital);
}

const getAllowedBuyAmount = ({
    reason,
    requestedBuyAmount,
    buyMoneyByOneStock,
    totalcapital,
    useconsolelog,
    timeString,
    ticker,
    name,
    canusecashamount,
    addSimulationLog,
}) => {
    if(!requestedBuyAmount || requestedBuyAmount <= 0)
        return 0;
    const limitToOldCash = shouldLimitBuyToOldCash(totalcapital);
    logSellCashTransition({
        totalcapital,
        useconsolelog,
        timeString,
        reason,
        ticker,
        name,
        canusecashamount,
        addSimulationLog,
    });
    if(!limitToOldCash)
        return requestedBuyAmount;

    const requestedBuyMoney = buyMoneyByOneStock * requestedBuyAmount;
    const oldCashRemaining = getOldCashRemaining();
    if(requestedBuyMoney <= oldCashRemaining)
        return requestedBuyAmount;

    const allowedBuyAmount = Math.floor(oldCashRemaining / buyMoneyByOneStock);
    const state = getState();
    const isClip = (buyMoneyByOneStock * allowedBuyAmount) > 0;
    const countKey = isClip ? 'sellCashClipCount' : 'sellCashBlockCount';
    state[countKey] = (state[countKey] || 0) + 1;
    return allowedBuyAmount;
}

const getSellCashGateSummary = () => {
    const state = getState();
    return {
        date: state.sellCashLogDate || state.todayCashDate || '',
        blocked: state.sellCashBlockCount || 0,
        clipped: state.sellCashClipCount || 0,
    };
}

const getBuyBlockLogFields = (totalcapital) => {
    const condition = getConditionState(totalcapital);
    const yChange = Number.isFinite(condition.state.yesterdayChangePer) ? GetChangePerLog(condition.state.yesterdayChangePer) : '-';
    return {condition, yChange};
}

module.exports = {
    getState,
    setTodayStartCapital,
    setYesterdayResult,
    initCashForDay,
    getOldCashRemaining,
    registerSellCash,
    registerBuyCash,
    isConditionOkForTotal,
    isTodayAssetDownForTotal,
    getTodayAssetDownFilterStateForTotal,
    getTodayAssetChangePercentForTotal,
    shouldBlockBuy,
    getBuyBlockTagForTotal,
    getSellCashTagPrefixForTotal,
    logBuyBlockTransition,
    logSellCashTransition,
    getConditionState,
    getCarryLockedCash,
    isCashTrackingEnabled,
    shouldLimitBuyToOldCash,
    shouldSkipJiJiBuJinShort,
    getAllowedBuyAmount,
    getBuyBlockLogFields,
    getSellCashGateSummary,
    getAssetDefenseBypassState,
    getAvgCurrentToPast4BelowPast6BuyBlockState,
};
