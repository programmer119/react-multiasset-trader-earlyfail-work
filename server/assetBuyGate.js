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
            sellCashBlockLogged:false,
            sellCashClipLogged:false,
        };
    }
    return globalval.assetBuyGate;
}

const setTodayStartCapital = (totalcapital) => {
    const state = getState();
    state.todayStartCapital = totalcapital || 0;
    globalval.assetBuyGateTodayStartCapital = state.todayStartCapital;
}

const setYesterdayResult = (today, totalcapital, beforetotalcapital, changedper) => {
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
    state.sellCashBlockLogged = false;
    state.sellCashClipLogged = false;
    globalval.assetBuyGatePreviousSellCash = state.previousSellCash;
    globalval.assetBuyGateTodayCashDate = state.todayCashDate;
    globalval.assetBuyGateTodayStartCanUseCash = state.todayStartCanUseCash;
    globalval.assetBuyGateTodaySellCash = state.todaySellCash;
    globalval.assetBuyGateTodayOldCashUsed = state.todayOldCashUsed;
}

const getCarryLockedCash = () => {
    const mode = defulatConfig.assetupsellcashcarrymode;
    if(!defulatConfig.useassetupsellcashgate || !mode)
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
    if(!defulatConfig.useassetupsellcashgate || addmoney <= 0)
        return;
    const state = getState();
    state.todaySellCash = (state.todaySellCash || 0) + addmoney;
    globalval.assetBuyGateTodaySellCash = state.todaySellCash;
}

const registerBuyCash = (buymoney) => {
    if(!defulatConfig.useassetupsellcashgate || !buymoney)
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

const isConditionOkForTotal = (totalcapital) => {
    return getConditionState(totalcapital).ok;
}

const shouldSkipJiJiBuJinShort = (account, tradestockdic, getAllStockCapitalValue, getCanUseCashAmount) => {
    if(!defulatConfig.useassetupsellcashgate)
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
    if(!defulatConfig.useassetupsellcashgate || isConditionOkForTotal(totalcapital))
        return requestedBuyAmount;

    const requestedBuyMoney = buyMoneyByOneStock * requestedBuyAmount;
    const oldCashRemaining = getOldCashRemaining();
    if(requestedBuyMoney <= oldCashRemaining)
        return requestedBuyAmount;

    const allowedBuyAmount = Math.floor(oldCashRemaining / buyMoneyByOneStock);
    const state = getState();
    const isClip = (buyMoneyByOneStock * allowedBuyAmount) > 0;
    const countKey = isClip ? 'sellCashClipCount' : 'sellCashBlockCount';
    const loggedKey = isClip ? 'sellCashClipLogged' : 'sellCashBlockLogged';
    state[countKey] = (state[countKey] || 0) + 1;
    if(useconsolelog && addSimulationLog)
    {
        const condition = getConditionState(totalcapital);
        const yChange = Number.isFinite(condition.state.yesterdayChangePer) ? GetChangePerLog(condition.state.yesterdayChangePer) : '-';
        const oldRemain = getOldCashRemaining();
        const carryLock = getCarryLockedCash();
        const tag = isClip ? 'ASSET_BUY_GATE_SELLCASH_CLIP_START' : 'ASSET_BUY_GATE_SELLCASH_BLOCK_START';
        if(!condition.state[loggedKey])
        {
            condition.state[loggedKey] = true;
            addSimulationLog(`[${tag}] ${timeString} ${reason} ${ticker} ${name} H:${condition.hasHistory ? 'Y' : 'N'} Y:${condition.yesterdayUp ? 'KEEP' : 'DN'}(${condition.state.yesterdayDate || '-'}/${yChange}) T:${condition.todayUp ? 'KEEP' : 'DN'} start:${Math.round(condition.startCapital)} cur:${Math.round(totalcapital)} cash:${Math.round(canusecashamount)} oldRemain:${Math.round(oldRemain)} carryLock:${Math.round(carryLock)} todaySell:${Math.round(condition.state.todaySellCash || 0)} req:${Math.round(requestedBuyMoney)} allow:${Math.round(buyMoneyByOneStock * allowedBuyAmount)}`);
        }
    }
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
    getConditionState,
    getCarryLockedCash,
    shouldSkipJiJiBuJinShort,
    getAllowedBuyAmount,
    getBuyBlockLogFields,
    getSellCashGateSummary,
};
