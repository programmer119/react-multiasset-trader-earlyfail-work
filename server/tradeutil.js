const {
    Market_sell_order, Market_buy_order, Market_cancel_order, Issue_access_token, Getaccount
} = require('./serverpacket')
const fs = require('fs');
const clone = require('rfdc')();
const {_} = require('lodash')
const {IsNaq, GetSellPercent, GetBuyPercent, GetLocalDate, GetLocalDateStr, GetIndexTicker, GetMarketName,
    defulatConfig, AddSimulationLog, IsOneStockSimulation} = require('./util');
const {
    validTradetime, validFetchtime,
    KR_TIME, AM_TIME, MORNING_07H,
    GetAlmostCloseTime, GetAlmostOpenTime,
} = require('./tradetimeutil');
const telegramapi = require(`./telegram`)
const {GetYMD, MoveAverage, GetCloses,
    CalculateEMA, Getslices,
    IsETF, IsPrimary, Hasuplimit, GetPassedDayFromBought, IsRecheadUpLimit, IsRecheadLimit
    , IsLongStyle, IsShortStyle, GetTradeStyle, GetHighcloseFromBoughtDay, volumefilter,
    IsBuyDayIsToday, IsBuyDayIsOverday, GetLastDateTime, GetChangePer, GetChangePerLog} = require('./tradeutilcommon');
const tradeutilsma = require('./tradeutil_sma');
const globalval = require('./globalval');
const {GetProfitGivebackPreset} = require('./profitgivebackpresets');
const {GetProfitToLossPreset} = require('./profittolosspresets');
const {GetEarlyProfitLockPreset} = require('./earlyprofitlockpresets');
const {GetPartialEntryPreset} = require('./partialentrypresets');
const assetBuyGate = require('./assetBuyGate');
let cachedPartialEntryMode = undefined;
let cachedPartialEntryPreset = null;
let cachedPartialEntryModeKey = '';
let cachedAlmostCloseDbId = undefined;
/////////////////////////////////////////////////


const useDivEnoughNeedBuyMoney = true;  // ?뚯?湲덉씠 ?꾩슂??湲덉븸???덈컲 ?댁긽?쇰븣留?二쇱떇 援ъ엯
let percentByoneBuy = defulatConfig.percentByoneBuy; //TEST1             // 1醫낅ぉ??珥??먯궛??percentByoneBuy / 100 留뚰겮 援щℓ?쒕떎

const divminpercent = defulatConfig.divminpercent; // 履쇨컻湲??덉슜?잛닔 0.45: 1?? 0.2: 2??0.1: 3??

// ?덈Т ??? ( RSI媛 留롮씠 ?ㅻⅨ ) ??대컢???ъ? ?딄쾶 ??
const useBuyToGooTimeRSI = defulatConfig.useBuyToGooTimeRSI;// true;
const notToBuyPercentRsiUnder = defulatConfig.notToBuyPercentRsiUnder;// = 2.0; // 1, 2, 3, 4 以?2媛 媛???섏씡瑜좎씠 醫뗭쓬
const notToBuyPercentRsiOver = defulatConfig.notToBuyPercentRsiOver;// = 2.0; // 1, 2, 3, 4 以?2媛 媛???섏씡瑜좎씠 醫뗭쓬

// ?덈Т ??? ( 留롮씠 ?ㅻⅨ ) ??대컢???ъ? ?딄쾶 ??
const useBuyToGooTime = false;          
const nothightToBuypercent = 2.5;

// 二쇱떇 履쇨컻湲?
let divsellpercent = defulatConfig.divsellpercent;//20.950;    // 履쇨컻?붽린??理쒖냼 ?먰빐 議곌굔

const useconsolelog = defulatConfig.useconsolelog;

let maxonebuymoney = 0;        // 1醫낅ぉ??理쒕? ?쒓뎅 1000留뚯썝, 誘멸뎅 留뚮떖??源뚯?留?援щℓ?쒕떎
const day26 = 26;
const day5 = 5;
const stoIdxStr1 = `fastSTO${0}`;
const stoIdxStr2 = `fastSTO${1}`;
const stoIdxStr3 = `fastSTO${2}`;

const rsilow    = defulatConfig.rsilow;//+10;
const rsihigh   = defulatConfig.rsihigh;//-10;
const rsilow2   = 40;//+10;
const rsihigh2  = 60;//-10;

const rsinexttradeper = 2;
const stockcompletedelaySec = 10;

const GetConfig=()=>{    
    // console.log('clone : ', clone);
    // console.log('_ : ', _)
    // console.log('_.cloneDeep : ', _.cloneDeep)
    return `buyp:${percentByoneBuy} enougBuyToHalfMoney:${useDivEnoughNeedBuyMoney} useBuyToGooTime:${useBuyToGooTime}(${nothightToBuypercent}) useBuyToGooTimeRSI:${useBuyToGooTimeRSI}(${notToBuyPercentRsiUnder}) useRecyc:${defulatConfig.useRecyc} reclowp:${divsellpercent}`;
}

const RSIOptions = [
    {rsilow:30, rsihigh:70, rsiDay:14},
    {rsilow:30, rsihigh:70, rsiDay:7},
]


let almostCloseTime;
const AverageClose = (arrs) => {            
    let sum = 0;
    arrs.forEach((arr)=>
    {
        sum += parseInt(arr.close);
    });
    return sum / arrs.length;
};


const STDEVPA = (numbers) => {
    const mean = numbers.reduce((acc, item) => acc + item) / numbers.length;
    return Math.sqrt(numbers.reduce((acc, item) => acc + Math.pow((parseFloat(item) -mean), 2)))
  }

const GetLatestmacdLongShortchartdatasidx=(chartdatas, chartdatasidx)=>{
    for (let i = chartdatasidx-1; i >= 0; --i) 
    {
        const macdlongshort = chartdatas[i].macdlongshort;
        if(GetTradeStyle(macdlongshort) != "NONE")
        {
            return i;
        }
    }

    return -1;
}

const GetBeforeMonthdata=(chartdatas, chartdatasidx)=>{
    curdata = chartdatas[chartdatasidx];
    if(!curdata)
        return null;

    curdate = curdata.date;
    for (let i = chartdatasidx-1; i >= 0; --i) 
    {
        const tempdata = chartdatas[i];
        
        if(tempdata.date.getMonth() !== curdate.getMonth())
            return tempdata;
    }

    return null;
}

const IsLatestTradeRefundsShort=(chartdatas, chartdatasidx)=>{        
    const latestmacdLongShortchartdatasidx = GetLatestmacdLongShortchartdatasidx(chartdatas, chartdatasidx)
    if(latestmacdLongShortchartdatasidx === -1)
        return false;

    const shortdaychart = chartdatas[latestmacdLongShortchartdatasidx];
    const latestmacdLongShort = shortdaychart.macdlongshort;

    return latestmacdLongShort === "MACDSHORT_REFUNDS";
}

const GetLatestTradechart=(chartdatas, chartdatasidx)=>{        
    const latestmacdLongShortchartdatasidx = GetLatestmacdLongShortchartdatasidx(chartdatas, chartdatasidx)
    if(latestmacdLongShortchartdatasidx === -1)
        return null;

    const daychart = chartdatas[latestmacdLongShortchartdatasidx];
    return daychart;
}

const GetLatestTradestyle=(chartdatas, chartdatasidx)=>{
    const daychart = GetLatestTradechart(chartdatas, chartdatasidx);
    if(daychart===null)
        return '';

    const latestmacdLongShort = daychart.macdlongshort;

    return latestmacdLongShort;    
}

////////////////////////////////////////// VOLUME STYLE //////////////////////////////////////////
const GetVolumeStyle=(volumestyle)=>{
    if(volumestyle==="")
        return "";

    volumestyle = volumestyle.toUpperCase();
    if(volumestyle.includes("HIGH"))
        return "HIGH";
    else if(volumestyle.includes("LOW"))
        return "LOW";

    return "";
}

const GetLatestVolumechartdatasidx=(chartdatas, chartdatasidx)=>{
    for (let i = chartdatasidx-1; i >= 0; --i) 
    {
        const volumestyle = chartdatas[i].volume60HighLow;
        if(GetVolumeStyle(volumestyle) != "")
        {
            return i;
        }
    }

    return -1;
}

const GetLatestVolumechart=(chartdatas, chartdatasidx)=>{        
    const latestVolumechartdatasidx = GetLatestVolumechartdatasidx(chartdatas, chartdatasidx)
    if(latestVolumechartdatasidx === -1)
        return null;

    const daychart = chartdatas[latestVolumechartdatasidx];
    return daychart;
}
////////////////////////////////////////// VOLUME STYLE //////////////////////////////////////////


const GetVolumes=(sliceDatas)=>
{
    return sliceDatas.reduce(function(accum,cur){accum.push(cur.volume);return accum},[])
}

const Sum = (arrs) => {
    let sum = 0;
    arrs.forEach((arr)=>
    {
        sum += Number(arr);
    });
    return sum;
};


const Highest=(slicedata)=>{
    // return Math.max(...slicedata);
    return slicedata.map(o => o.high).reduce((max, curr) => max < curr ? curr : max );
}

const Highest2=(slicedata)=>{
    // return Math.max(...slicedata);
    return slicedata.map(o => o).reduce((max, curr) => max < curr ? curr : max );
}

const Lowest=(slicedata)=>{
    // return Math.min(...slicedata);
    return slicedata.map(o => o.low).reduce((min, curr) => min > curr ? curr : min );
}

const Lowest2=(slicedata)=>{
    // return Math.min(...slicedata);
    return slicedata.map(o => o).reduce((min, curr) => min > curr ? curr : min );
}

// let lowPriceSellPercent = 1.4;
// function setuselowPriceSellPercent(value)
// {
//     lowPriceSellPercent = value;
// }
let laststolongshort = "";


// long ?ㅼ쓬??k媛 湲곗슱?댁?硫?short
const IsSTOshortFast=(now, prev, stoIdxStr)=>
{    
    const prevSTO = prev[stoIdxStr];
    const nowSTO = now[stoIdxStr];

    const isValid = (prevSTO.K > prevSTO.D && nowSTO.K < prevSTO.K * 0.8 ) // 0.8, 0.7, 0.6
    // && prevSTO.K > 80 && nowSTO.K < 80
    if(isValid)
        laststolongshort = "FASTSTOSHORT_1";
    return isValid;
}
// ?깊닾1. 2???곗냽 stochastic fast k媛 d蹂대떎 ?щ㈃ long, 2?쇱뿰??fast k媛 d蹂대떎 ?묒쑝硫?short, 
const IsSTOlong=(now, prev, stoIdxStr)=>{
    if(laststolongshort === "SLOWSTOLONG")
        return false;

    const prevSTO = prev[stoIdxStr];
    const nowSTO = now[stoIdxStr];    

    const isValid = (prevSTO.K > prevSTO.D && nowSTO.K > nowSTO.D );

    if(isValid)
        laststolongshort = "SLOWSTOLONG";
    return isValid;
}

const IsBBToNarrow=(chartdatas, chartdatasidx, curelement)=>
{
    const latestmacdLongShortchartdatasidx = GetLatestmacdLongShortchartdatasidx(chartdatas, chartdatasidx);
    if(latestmacdLongShortchartdatasidx === -1)
        return false;

    const befbbwidth = chartdatas[latestmacdLongShortchartdatasidx].bb.top - chartdatas[latestmacdLongShortchartdatasidx].bb.bottom;
    const curbbwidth = curelement.bb.top - curelement.bb.bottom;

    return curbbwidth < befbbwidth;
}

const IsdivergenceToBig=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    
    if(!curelement || !beforeelement)
        return false;

    if(curelement.macd.divergence > beforeelement.macd.divergence * 1.5)
        return true;

    return false;
}

const IsBBToBig=(chartdatas, chartdatasidx)=>
{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    if(!curelement || !beforeelement)
        return false;
    
    if(curelement.close < beforeelement.close)
        return false;

    if(curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
        return false;

    if(curelement.sma5 < beforeelement.sma5)
        return false;

    const befbbwidth = beforeelement.bb.top - beforeelement.bb.bottom;
    const curbbwidth = curelement.bb.top - curelement.bb.bottom;

    const bigconst = 1.3;
    if(curbbwidth > befbbwidth * bigconst || befbbwidth > curbbwidth * bigconst)
        return true;

    return false;
}

const IsCloseBreakBBTop=(chartdatas, chartdatasidx)=>
{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    if(!curelement || !beforeelement)
        return false;
    
    // if(curelement.close < beforeelement.close)
    //     return false;

    // if(curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
    //     return false;

    // if(curelement.sma5 < beforeelement.sma5)
    //     return false;

    return((curelement.close > curelement.bb.top)
     &&(beforeelement.high < beforeelement.bb.top))    
}

const IsShortLowPrice=(chartdatas, chartdatasidx, averagebuyprice)=>{    
    let lowpercent = defulatConfig.lowPriceSellPercent;
    if (globalval.excelvalues) 
    {

        if(defulatConfig.usepersonstocktrade || defulatConfig.usebreakoutstocklist)
            lowpercent = globalval.excelvalues.SONJULRATE;
    }
    
    const curelement = chartdatas[chartdatasidx];
    const isPriceShort = curelement.close < averagebuyprice * (100+lowpercent) * 0.01;
    return isPriceShort;
}

const IsShortHighPrice=(chartdatas, chartdatasidx, averagebuyprice)=>{    
    if(averagebuyprice <= 0)
        return false;
    const curelement = chartdatas[chartdatasidx];
    const isPriceShort = curelement.close > averagebuyprice * (100+defulatConfig.highPriceSellPercent) * 0.01;
    return isPriceShort;
}

const GetbbBottomGap=(curelement, beforeelement)=>{    
    const max = Math.max(curelement.bb.bottom, beforeelement.bb.bottom);
    const min = Math.min(curelement.bb.bottom, beforeelement.bb.bottom);

    return (max/min);
}

const GetTopGapRate=(curelement, beforeelement)=>{    
    const max = Math.max(curelement.bb.top, beforeelement.bb.top);
    const min = Math.min(curelement.bb.top, beforeelement.bb.top);

    return (max/min);
}

const GetBBChangeRate=(curelement, beforeelement)=>{    
    const bottomTopGap = GetbbBottomGap(curelement, beforeelement) - GetTopGapRate(curelement, beforeelement);
    return Math.abs(bottomTopGap);
}

const GetBBWitdh=(curelement)=>{
    return (curelement.bb.top - curelement.bb.bottom)
}

const GetBBTopBottomBothWide=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    return ((curelement.bb.top > beforeelement.bb.top) && (curelement.bb.bottom < beforeelement.bb.bottom))
}

const IsBBShort=(chartdatas, chartdatasidx)=>
{
    return false;
    const latestmacdLongShortchartdatasidx = GetLatestmacdLongShortchartdatasidx(chartdatas, chartdatasidx);
    if(latestmacdLongShortchartdatasidx === -1)
        return false;

    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const buydayelement = chartdatas[latestmacdLongShortchartdatasidx];

    if(GetBBWitdh(curelement)>GetBBWitdh(buydayelement)
    &&(GetbbBottomGap(curelement, buydayelement) > 1.2)
    &&(GetBBChangeRate(curelement, buydayelement) < 0.2)
    &&(((curelement.bb.bottom) > (beforeelement.bb.bottom)))
    &&(curelement[stoIdxStr1].K < (beforeelement[stoIdxStr1].K-30))
    // &&(beforeelement[stoIdxStr1].K > 80)
    )
    {
        return true;
    }

    return false;
}

// sto5Days ?쒕엻?묒씠 ?ш퀬, 蹂쇰ⅷ??理쒓렐 以??ш퀬, 蹂쇰┛?몃객????븘由??섎㈃ ?먮ℓ
const IsSTOshort=(chartdatas, chartdatasidx)=>{    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    if((curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K - 70) 
        )
    return true;

    // const curDate = chartdatas[chartdatasidx].date;
    
    // if((chartdatasidx>day26)) 
    // {
    //     if((beforeelement[stoIdxStr1].K > 70) 
    //         && (curelement[stoIdxStr1].K < 20)
    //     ){
    //         let slicedatas = chartdatas.slice(chartdatasidx-day5+1, chartdatasidx+1);
    //         slicedatas = slicedatas.reduce(function(accum, cur){accum.push({high:cur.volume}); return accum;},[])
    //         const day5HighestVolume = Highest(slicedatas);
    //         if(curelement.volume >= day5HighestVolume)
    //         {
    //             return true;
    //             // if(IsBBShort(chartdatas, chartdatasidx))
    //             //     return true;
    //         }
    //     }
    // }
    
    return false;
}


const IsSTOshort2=(chartdatas, chartdatasidx)=>{    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    for(let stoindex = 0; stoindex < 3; ++stoindex)
    {
        const stoIdxStr = `fastSTO${stoindex}`;
        if(!curelement || !beforeelement || !curelement[stoIdxStr] || !beforeelement[stoIdxStr])
            return false;

        if(stoindex === 0 && curelement[stoIdxStr].K > (beforeelement[stoIdxStr].K - 25))
            return false;

        if(stoindex === 0 && curelement[stoIdxStr].K > (beforeelement[stoIdxStr].K - 50))
            return false;
        if(stoindex === 1 && curelement[stoIdxStr].K > (beforeelement[stoIdxStr].K - 10))
            return false;
        if(stoindex === 2 && curelement[stoIdxStr].K > (beforeelement[stoIdxStr].K - 10))
            return false;              

        if(((curelement[stoIdxStr].D) < curelement[stoIdxStr].K+0.5) || ((beforeelement[stoIdxStr].D) < beforeelement[stoIdxStr].K+0.5))
            return false;        

        if(!(curelement[stoIdxStr].D < beforeelement[stoIdxStr].D-10))
            return false;        
        if(beforeelement[stoIdxStr].K < 70)
            return false;
    }

    // if(curelement[stoIdxStr1].K > (beforeelement[stoIdxStr1].K - 25))
    //     return false;    

    // if(!IsBBShort(chartdatas, chartdatasidx))
    //     return false;

    return true;
}

const IsSTOshort3=(chartdatas, chartdatasidx)=>{    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    
    // const curDate = chartdatas[chartdatasidx].date;
    
    if((chartdatasidx>day26)) 
    {
        if(curelement[stoIdxStr1].K < 60 &&
            curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K-30 &&
            curelement[stoIdxStr1].K < curelement[stoIdxStr1].D &&
            beforeelement[stoIdxStr1].K > beforeelement[stoIdxStr1].D
        ){
            return true;
        }
    }
    
    return false;
}

const IssmaUpRight=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const before1element = chartdatas[chartdatasidx-1];    
    const before2element = chartdatas[chartdatasidx-1];        

    const sma5valid = curelement.sma5>before1element.sma5 || (curelement.sma5-before1element.sma5 < before1element.sma5-before2element.sma5);
    const sma20valid = curelement.sma20>before1element.sma20 || (curelement.sma20-before1element.sma20 < before1element.sma20-before2element.sma20);

    return (sma5valid && sma20valid);
}

const Ismacdlong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    return ((curelement.macd.macd > curelement.macd.signal)
    && (beforeelement.macd.macd < beforeelement.macd.signal)
    );    
}

const Ismacdup=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    
    
    return ((curelement.macd.macd > curelement.macd.signal)
    );    
}

const IsmacdlongYesterday=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    
    const before2element = chartdatas[chartdatasidx-2];

    if(!curelement || !beforeelement || !before2element)
        return false;

    return ( (curelement.macd.macd > curelement.macd.signal)
    && (beforeelement.macd.macd > beforeelement.macd.signal)
    && (before2element.macd.macd < before2element.macd.signal)
    );    
}

const IsmacdlongCrossOverZero=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    return (curelement.macd.macd > 0 &&  beforeelement.macd.macd < 0);
}

// const IslongAfterRefunds=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const beforeelement = chartdatas[chartdatasidx-1];    
//     const before2element = chartdatas[chartdatasidx-2];
//     const before3element = chartdatas[chartdatasidx-3];

//     if(!curelement || !beforeelement || !before2element || !before3element)
//         return false;

//     return (
//         (IsLatestTradeRefundsShort(chartdatas, chartdatasidx) 
//         && beforeelement.macdlongshort != "MACDSHORT_REFUNDS"
//         // && curelement.macd.divergence > 0
//         && before2element.macd.divergence < before3element.macd.divergence)
//         && beforeelement.macd.divergence > before2element.macd.divergence
//         && curelement.macd.divergence > beforeelement.macd.divergence
//         && curelement.macd > beforeelement.macd
//     );    
// }

const IslongAfterRefunds=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    
    const before2element = chartdatas[chartdatasidx-2];

    if(!curelement || !beforeelement || !before2element)
        return false;

    return (
        (IsLatestTradeRefundsShort(chartdatas, chartdatasidx) 
        && beforeelement.macdlongshort != "MACDSHORT_REFUNDS"
        // && curelement.macd.divergence > 0
        && beforeelement.macd.divergence < before2element.macd.divergence)        
        && curelement.macd.divergence > beforeelement.macd.divergence
        && curelement.macd > beforeelement.macd
    );    
}

const IsmacdlongZeroUnderMACD=(chartdatas, chartdatasidx)=>{    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    return curelement.macd.macd < 0;
}

const IsmacdlongZeroOver=(chartdatas, chartdatasidx)=>{            
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    return curelement.macd.macd > 0;
}

const IsmacdlongZeroOverMACD=(chartdatas, chartdatasidx)=>{            
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const before2element = chartdatas[chartdatasidx-2];

    if(curelement.macd.macd > 0)
    {
        // ?ㅻ뒛 蹂쇰ⅷ???댁젣蹂대떎 ?믪쓬
        if(curelement.volume > beforeelement.volume)
            return true;

        // zero over long ?댁젣 蹂쇰ⅷ??洹???理쒓퀬 : ?ㅼ뼱媛꾧쾶 寃곌낵媛 ??醫뗭쓬
        let slicedatas = chartdatas.slice(chartdatasidx-day5, chartdatasidx);
        slicedatas = slicedatas.reduce(function(accum, cur){accum.push({high:cur.volume}); return accum;},[])
        const day5HighestVolume = Highest(slicedatas);
        if(beforeelement.volume >= day5HighestVolume)
        {
            return true;
        }    
    }

    return false;
}

const Ismacdshort=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    return ((curelement.macd.macd < curelement.macd.signal)
    && (beforeelement.macd.macd > beforeelement.macd.signal)
    );    
}


const Ismacdstolong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;
    // const macdlong = (curelement.macd.macd > curelement.macd.signal) && (beforeelement.macd.macd < beforeelement.macd.signal);
    // const stolong = (curelement[stoIdxStr1].K > curelement[stoIdxStr1].D) && (beforeelement[stoIdxStr1].K < beforeelement[stoIdxStr1].D)
    const macdlong = (curelement.macd.macd > curelement.macd.signal);
    const stolong = (curelement[stoIdxStr1].K > beforeelement[stoIdxStr1].K);

    return macdlong && stolong;
}

const Ismacdstoshort=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;    
    // const macdlong = (curelement.macd.macd < curelement.macd.signal) && (beforeelement.macd.macd > beforeelement.macd.signal);
    // const stolong = (curelement[stoIdxStr1].K < curelement[stoIdxStr1].D) && (beforeelement[stoIdxStr1].K > beforeelement[stoIdxStr1].D)
    const macdlong = (curelement.macd.macd < curelement.macd.signal);
    const stolong = (curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K);

    // 2 case
    // if(curelement.macd.divergence < beforeelement.macd.divergence && curelement.close < curelement.sma5)
    //     return true;

    return macdlong && stolong;
}

const IsmacdstoCrosslong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;
    // const macdlong = (curelement.macd.macd > curelement.macd.signal) && (beforeelement.macd.macd < beforeelement.macd.signal);
    
    const stoLongUpRightCross = true;//(curelement[stoIdxStr1].K > curelement[stoIdxStr1].D) && (beforeelement[stoIdxStr1].K < beforeelement[stoIdxStr1].D)
    let macdlong;
    
    // if(curelement.sma20 < beforeelement.sma20)
    // {
    //     macdlong = curelement.macd.macd < beforeelement.macd.macd;
    // }
    // else
    //     macdlong = curelement.macd.macd > beforeelement.macd.macd;

    // const macdsignalgap = Math.abs(curelement.macd.macd / beforeelement.macd.signal);
    // if(macdsignalgap < 0.9)
    //     return false;

    macdlong = (curelement.macd.macd > curelement.macd.signal) && (beforeelement.macd.macd < beforeelement.macd.signal);
    if(macdlong && stoLongUpRightCross && CheckMacdGAP(curelement.macd.macd, beforeelement.macd.signal, curelement.macd.divergence))
    {   
        console.log('IsmacdstoCrosslong CheckMacdGAP');
        return false;

    }
        

    return macdlong && stoLongUpRightCross;
}


const IsmacdstoCrossshort=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;
    // const macdlong = (curelement.macd.macd > curelement.macd.signal) && (beforeelement.macd.macd < beforeelement.macd.signal);
    const stolong = true;//curelement[stoIdxStr1].K < curelement[stoIdxStr1].D && (beforeelement[stoIdxStr1].K > beforeelement[stoIdxStr1].D)
    //const macdlong = (curelement.macd.macd > curelement.macd.signal);
    //const stolong = (curelement[stoIdxStr1].K > beforeelement[stoIdxStr1].K);
    let macdshort; 
    // if(curelement.sma20 > beforeelement.sma20)
    // {
    //     macdshort = (curelement.macd.macd > beforeelement.macd.macd);
    // }
    // else
    //     macdshort = (curelement.macd.macd < beforeelement.macd.macd);

    // const macdsignalgap = Math.abs(curelement.macd.macd / beforeelement.macd.signal);
    // if(macdsignalgap < 0.9)
    //     return false;

    macdshort = (curelement.macd.macd < curelement.macd.signal) && (beforeelement.macd.macd > beforeelement.macd.signal);

    if(macdshort && stolong && CheckMacdGAP(curelement.macd.macd, beforeelement.macd.signal, curelement.macd.divergence))
    {
        console.log('IsmacdstoCrossshort CheckMacdGAP');
        return false;    
    }   

    return macdshort && stolong;
}

const IsRSIlongCross=(tradestock)=>{
    if(!defulatConfig.longbyrsi)
        return false;

    const chartdatas = tradestock.chartdatas;;
    const chartdatasidx = tradestock.curchartdataidx;

    if(defulatConfig.usersibuyvolume)
    {
        if(!Rsibuyvolume(tradestock))
            return false;
    }

    if(defulatConfig.usersivolumefilter)
    {
        if(!volumefilter(tradestock, 20, 3))
            return false; 
    }

    // ?묐?吏???곸듅?⑤낫???믪? ?곸듅?⑥쓽 醫낅ぉ留?援щℓ?쒕떎.
    if(defulatConfig.useupratelong)
    {
        const idx0gapsma = tradeutilsma.GetSMAGapPer(kospitradestock.chartdatas, kospitradestock.curchartdataidx, [5,10]);
        const idx1gapsma = tradeutilsma.GetSMAGapPer(kosdaqtradestock.chartdatas, kosdaqtradestock.curchartdataidx, [5,10]);
        const gapsma = tradeutilsma.GetSMAGapPer(chartdatas, chartdatasidx, [5,10]);
        if(gapsma < idx0gapsma || gapsma < idx1gapsma)
            return true;
    }


    if(defulatConfig.usersi_5_10_nobuy)
    {
        const issmaarrange = tradeutilsma.IsSMAArrange(chartdatas, chartdatasidx, [5,10]);
        if(issmaarrange)
            return false;
    }
    else if(defulatConfig.usersi_5_20_nobuy)
    {
        const issmaarrange = tradeutilsma.IsSMAArrange(chartdatas, chartdatasidx-1, [5,20]);
        if(issmaarrange)
            return false;
    }
    else if(defulatConfig.usersi_10_20_nobuy)
    {
        const issmaarrange = tradeutilsma.IsSMAArrange(chartdatas, chartdatasidx-1, [10,20]);
        if(issmaarrange)
            return false;
    }
    else if(defulatConfig.usersi_20_10_5_buy) // ?ш쾶??뱁뙆?멸꼍?곕쭔 ?곕떎
    {
        const issmaarrange = tradeutilsma.IsSMAArrange(chartdatas, chartdatasidx-1, [20,10,5]);
        if(!issmaarrange)
            return false;
    }
    else if(defulatConfig.useSMA20upbuy) // ?ш쾶??뱁뙆?멸꼍?곕쭔 ?곕떎
    {
        const issmaarrange = tradeutilsma.IsSMAUP(chartdatas, chartdatasidx-1, 20);
        if(!issmaarrange)
            return false;
    }
    
    
    const todayelement = chartdatas[chartdatasidx];

    if(!todayelement || !todayelement.rsi)
        return false;
    
    let curidx = chartdatasidx;//todayelement.rsi.RSI > rsihigh2 ? chartdatasidx-1 : chartdatasidx-0;
    const curelement = chartdatas[curidx];
    const beforeelement = chartdatas[curidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi) 
        return false;
    if(!beforeelement.rsi)
        return false;


    const rsilong = curelement.rsi.RSI > curelement.rsi.signal;
    if(defulatConfig.rsilongup)
        return rsilong;

    return (rsilong &&
        beforeelement.rsi.RSI < beforeelement.rsi.signal
    )
}

const Rsibuyvolume=(tradestock)=>{ // chartdatas, chartdatasidx
    const chartdatas = tradestock.chartdatas;;
    const chartindex = tradestock.curchartdataidx;

    const curelement = chartdatas[chartindex];
    const beforeelement = chartdatas[chartindex-1];    
    if(!curelement || !beforeelement)
        return false;

    let beforevol = 0;
    if(defulatConfig.usersibuyvolume == 'yesterdayclose') 
        beforevol = beforeelement.volume;
    return curelement.volume > beforevol;
}

// ?뱀씪 ?붿븯?붾뜲 ?섎せ?먭굅 ?뱀씪 醫낅즺 20遺꾩쟾 ?ш뎄留?
const IsRSIlongCrossRefunds=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx];        
    if(!curelement || !beforeelement)
        return false;

    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();

    if((hour + minute) < almostCloseTime)
        return false;
    
    if(!curelement.macdlongshort.includes('SHORT'))
        return false;

    if(!curelement.rsi)
        return false;
    if(!beforeelement.rsi)
        return false;
    return (curelement.rsi.RSI > curelement.rsi.signal);
}

const IsRSIshortCross=(chartdatas, chartdatasidx)=>{
    const todayelement = chartdatas[chartdatasidx];

    if(!todayelement || !todayelement.rsi)
        return false;
    
    let curidx = chartdatasidx;//todayelement.rsi.RSI < rsilow2 ? chartdatasidx-1 : chartdatasidx-0;
    const curelement = chartdatas[curidx];
    const beforeelement = chartdatas[curidx-1];    

    if(!curelement || !beforeelement)
        return false;
    if(!curelement.rsi)
        return false;
    if(!beforeelement.rsi)
        return false;
    
    const preval = defulatConfig.ToSellPercentRsiOver;//10;//20.0//0;//5.0;
    const rsishortRelativeWithYesterday = defulatConfig.rsishortRelativeWithYesterday;    
    const beforedayshortvalid = rsishortRelativeWithYesterday ? beforeelement.rsi.RSI > beforeelement.rsi.signal : true;
    return ((curelement.rsi.RSI < (curelement.rsi.signal + preval))
        && beforedayshortvalid
    )
}


const IsRSIshortDown=(chartdatas, chartdatasidx)=>{
    const todayelement = chartdatas[chartdatasidx];

    if(!todayelement || !todayelement.rsi)
        return false;
    
    let curidx = chartdatasidx;//todayelement.rsi.RSI < rsilow2 ? chartdatasidx-1 : chartdatasidx-0;
    const curelement = chartdatas[curidx];
    const beforeelement = chartdatas[curidx-1];    

    if(!curelement || !beforeelement)
        return false;
    if(!curelement.rsi)
        return false;
    if(!beforeelement.rsi)
        return false;
    
    const preval = defulatConfig.ToSellPercentRsiOver;//10;//20.0//0;//5.0;
    return (curelement.rsi.RSI < (curelement.rsi.signal + preval))
}

const IsAlmostCloseTime=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.tradeOnlyCloseTime)
        return true;

    return IsAlmostCloseTimePure(chartdatas, chartdatasidx);
}

const IsAlmostCloseTimePure=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();

    return( (hour + minute) > GetAlmostCloseTime(defulatConfig.db_id) )
}

const IsPersonaltradeCanBuyTime=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return true;
    if(!globalval.excelvalues || !globalval.excelvalues.BUYSTARTTIME || !globalval.excelvalues.BUYENDTIME)
        return true;

    return IsBetweenTime(curelement, globalval.excelvalues.BUYSTARTTIME, globalval.excelvalues.BUYENDTIME);
}

const IsPersonaltradeCanSelTime=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return true;
    if(!globalval.excelvalues || !globalval.excelvalues.SELSTARTTIME)
        return true;

    return IsAlmostTheTime(curelement, globalval.excelvalues.SELSTARTTIME);
}

const IsAlmostTheTime=(curelement, timeString)=>{
    const curDate = curelement.date;
    const hour = curDate.getHours();// * 60    
    const minute = curDate.getMinutes();

    // const timeString = globalval.excelvalues.SELSTARTTIME;
    // 2. ?????먮━ (?쒓컙)? ?????먮━ (遺? 異붿텧
    const hoursString = timeString.substring(0, 2); // '10'
    const minutesString = timeString.substring(2, 4); // '00'

    // 3. ?꾩슂?섎떎硫??レ옄濡??щ???
    const exhours = Number(hoursString); // 10
    const exminutes = Number(minutesString); // 0

    return (hour * 60 + minute) >= (exhours * 60 + exminutes);
}

const IsBetweenTime=(curelement, starttimestr, endtimestr)=>{
    const curDate = curelement.date;
    const hour = curDate.getHours();// * 60    
    const minute = curDate.getMinutes();

    
    // 2. ?????먮━ (?쒓컙)? ?????먮━ (遺? 異붿텧
    const getHM=(timestr)=>{
        const hoursString = timestr.substring(0, 2); // '10'
        const minutesString = timestr.substring(2, 4); // '00'
    
        // 3. ?꾩슂?섎떎硫??レ옄濡??щ???
        const exhours = Number(hoursString); // 10
        const exminutes = Number(minutesString); // 0

        return [exhours,exminutes];
    }
    const timest = getHM(starttimestr);
    const timeend = getHM(endtimestr);
    
    return ((hour * 60 + minute) >= (timest[0] * 60 + timest[1]) 
         && (hour * 60 + minute) <= (timeend[0] * 60 + timeend[1])
);
}

const IsAlmostOpenTimePure=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();

    return( (hour + minute) <= GetAlmostOpenTime(defulatConfig.db_id) )
}


// ?뱀씪 ??붾뜲 ?섎せ?곌굅 ?뱀씪 醫낅즺 20遺꾩쟾 ?섎텋
// if yesterday short && today short => Short! ex) short time tool off
const IsRSIshortCrossRefunds=(chartdatas, chartdatasidx)=>{
    // const todayelement = chartdatas[chartdatasidx];
    // if(!todayelement || !todayelement.rsi)
    //     return false;

    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx];        
    if(!curelement || !beforeelement)
        return false;

    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();
    //const almostCloseTime = 15 * 60 + 10; // 15:10
    //const almostCloseTime = 15 * 60 + 40; // 15:10

    // return ((curdayElement.macd.macd < curdayElement.macd.signal)
    // && (yesterdayElement.macd.macd > yesterdayElement.macd.signal))

    if( (hour + minute) < almostCloseTime )
        return false;
    
    // if(!curelement.macdlongshort.includes('LONG')) 
    //     return false;

    
    // let curidx = chartdatasidx;//todayelement.rsi.RSI < rsilow2 ? chartdatasidx-1 : chartdatasidx-0;
    // const curelement = chartdatas[curidx];
    // const beforeelement = chartdatas[curidx-1];    

    if(!curelement.rsi)
        return false;
    if(!beforeelement.rsi)
        return false;
    return (curelement.rsi.RSI < curelement.rsi.signal);
}

//////////////////////////////////////////////////////
// 援щℓ : ?ㅻ뒛 3??0遺꾧린以 ?댁젣&?ㅻ뒛rsi < 30 && ?ㅻ뒛rsi > ?댁젣rsi  && ?ㅻ뒛 醫낃?>?쒓?.  
// const IsRSIlongOnBottom=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const beforeelement = chartdatas[chartdatasidx-1];    

//     if(!curelement || !beforeelement)
//         return false;

//     if(!curelement.rsi)
//         return false;

//     if(!IsRSICanLong(chartdatas, chartdatasidx))
//         return false;
//     // beforeday test
//     if(!beforeelement.rsi)
//         return;    
//     return (beforeelement.rsi.RSI < rsilow && curelement.rsi.RSI < rsilow &&
//         curelement.rsi.RSI > beforeelement.rsi.RSI &&
//         curelement.close > beforeelement.close
//     )// && curelement.rsi.RSI > rsilow)

//     // return curelement.rsi.RSI <= rsilow;
// }

const IsRSIlongOnBottom=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    if(!IsRSICanLong(chartdatas, chartdatasidx))
        return false;
    // beforeday test
    if(!beforeelement.rsi)
        return;    
    return (
        beforeelement.rsi.RSI < rsilow 
        //&& curelement.rsi.RSI < rsilow
        && curelement.rsi.RSI > beforeelement.rsi.RSI
         //&& curelement.close > beforeelement.close || curelement.close > curelement.close
    )// && curelement.rsi.RSI > rsilow)

    // return curelement.rsi.RSI <= rsilow;
}

//?먮ℓ : ?댁젣rsi > 70 && ?ㅻ뒛rsi < ?댁젣rsi   
const IsRSIshortOnTop=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    // beforeday test
    if(!beforeelement.rsi)
        return;
    return (beforeelement.rsi.RSI > rsihigh && curelement.rsi.RSI < beforeelement.rsi.RSI ) // && curelement.rsi.RSI < rsihigh

    // return curelement.rsi.RSI >= rsihigh;
}

const IsRSIshortOnTopCross=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    // beforeday test
    if(!beforeelement.rsi)
        return;
    return (curelement.rsi.RSI > rsihigh &&
        beforeelement.rsi.RSI > beforeelement.rsi.signal && 
        curelement.rsi.RSI < curelement.rsi.signal ) // && curelement.rsi.RSI < rsihigh

    // return curelement.rsi.RSI >= rsihigh;
}

//?먮ℓ : ?댁젣rsi > ?ㅻ뒛rsi && ?ㅻ뒛rsi < 30   
const IsRSIshortOnBottom=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    // beforeday test
    if(!beforeelement.rsi)
        return;
    return (beforeelement.rsi.RSI > rsilow && curelement.rsi.RSI < rsilow ) // && curelement.rsi.RSI < rsihigh

    // return curelement.rsi.RSI >= rsihigh;
}

const IsBBShortTest=(chartdatas, chartdatasidx)=>
{
    const latestmacdLongShortchartdatasidx = GetLatestmacdLongShortchartdatasidx(chartdatas, chartdatasidx)
    if(latestmacdLongShortchartdatasidx === -1)
        return false;

    const latestTradechart = chartdatas[latestmacdLongShortchartdatasidx];

    if(!latestTradechart)
        return false;

    const latestTradeLongstyle = latestTradechart.macdlongshort;
    if(latestTradeLongstyle === '')
        return false;

    if(latestTradeLongstyle.includes('SHORT'))
        return false;

    // CASE1. high
    // let has70rsihistory = false;
    // for (idx = latestmacdLongShortchartdatasidx+1; idx < chartdatasidx; ++idx) 
    // {
    //     const tempchartdata = chartdatas[idx];
    //     if(tempchartdata.rsi.RSI > rsihigh)
    //     {
    //         has70rsihistory = true;
    //         break;
    //     }
    // }
    // if(!has70rsihistory)
    //     return false;

    // CASE2. middle
    let hasmidclosehistory = false;
    for (idx = latestmacdLongShortchartdatasidx+1; idx < chartdatasidx; ++idx) 
    {
        const tempchartdata = chartdatas[idx];
        if(tempchartdata.close > tempchartdata.bb.middle)
        {
            hasmidclosehistory = true;
            break;
        }
    }
    if(!hasmidclosehistory)
        return false;

    const curelement = chartdatas[chartdatasidx];

    const middlegap = Math.abs(curelement.bb.middle - curelement.close) ;
    const bottomgap = Math.abs(curelement.bb.bottom - curelement.close) ;
    
    return (bottomgap < middlegap);
}

// ?먮ℓ :  留ㅼ닔 ?쒖젏怨??꾩옱 ?쒖젏 ?ъ씠??rsi 70???뚰뙆???좎씠 ?덈떎硫?
// ?꾩옱 媛寃⑹씠 bottom怨?middle ?ъ씠?먯꽌 bottom????媛源뚯슱寃쎌슦 ?먮ℓ
const IsBBshortOnHalfBottom=(chartdatas, chartdatasidx)=>{
    // ?댁젣遺???섎（???ㅻ줈媛硫댁꽌 IsRSIshortOnTop ???대떦?섎뒗 援щℓ?쇱씠 ?몄젣?몄? ?뺤씤?쒕떎
    // 援щℓ???댄썑濡?rsi > 70 ???좎씠 ?덇퀬 BB媛 middle 怨?bottom以?bottom????媛源뚯슦硫??먮ℓ 
    if(!IsBBShortTest(chartdatas, chartdatasidx))
        return false;

    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    // beforeday test
    if(!beforeelement.rsi)
        return;
    return (beforeelement.rsi.RSI > rsilow && curelement.rsi.RSI < rsilow ) // && curelement.rsi.RSI < rsihigh

    // return curelement.rsi.RSI >= rsihigh;
}
//////////////////////////////////////////////////////

const IsRSIlong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    if(!IsRSICanLong(chartdatas, chartdatasidx))
        return false;
    // beforeday test
    if(!beforeelement.rsi)
        return;    
    return (beforeelement.rsi.RSI < rsilow)// && curelement.rsi.RSI > rsilow)

    // return curelement.rsi.RSI < rsilow;
}

const IsRSIshort=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    // beforeday test
    if(!beforeelement.rsi)
        return;
    return (beforeelement.rsi.RSI > rsihigh ) // && curelement.rsi.RSI < rsihigh

    // return curelement.rsi.RSI > rsihigh;
}
const beforetest = false;
const rsi2day = 14;
const IsRSIlong2=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement.rsi)
        return false;
    
    if(chartdatasidx<=rsi2day)
        return false; 
    
    const rsidaystart = chartdatasidx-rsi2day+(beforetest?0:1);
    const rsidayend = chartdatasidx+(beforetest?0:1);
    const compareelement = chartdatas[rsidayend-1];

    // case1.
    const slices = chartdatas.slice(rsidaystart, rsidayend);
    const arrs = GetVolumes (slices).sort((a, b) => b-a);    
    const highest = Highest2(arrs);
    if((curelement.volume < highest * 0.8 || curelement.volume < arrs[3])) 
        return false;

    const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    if(!latestTradechart)
        return false;

    const latestTradeLongstyle = latestTradechart.macdlongshort;
    if(latestTradeLongstyle === '')
        return false;

    if(latestTradeLongstyle.includes('LONG'))
        return false;

    // if(GetBBWitdh(compareelement) > GetBBWitdh(latestTradechart))
    //     return false;
    if(!IsRSICanLong(chartdatas, chartdatasidx))
        return false;
    return compareelement.rsi.RSI < rsilow2;// && curelement.rsi.RSI > beforeelement.rsi.RSI-10;

    // case2. before
    // const slices = chartdatas.slice(chartdatasidx-rsi2day, chartdatasidx);
    // const arrs = GetVolumes (slices).sort((a, b) => b-a);    
    // const highest = Highest2(arrs);
    // if(curelement.volume < highest * 0.8 || curelement.volume < arrs[3])
    //     return false;
    // return curelement.rsi.RSI < rsilow2;// && curelement.rsi.RSI > beforeelement.rsi.RSI-10;


    // beforeday test1
    // if(!beforeelement.rsi)
    //     return;    
    // return (beforeelement.rsi.RSI < rsilow2 && curelement.rsi.RSI > rsilow2)

    // beforeday test2
    // const slices = chartdatas.slice(chartdatasidx-rsi2day, chartdatasidx);
    // const arrs = GetVolumes (slices).sort((a, b) => b-a);    
    // const highest = Highest2(arrs);
    // if(beforeelement.volume < highest)
    //     return false;
    // if(curelement.volume > beforeelement.volume)
    //     return false;
    // if(curelement.close > AverageClose(slices))
    //     return false;

    // // ?대━?붿쨷 湲됰ℓ???쒗븳
    // if(curelement.close < beforeelement.close || curelement.close < beforeelement.open || curelement.close < beforeelement.high)
    //     return false;

    return true;
}

const IsRSIshort2=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement.rsi)
        return false;

    if(chartdatasidx<=rsi2day)
        return false;

    const rsidaystart = chartdatasidx-rsi2day+(beforetest?0:1);
    const rsidayend = chartdatasidx+(beforetest?0:1);
    const compareelement = chartdatas[rsidayend-1];

    // case1.
    const slices = chartdatas.slice(rsidaystart, rsidayend);
    const arrs = GetVolumes (slices).sort((a, b) => b-a);
    const highest = Highest2(arrs);
    // if(curelement.volume < highest * 0.8 || curelement.volume < arrs[3])
    if((curelement.volume < highest * 0.8 || curelement.volume < arrs[3]))
        return false;

    const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    if(!latestTradechart)
        return false;

    const latestTradeLongstyle = latestTradechart.macdlongshort;
    if(latestTradeLongstyle === '')
        return false;

    if(latestTradeLongstyle.includes('SHORT'))
        return false;

    // if(GetBBWitdh(compareelement) > GetBBWitdh(latestTradechart))
    //     return false;

    return compareelement.rsi.RSI > rsihigh2;

    // beforeday test1
    // if(!beforeelement.rsi)
    //     return;
    // return (beforeelement.rsi.RSI >= rsihigh2 && curelement.rsi.RSI < rsihigh2)    

    // beforeday test2
    // const slices = chartdatas.slice(chartdatasidx-rsi2day, chartdatasidx);
    // const arrs = GetVolumes (slices).sort((a, b) => b-a);
    // const highest = Highest2(arrs);
    // if(beforeelement.volume < highest)
    //     return false; 
    // if(curelement.volume > beforeelement.volume)
    //     return false;
    // if(curelement.close < AverageClose(slices))
    //     return false;

    // // 吏?띿쟻 二쇨??섎씫以묒뿏 猷⑦떞 諛붽퓭以??
    // if(curelement.close > curelement.bb.middle)
    //     return false;

    // return true;
}

const rsi3day = 26;
// 60??理쒕? 嫄곕옒??李띿? ??60??理쒖냼 嫄곕옒???섏삤硫? 60??理쒕? 嫄곕옒?됱씪??留덊궧.
const IsRSIlong3=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement.rsi)
        return false;
    
    if(chartdatasidx<=rsi2day)
        return false;

    const rsidaystart = chartdatasidx-rsi2day+(beforetest?0:1);
    const rsidayend = chartdatasidx+(beforetest?0:1);
    const compareelement = chartdatas[rsidayend-1];

    // case1.
    // const slices = chartdatas.slice(rsidaystart, rsidayend);
    // const arrs = GetVolumes (slices).sort((a, b) => b-a);    
    // const highest = Highest2(arrs);
    // if(compareelement.close > compareelement.bb.bottom)
    //     return false;

    const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    if(!latestTradechart)
        return false;
    const latestTradeLongstyle = latestTradechart.macdlongshort;
    if(latestTradeLongstyle === '')
        return false;
    if(latestTradeLongstyle.includes('LONG'))
        return false;


    const latestVolumeChart = GetLatestVolumechart(chartdatas, chartdatasidx);
    if(!latestVolumeChart)
        return false;
    const latestVolumeLongstyle = latestVolumeChart.macdlongshort;
    if(latestVolumeLongstyle === '')
        return false;
    if(latestVolumeLongstyle.includes('HIGH'))
        return false;

    const latestTradechartidx = GetLatestmacdLongShortchartdatasidx(chartdatas, chartdatasidx);
    const latestVolumeChartidx = GetLatestVolumechartdatasidx(chartdatas, chartdatasidx);
    if(latestTradechartidx > latestVolumeChartidx)
        return false;

    // if(GetBBWitdh(compareelement) > GetBBWitdh(latestTradechart))
    //     return false;
    if(!IsRSICanLong(chartdatas, chartdatasidx))
        return false;
    return compareelement.rsi.RSI < rsilow2;
}

const IsRSIlong4=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    if(!curelement.rsi)
        return false;

    if(chartdatasidx<=rsi2day)
        return false;

    const slices = chartdatas.slice(chartdatasidx-rsi2day, chartdatasidx);
    const arrs = GetVolumes (slices).sort((a, b) => b-a);
    const highest = Highest2(arrs);
    if(beforeelement.volume < highest)
        return false; 
    if(curelement.volume > beforeelement.volume)
        return false;
    // if (beforeelement.rsi.RSI > 50)
    //     return true;
    // if(curelement.macd.macd < curelement.macd.signal)
    //     return false;
    // if(curelement.close < AverageClose(slices))
    //     return false;

    // // 吏?띿쟻 二쇨??섎씫以묒뿏 猷⑦떞 諛붽퓭以??
    // if(curelement.close > curelement.bb.middle)
    //     return false;

    return true;
}

const IsRSIshort3=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement.rsi)
        return false;

    if(chartdatasidx<=rsi2day)
        return false;

    const rsidaystart = chartdatasidx-rsi2day+(beforetest?0:1);
    const rsidayend = chartdatasidx+(beforetest?0:1);
    const compareelement = chartdatas[rsidayend-1];

    // case1.
    // const slices = chartdatas.slice(rsidaystart, rsidayend);
    // const arrs = GetVolumes (slices).sort((a, b) => b-a);
    // const highest = Highest2(arrs);
    if(compareelement.close < compareelement.bb.top)
        return false;
    
    const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    if(!latestTradechart)
        return false;

    const latestTradeLongstyle = latestTradechart.macdlongshort;
    if(latestTradeLongstyle === '')
        return false;

    if(latestTradeLongstyle.includes('SHORT'))
        return false;
    
    // if(GetBBWitdh(compareelement) > GetBBWitdh(latestTradechart))
    //     return false;
    
    
    return compareelement.rsi.RSI > rsihigh2;
}

const IsRSICanLong=(chartdatas, chartdatasidx)=>{
    return true;
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];  

    if(!curelement || !curelement.rsi)
        return false;

    if(!beforeelement || !beforeelement.rsi)
        return false;

    if(!beforeelement.bb)
        return false;

    const ocmiddle = (beforeelement.open + beforeelement.close)*0.5;
    const hlmiddle = (beforeelement.high + beforeelement.low)*0.5;
    
    if(ocmiddle < beforeelement.bb.bottom)
        return true;

    if(hlmiddle < beforeelement.bb.bottom)
        return true;

    return false;
}

const CheckMacdGAP=(macd, signal, divergence)=>
{
    const macd1 = Math.abs(macd);
    const signal1 = Math.abs(signal);

    return false;

    if(Math.abs(divergence) < 10)
    {
        return true;
    }
        
    // if(macdsignalgap < 0.9)
    //     return false;
    return false;
}

// const Ismacdshort=(chartdatas, chartdatasidx)=>{
//     const curdayElement = chartdatas[chartdatasidx];       // short day
//     const yesterdayElement = chartdatas[chartdatasidx-1]; // yesterday
//     const longdayElement = chartdatas[chartdatasidx-2]; // long day
//     const longdayYesterDayElement = chartdatas[chartdatasidx-3]; // long day yesterday    

//     // if before yesterday macd zero over long, but yester and today volume is more low than yesterday at closetime 3:20 ~ 3:30   
//     // const curDate = chartdatas[chartdatasidx].date;
//     // const hour = curDate.getHours() * 60    
//     // const minute = curDate.getMinutes();
//     // const almostCloseTime = 15 * 60 + 10; // 15:10

//     if(!curdayElement || !yesterdayElement || !longdayElement || !longdayYesterDayElement)
//         return false;

//     // return ((curdayElement.macd.macd < curdayElement.macd.signal)
//     // && (yesterdayElement.macd.macd > yesterdayElement.macd.signal))

//     // if( 
//     //     (hour + minute) > almostCloseTime &&
//     //     longdayElement.macd.macd > 0 && longdayYesterDayElement.macd.macd > 0 &&
//     //     longdayElement.macd.macd > longdayElement.macd.signal &&
//     //     longdayYesterDayElement.macd.macd < longdayYesterDayElement.macd.signal
//     //     && longdayElement.volume > longdayYesterDayElement.volume 
//     //     && yesterdayElement.volume < longdayElement.volume
//     //     && curdayElement.volume < longdayElement.volume 
//     // )
//     // {
//     //     return true;
//     // }


    
//     if(((curdayElement.fastSTO0.K < yesterdayElement.fastSTO0.K-30))// || curdayElement.fastSTO0.K < 20)
//      &&((curdayElement.macd.macd < curdayElement.macd.signal) && (yesterdayElement.macd.macd > yesterdayElement.macd.signal)) 
//     )
//     {
//         return true
//     }


//     return ((yesterdayElement.macd.macd < yesterdayElement.macd.signal)
//          && (longdayElement.macd.macd > longdayElement.macd.signal))
// }

const IsFakeLongRefundsShort=(chartdatas, chartdatasidx)=>{        
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    if(!beforeelement || !curelement)
        return false;

    // ?쇰큺湲곗? 理쒓렐 long???꾨땶??divergence媛 ?댁젣蹂대떎 ?묒쑝硫?留ㅻ룄
    //const isFakeShort = IsLatestTradeShort(chartdatas, chartdatasidx);
    const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    if(!latestTradechart)
        return false;

    const latestTradeLongstyle = latestTradechart.macdlongshort;
    if(latestTradeLongstyle === '')
        return false;

    let isFakeLong = latestTradeLongstyle.includes("MACDLONG_DEFAULT") && latestTradechart.macd.macd < latestTradechart.macd.signal;
    //let isFakeLong = latestTradeLongstyle.includes("FAKE");

    return ((
        isFakeLong
        // (isFakeShort || isLong)
        //&& 
        // isFakeShort &&
        && (curelement.close < beforeelement.close)
        // && (curelement.sma5 < beforeelement.sma5)        
        && (curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
        && (curelement.macd.divergence < beforeelement.macd.divergence)
        // && (curelement.bb.bottom < beforeelement.bb.bottom)
        //&& ((GetBBWitdh(curelement) < GetBBWitdh(beforeelement)))
        //&& ((curelement.bb.bottom < beforeelement.bb.bottom) || (GetBBWitdh(curelement) < GetBBWitdh(beforeelement)))
    ))
}

const IsFakeShortTodayRefundsLong=(chartdatas, chartdatasidx, minutelongshort)=>{        
    const curelement = chartdatas[chartdatasidx];
    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();
    const almostCloseTime = 15 * 60 + 10; // 15:10

    let isFakeLong = false;
    if((hour + minute) > almostCloseTime)
    {
        if(minutelongshort.includes("MACDSHORT_DEFAULT"))
        {
            isFakeLong = curelement.macd.macd > curelement.macd.signal;    
        }            
    }   
    return ((
        isFakeLong        
    ))
}

const IsFakeLongTodayRefundsShort=(chartdatas, chartdatasidx, minutelongshort)=>{        
    const curelement = chartdatas[chartdatasidx];
    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();
    const almostCloseTime = 15 * 60 + 10; // 15:10

    let isFakeLong = false;
    if((hour + minute) > almostCloseTime)
    {
        if(minutelongshort.includes("MACDLONG_DEFAULT"))
        {
            isFakeLong = curelement.macd.macd < curelement.macd.signal;    
        }            
    }   
    return ((
        isFakeLong        
    ))
}

const IsMacdDivergenceLong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const before1element = chartdatas[chartdatasidx-2];

    if(!beforeelement || !before1element || !curelement)
        return false;

    return ((beforeelement.macd.divergence > 0 && before1element.macd.divergence > 0 && curelement.macd.divergence > 0)
        && (beforeelement.macd.divergence < before1element.macd.divergence)
        && (curelement.macd.divergence > beforeelement.macd.divergence))
}

// ?꾨궇 macd long?대㈃??寃곌낵??short?멸꼍??援щℓ
const IsExperimentLong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const before1element = chartdatas[chartdatasidx-2];
    

    if(!beforeelement || !curelement)
        return false;

    return (IsShortStyle(beforeelement.macdlongshort)    
        && (beforeelement.macd.macd > beforeelement.macd.signal)
        && (before1element.macd.macd < before1element.macd.signal)        
        && (curelement.macd.macd > curelement.macd.signal)
        && (curelement.macd.macd > beforeelement.macd.macd)
    )
    
    
    // if(IsShortStyle((GetLatestTradestyle(chartdatas, chartdatasidx))))
    // {
    //     const curDate = chartdatas[chartdatasidx].date;
    //     const hour = curDate.getHours() * 60    
    //     const minute = curDate.getMinutes();
    //     const almostCloseTime = 15 * 60 + 10; // 15:10

    //     if((hour + minute) > almostCloseTime)
    //     {
    //         if(curelement.macd.divergence > 0 
    //         &&(curelement.macd.divergence > beforeelement.macd.divergence)
    //         &&(GetBBTopBottomBothWide(chartdatas, chartdatasidx))
    //         )
    //         return true;        
    //     }        
    // }
}

const IsExperimentLong2=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const before1element = chartdatas[chartdatasidx-2];

    if(!beforeelement || !before1element || !curelement)
        return false;

    return (curelement.macd.divergence < beforeelement.macd.divergence 
    &&(curelement[stoIdxStr1].K > (beforeelement[stoIdxStr1].K))
    )
    
    // if(IsShortStyle((GetLatestTradestyle(chartdatas, chartdatasidx))))
    // {
    //     const curDate = chartdatas[chartdatasidx].date;
    //     const hour = curDate.getHours() * 60    
    //     const minute = curDate.getMinutes();
    //     const almostCloseTime = 15 * 60 + 10; // 15:10

    //     if((hour + minute) > almostCloseTime)
    //     {
    //         if(curelement.macd.divergence > 0 
    //         &&(curelement.macd.divergence > beforeelement.macd.divergence)
    //         &&(GetBBTopBottomBothWide(chartdatas, chartdatasidx))
    //         )
    //         return true;        
    //     }        
    // }
}

const IsExperimentShort=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const before1element = chartdatas[chartdatasidx-2];

    if(!beforeelement || !before1element || !curelement)
        return false;

    const curDate = chartdatas[chartdatasidx].date;
    // const hour = curDate.getHours() * 60    
    // const minute = curDate.getMinutes();
    // const almostCloseTime = 14 * 60 + 0; // 15:10

    //if((hour + minute) > almostCloseTime)
    {
        // macd ?곸듅鍮꾧? 以꾩뿀怨? ?뱀씪 理쒓퀬媛??鍮꾪빐 ?꾩옱媛媛 10?꾨줈 ?댁긽 以꾩뿀?ㅻ㈃ ?먮ℓ
        if((curelement.macd.divergence - beforeelement.macd.divergence) < (beforeelement.macd.divergence - before1element.macd.divergence)     
        && (curelement.close < (curelement.high * 0.85))
        && (curelement.close < (curelement.open * 0.90))
        && (curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
        )
        return true;
    }

    return false;
}

const IsExperimentShort2=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    if(!beforeelement || !curelement)
        return false;
    // ADD OPTION. LONG_AFTERREFUNDS?쇰줈 ?섎せ ??寃껊룄 ?섍툒?댁???
    if(beforeelement.macdlongshort === "LONG_AFTERREFUNDS"){
        if((curelement.bb.bottom < beforeelement.bb.bottom)
        &&(Math.abs(curelement.bb.bottom - beforeelement.bb.bottom) > Math.abs(curelement.bb.top - beforeelement.bb.top))
        && (curelement.macd.divergence < beforeelement.macd.divergence)
        ){
            return true;
        }
    }
}

// MACD ?섎씫 + ?뱀씪 high??macd top 蹂대떎 ?믨퀬 ?뱀씪 close??top 誘몃쭔?대㈃ 留ㅻ룄
const IsExperimentShort3=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];

    if(!beforeelement || !curelement)
        return false;


    return (curelement.macd.macd < beforeelement.macd.macd
        && ((curelement.high > curelement.bb.top) && (curelement.close < curelement.bb.top))
        && (curelement[stoIdxStr1].K < (beforeelement[stoIdxStr1].K))
    );    
}

// 2?쇱뿰??sto媛 異붾씫?섍퀬 珥?60?댁긽 ?섎씫
const IsExperimentShort4=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    const before1element = chartdatas[chartdatasidx-1];
    const before2element = chartdatas[chartdatasidx-2];

    if(!before1element || !before2element || !curelement)
        return false;


    return ((curelement[stoIdxStr1].K < before1element[stoIdxStr1].K)
        && (before1element[stoIdxStr1].K < before2element[stoIdxStr1].K)
        && (curelement[stoIdxStr1].K < (before2element[stoIdxStr1].K-60)
        && (before1element.macd.divergence < before2element.macd.divergence)
    )
    );    
}

// 異붿꽭?섎씫??
const IsBigDropShort=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    const before1element = chartdatas[chartdatasidx-1];
    const before2element = chartdatas[chartdatasidx-2];

    if(!before1element || !before2element || !curelement)
        return false;

    return ((curelement.close < before1element.low)
        && (curelement.macd.macd < before1element.macd.macd)    
        && (curelement.macd.divergence < before1element.macd.divergence)
        && (curelement[stoIdxStr1].K < before1element[stoIdxStr1].K)
    );    
}

const IsMacdDivergenceShort=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    const before1element = chartdatas[chartdatasidx-2];

    if(!beforeelement || !before1element || !curelement)
        return false;

    return ((beforeelement.macd.divergence > 0 && before1element.macd.divergence > 0 && curelement.macd.divergence > 0)
        && (beforeelement.macd.divergence > before1element.macd.divergence)
        && (curelement.macd.divergence < beforeelement.macd.divergence))
}

const StoOptions = [
    {StoVal:5, StoDay:3, FastToSlowtoMA:3},    
    {StoVal:10, StoDay:5, FastToSlowtoMA:5},
    {StoVal:20, StoDay:10, FastToSlowtoMA:10},
]

const CacuSTOinfo=(element, index, chartdatas, stoindex)=>{    
    let highest = 0;
    let lowest = 0;
    let K = 0; 
    let D = 0; 
    
    const stoIdxStr = `fastSTO${stoindex}`;
    const stoOption = StoOptions[stoindex];        
    // const e = 2/(stoOption.StoVal+1)

    if(index > stoOption.StoVal)
    {        
        let slicedata = chartdatas.slice(index-stoOption.StoVal+1, index+1)

        if(slicedata[stoOption.StoVal-stoOption.StoDay])
        {        
            highest = Highest(slicedata);
            lowest = Lowest(slicedata);
            K = (element.close - lowest)/(highest - lowest)*100;
            bef1 = chartdatas[index-1][stoIdxStr];
            bef2 = chartdatas[index-2][stoIdxStr];
            
            D = (bef1 && bef2) ? MoveAverage([
                K, 
                bef1.K,
                bef2.K,
            ]) : 0;
        }
    }

    return (
    {
        highest : highest,
        lowest : lowest,
        K: K, 
        D: D, 
    });
}

const CacuStoOneday=(chartdatas, chartindex, stoindex)=>{
    let curelement = chartdatas[chartindex];
    const cacusto = CacuSTOinfo(curelement, chartindex, chartdatas, stoindex);
    const stoIdxStrF = `fastSTO${stoindex}`;
    
    curelement[stoIdxStrF] = {};
    curelement[stoIdxStrF].highest = cacusto.highest;
    curelement[stoIdxStrF].lowest = cacusto.lowest;
    curelement[stoIdxStrF].K = cacusto.K;
    curelement[stoIdxStrF].D = cacusto.D;
}

const CacuStos=(chartdatas, stoindex)=>{
    const stoOption = StoOptions[stoindex];
    const stoIdxStrF = `fastSTO${stoindex}`;
    const stoIdxStrS = `slowSTO${stoindex}`;
    chartdatas.forEach((element, index) => {
        CacuStoOneday(chartdatas, index, stoindex);
    });

    const klists = chartdatas.reduce(function(accum,curr){
        accum.push(curr[stoIdxStrF].K); return accum;
    },[])

    
    const dlists = chartdatas.reduce(function(accum,curr){
        accum.push(curr[stoIdxStrF].D); return accum;
    },[])

    chartdatas.forEach((element, index) => 
    {
        element[stoIdxStrS] = _.cloneDeep(element[stoIdxStrF]);

        if(index-stoOption.FastToSlowtoMA > 0 && element[stoIdxStrS])
        {
            element[stoIdxStrS].K = MoveAverage( klists.slice(index-stoOption.FastToSlowtoMA,index) );
            element[stoIdxStrS].D = MoveAverage( dlists.slice(index-stoOption.FastToSlowtoMA,index) );
        }
    });
}

// CACULATE MACD ////////////////////////////////////////////////////////////////
const ema12multi = 2 / (12 + 1);
const ema26multi = 2 / (26 + 1);
const signalmulti = 2 / (9 + 1); // 0.2

const Cacumacdinfo=(chartdatas,index)=>{
    const AverageMACD = (arrs) => {
        let sum = 0;
        arrs.forEach((arr)=>
        {
            if(arr.macd && arr.macd.macd)
                sum += arr.macd.macd;
        });
        return sum / arrs.length;
    };

    let curelement = chartdatas[index];
    let beforeElement = chartdatas[index-1];

    const ema12 = index <= 12 ? AverageClose(chartdatas.slice(Math.max(0,index-(12)), index)) : ema12multi * (curelement.close-beforeElement.macd.ema12) +  beforeElement.macd.ema12;
    const ema26 = index <= 26 ? AverageClose(chartdatas.slice(Math.max(0,index-(26)), index)) : ema26multi * (curelement.close-beforeElement.macd.ema26) + beforeElement.macd.ema26; 
    const macd  = ema12 - ema26;
    const signal= index <= 26 ? AverageMACD(chartdatas.slice(Math.max(0,index-(9)), index)) : signalmulti * (macd-beforeElement.macd.signal) + beforeElement.macd.signal;
    
    return(
    {
        ema12 : ema12,
        ema26 : ema26,
        macd : macd,            
        signal : signal,
        divergence : macd - signal
    });
}

const Cacumacds=(chartdatas)=>{
    chartdatas.forEach((element, index) => {
        if(index-1 > 0)
        {
            CacumacdOneday(chartdatas, index);
        }
    });
}

const CacumacdOneday=(chartdatas, index)=>{
    
    let curelement = chartdatas[index];    
    const cacumacd = Cacumacdinfo(chartdatas, index);
    curelement.macd = {};
    curelement.macd.ema12 = cacumacd.ema12;
    curelement.macd.ema26 = cacumacd.ema26;
    curelement.macd.macd = cacumacd.macd;
    curelement.macd.signal = cacumacd.signal;
    curelement.macd.divergence = cacumacd.divergence;
}
////////////////////////////////////////////////////// CACULATE MACD

// CACULATE VOLUME /////////////////////////////////////////////////////

const CacuVolumes=(chartdatas)=>{
    const volumemarkingday = 60;
    chartdatas.forEach((element, index) => {
        if(index<=volumemarkingday)
        {
            element.volume60HighLow = ''
        }
        else
        {
            
            let slicedatas = chartdatas.slice(index-volumemarkingday, index);            
            const arrs = GetVolumes(slicedatas);    

            //const arrs = GetVolumes (slices).sort((a, b) => b-a);
            const highest = Highest2(arrs);
            const lowest = Lowest2(arrs);

            if(element.volume >= highest)
                element.volume60HighLow = 'HIGH';
            else if(element.volume <= lowest)
                element.volume60HighLow = 'LOW';
            else 
                element.volume60HighLow = '';
        }
    });
}
/////////////////////////////////////////////////////// CACULATE VOLUME

// CACULATE RSI /////////////////////////////////////////////////////
const AverageRSI = (arrs) => {
    let sum = 0;
    arrs.forEach((arr)=>
    {
        if(arr.rsi && arr.rsi.RSI)
            sum += arr.rsi.RSI;
    });
    return sum / arrs.length;
};

const AverageGain = (arrs) => {
    let sum = 0;
    arrs.forEach((arr)=>
    {
        if(arr.rsi && arr.rsi.gain)
            sum += arr.rsi.gain;
    });
    return sum / arrs.length;
};

const AverageLoss = (arrs) => {
    let sum = 0;
    arrs.forEach((arr)=>
    {
        if(arr.rsi && arr.rsi.loss)
            sum += arr.rsi.loss;
    });
    return sum / arrs.length;
};

const CacuRSIinfo=(chartdatas,index,rsiidx)=>{    
    let curelement = chartdatas[index];
    let beforeElement = chartdatas[index-1];

    let beforeclose = beforeElement ? beforeElement.close : 0;

    const gain=curelement.close>beforeclose ? curelement.close-beforeclose : 0;
    const loss=curelement.close<beforeclose ? beforeclose-curelement.close : 0;

    const signalperiod = 9;

    if(!curelement.rsi)
    {
        curelement.rsi = {}
        
    }

    // 2025/04/09 avgGain??援ы븯湲??꾩뿉 諛⑷툑 援ы븳 gain???곸슜?댁???
    if(curelement.rsi)
    {
        curelement.rsi.gain = gain;
        curelement.rsi.loss = loss;
    }

    let avgGain;
    let avgLoss;
    if(defulatConfig.useemarsi)
    {
    // KIWOOM RSI
        avgGain = index < 14 ? AverageGain(chartdatas.slice(Math.max(0,index-(14)), index)) : ((beforeElement.rsi.avgGain*(14-1))+gain)/14;
        avgLoss = index < 14 ? AverageLoss(chartdatas.slice(Math.max(0,index-(14)), index)) : ((beforeElement.rsi.avgLoss*(14-1))+loss)/14;
    }   
    else
    {
     // V2
    // SAMSUNG, HANTU RSI
        avgGain = AverageGain(chartdatas.slice(Math.max(0,index-(14)+1), index+1));
        avgLoss = AverageLoss(chartdatas.slice(Math.max(0,index-(14)+1), index+1));
    }
    

    const RS =  index < 14 ? 1 : avgGain / avgLoss;
    const RSI = 100-100/(1+RS);
    const rsisignalmulti = 2 / (signalperiod + 1); // 0.2

    // 2025/04/09 rsi.RSI瑜?援ы븯湲??꾩뿉 諛⑷툑 援ы븳 RSI ?곸슜?댁???
    if(curelement.rsi)
        curelement.rsi.RSI = RSI;


    // AverageSignal
    // const signal = AverageRSI(chartdatas.slice(Math.max(0,index-(signalperiod)+1), index+1));

    // HANTU RSI SIGNAL
    const signal = index < signalperiod ? AverageRSI(chartdatas.slice(Math.max(0,index-(signalperiod)+1), index+1)) : rsisignalmulti * (RSI-beforeElement.rsi.signal) + beforeElement.rsi.signal;
    
    return(
    {
        gain : gain,
        loss : loss,
        avgGain : avgGain,            
        avgLoss : avgLoss,
        RS : RS,
        RSI : RSI,
        signal : signal,
    });
}

const CacuRSI=(chartdatas)=>{
    chartdatas.forEach((element, index) => {
        if(index-1 > 0)
        {
            CacuRSIOneday(chartdatas, index);
        }
    });
}

const CacuRSIOneday=(chartdatas, index)=>{    
    let curelement = chartdatas[index];    
    const rsi = CacuRSIinfo(chartdatas, index);
    if(!curelement.rsi)
        curelement.rsi = {};
    curelement.rsi.gain = rsi.gain;
    curelement.rsi.loss = rsi.loss;
    curelement.rsi.avgGain = rsi.avgGain;
    curelement.rsi.avgLoss = rsi.avgLoss;
    curelement.rsi.RS = rsi.RS;
    curelement.rsi.RSI = rsi.RSI;
    curelement.rsi.signal = rsi.signal;
}
/////////////// CACULATE RSI

function CacuOnedays(chartdatasTemp, chartdatasidx){
    const cacuProfile = globalval.cacuOnedayProfile;
    let cacuProfileStart = cacuProfile ? Date.now() : 0;
    CacumacdOneday(chartdatasTemp, chartdatasidx);
    if(cacuProfile)
        cacuProfile.macd += Date.now() - cacuProfileStart;

    cacuProfileStart = cacuProfile ? Date.now() : 0;
    CacuSMAOneday(chartdatasTemp, chartdatasidx);
    if(cacuProfile)
        cacuProfile.sma += Date.now() - cacuProfileStart;

    cacuProfileStart = cacuProfile ? Date.now() : 0;
    CacuRSIOneday(chartdatasTemp, chartdatasidx);
    if(cacuProfile)
        cacuProfile.rsi += Date.now() - cacuProfileStart;
    
    if (defulatConfig.cacusto)
    {
        cacuProfileStart = cacuProfile ? Date.now() : 0;
        for (let stoindex = 0; stoindex < 3; ++stoindex)
        {                                                   
            CacuStoOneday(chartdatasTemp, chartdatasidx, stoindex);                                
        }
        if(cacuProfile)
            cacuProfile.sto += Date.now() - cacuProfileStart;
    }                                           
}

function Cacus(chartdatasTemp){
    CacuSMA(chartdatasTemp);  
    if (defulatConfig.cacusto)
    {
        StoOptions.forEach((stoOption,stoiptionIdx)=>{
            CacuStos(chartdatasTemp, stoiptionIdx);
        })
    }              
    
    Cacumacds(chartdatasTemp);

    RSIOptions.forEach((rsioptionIdx)=>{
        CacuRSI(chartdatasTemp, rsioptionIdx);
    })
    CacuRSI(chartdatasTemp);
    CacuVolumes(chartdatasTemp);
}

const smaday = [5,10,20,60,120];
const MoveAverageCloseRange = (chartdatas, startIndex, endIndex)=>{
    let sum = 0;
    for(let i = startIndex; i <= endIndex; ++i)
    {
        sum += Number(chartdatas[i].close);
    }
    return sum / (endIndex - startIndex + 1);
}

const STDEVPACloseRange = (chartdatas, startIndex, endIndex)=>{
    let sum = 0;
    const length = endIndex - startIndex + 1;
    for(let i = startIndex; i <= endIndex; ++i)
    {
        sum += Number(chartdatas[i].close);
    }

    const mean = sum / length;
    let varianceSum = 0;
    for(let i = startIndex; i <= endIndex; ++i)
    {
        varianceSum += Math.pow((parseFloat(chartdatas[i].close) - mean), 2);
    }

    return Math.sqrt(varianceSum);
}

const MoveAverageCloseWithBase = (base, close, days)=>{
    return (base[`sum${days}`] + Number(close)) / days;
}

const STDEVPACloseWithBase = (base, close)=>{
    const length = 20;
    const sum = base.sum20 + Number(close);
    const squareSum = base.squareSum20 + Math.pow(parseFloat(close), 2);
    return Math.sqrt(squareSum - ((sum * sum) / length));
}

const CacuBBinfo=(chartdatas, index)=>{
    
    const closesof20days = GetCloses(chartdatas.slice(index-smaday[1]+1, index+1));
    const stdevpa = STDEVPA(closesof20days);

    return {
        stdevpa : stdevpa
    }
}

const CacuSMAinfo=(index, chartdatas)=>
{
    const element = chartdatas[index];
    const base = element ? element._simSmaBase : null;
    if(base)
    {
        return {
            sma5 : base.valid5 ? MoveAverageCloseWithBase(base, element.close, 5) : 0,
            sma10 : base.valid10 ? MoveAverageCloseWithBase(base, element.close, 10) : 0,
            sma20 : base.valid20 ? MoveAverageCloseWithBase(base, element.close, 20) : 0,
            sma60 : base.valid60 ? MoveAverageCloseWithBase(base, element.close, 60) : 0,
            sma120 : base.valid120 ? MoveAverageCloseWithBase(base, element.close, 120) : 0,
            stdevpa : base.valid20 ? STDEVPACloseWithBase(base, element.close) : 0,
        }
    }

    return {
        sma5 : index-smaday[0] >= 0 ? MoveAverageCloseRange(chartdatas, index-smaday[0]+1, index) : 0,
        sma10 : index-smaday[1] >= 0 ? MoveAverageCloseRange(chartdatas, index-smaday[1]+1, index) : 0,
        sma20 : index-smaday[2] >= 0 ? MoveAverageCloseRange(chartdatas, index-smaday[2]+1, index) : 0,
        sma60 : index-smaday[3] >= 0 ? MoveAverageCloseRange(chartdatas, index-smaday[3]+1, index) : 0,
        sma120 : index-smaday[4] >= 0 ? MoveAverageCloseRange(chartdatas, index-smaday[4]+1, index) : 0,
        stdevpa : index-smaday[2] >= 0 ? STDEVPACloseRange(chartdatas, index-smaday[2]+1, index):0,
    }
}

const CacuSMAOneday=(chartdatas, index)=>{
    const smainfo = CacuSMAinfo(index, chartdatas);
    let element = chartdatas[index];
    element.sma5 = smainfo.sma5;
    element.sma10 = smainfo.sma10;
    element.sma20 = smainfo.sma20;
    element.sma60 = smainfo.sma60;
    element.sma120 = smainfo.sma120;    
    element.stdevpa = smainfo.stdevpa;
    element.bb = {
        stdevpa : smainfo.stdevpa,
        middle : element.sma20,
        top : element.sma20 + smainfo.stdevpa * 0.5,
        bottom : element.sma20 - smainfo.stdevpa * 0.5,
    }    
}

const CacuSMA=(chartdatas)=>
{
    chartdatas.forEach((element, index)=>{
        CacuSMAOneday(chartdatas, index);
    })
}   

// const setmacdbuysell=(chartdatas, averagebuyprice)=>{
//     chartdatas.forEach((element, curChartIdx)=>{
//         let hasstockcount = IsLongStyle(GetLatestTradestyle(chartdatas, curChartIdx)) ? 1 : 0;
//         setmacdbuysellRealTrade(chartdatas, curChartIdx, 'NONE', averagebuyprice, hasstockcount);
//     })    
// }

const SellOnlyDownward=(chartdatas, chartdatasidx)=>{
    const todayelement = chartdatas[chartdatasidx];

    if(!todayelement)
        return true;

    if(!defulatConfig.sellonlydownward)
        return true;

    return todayelement.close < todayelement.open;
}

const BuyOnlyUpward=(chartdatas, chartdatasidx)=>{
    const todayelement = chartdatas[chartdatasidx];

    if(!todayelement)
        return true;

    if(!defulatConfig.buyonlyupward)
        return true;

    return todayelement.close > todayelement.open;
}

let kospitradestock = null;
let kosdaqtradestock = null;
const SetIndexsTradestocks=(tradestockdic)=>{
    const ticker0 = GetIndexTicker(0);
    const ticker1 = GetIndexTicker(1);
    kospitradestock = tradestockdic[ticker0];
    kosdaqtradestock = tradestockdic[ticker1];
}

const setmacdbuysellRealTrade=(tradestockdic, account, tradestock, curChartIdx, minutelongshort, averagebuyprice, hasstockcount, hasmoney, db_id)=>{
    let beforemacdalgo = "NONE";
    let chartdatasTemp = tradestock.chartdatas;

    if(defulatConfig.useupratelong)
        SetIndexsTradestocks(tradestockdic);

    if(cachedAlmostCloseDbId !== db_id)
    {
        cachedAlmostCloseDbId = db_id;
        almostCloseTime = IsNaq(db_id) ? AM_TIME.almostCloseTime : KR_TIME.almostCloseTime;
    }
    let isbadcounttrylong = IsBadCountTryLong(account, tradestock, chartdatasTemp, curChartIdx);
    let isAlreadydayout = IsAlreadyDayOut(tradestockdic, account, tradestock, chartdatasTemp, curChartIdx);
    
    if(ProcessShort(account, tradestockdic, tradestock, curChartIdx, minutelongshort, averagebuyprice, hasstockcount, (resultlongshort)=>{
        beforemacdalgo = resultlongshort;
    })){}
    else    
    !isAlreadydayout && !isbadcounttrylong && ProcessLong(tradestock, curChartIdx, minutelongshort, averagebuyprice, hasstockcount, (resultlongshort)=>{
        beforemacdalgo = resultlongshort;
    })

    // ba嫄곕굹 fail?대㈃ 臾댁“嫄?吏?뺢? 嫄곕옒
    if(defulatConfig.usebreakouttrade || defulatConfig.useforcekorbuy)
    {
        if(beforemacdalgo != 'NONE' && beforemacdalgo != '')
            beforemacdalgo = `FORCE_${beforemacdalgo}`;
    }

    chartdatasTemp[curChartIdx].stolongshort = beforemacdalgo; 
    if(defulatConfig.userefundafterlock && 
        (chartdatasTemp[curChartIdx].macdlongshort.includes("RSIREFUND") || 
        (chartdatasTemp[curChartIdx].macdlongshort.includes("Recycling") && !defulatConfig.usebeforeliveperiod)
        )) // ?λ쭏媛?20遺꾩쟾 ?섑뙏?댄뻽?섍굔 臾댁떆?섎뒗 濡쒖쭅. ?닿쾬???쒕쾲 ?놁븷蹂몃떎.
    {
        beforemacdalgo = "NONE";                
    }
    // ?뱀씪 援щℓ?쒓쾬 ?붽린?꾩뿉 ?ㅼ떆 ?ъ??딄쾶 泥섎━
    if(hasstockcount > 0 && IsLongStyle(beforemacdalgo) && IsLongStyle(chartdatasTemp[curChartIdx].macdlongshort))
        beforemacdalgo = "NONE";
    // macd > signal??寃쎌슦留?異붽? 援щℓ
    let buyandbuy = (defulatConfig.buyandbuy && chartdatasTemp[curChartIdx].macd.macd > chartdatasTemp[curChartIdx].macd.signal) || hasstockcount === 0;
    
    if(IsShortStyle(beforemacdalgo) && hasstockcount > 0){        
        chartdatasTemp[curChartIdx].macdlongshort = beforemacdalgo;        
    }
    // else if(IsLongStyle(beforemacdalgo) && hasstockcount === 0 ){
    else if(IsLongStyle(beforemacdalgo) && buyandbuy ){
        const enough = (hasmoney > 0 && EnoughMoneyExport(hasmoney, chartdatasTemp[curChartIdx].close))
        if(enough)
        {
            chartdatasTemp[curChartIdx].macdlongshort = beforemacdalgo;
        }
        else {   // ?덉씠 異⑸텇?섏? ?딆븘????湲고쉶瑜??볦튇 醫낅ぉ ?대씪怨?湲곕줉?대몦?? ?닿굔 媛숈????ㅼ떆 ?ъ? ?딅뒗??

        }
    }
        
    return beforemacdalgo;
}



const IsReadyTrade=(chartdatasTemp, curChartIdx)=>{
    const curelement = chartdatasTemp[curChartIdx];
    if(!curelement.bb)
        return false;
    if(curelement.bb.top === 0 || curelement.bb.middle === 0 || curelement.bottom === 0)
        return false;
    return true;
}

// 援щℓ : ?ㅻ뒛 3??0遺꾧린以 ?댁젣&?ㅻ뒛rsi < 30 && ?ㅻ뒛 醫낃?>?쒓?. ?ㅻ뒛rsi > ?댁젣 rsi  
// ?먮ℓ : ?ㅻ뒛 3??0遺꾧린以 ?댁젣rsi > 70 && ?ㅻ뒛rsi < ?댁젣rsi

const ProcessLong=(tradestock, curChartIdx, minutelongshort, averagebuyprice, hasstockcount, Callback)=>{    
    let chartdatasTemp = tradestock.chartdatas;
    if(!IsAlmostCloseTime(chartdatasTemp, curChartIdx))
        return false;

    if(IsVirtualExcludeTest(chartdatasTemp, curChartIdx))
        return false;

    if(!IsPriceTrend(chartdatasTemp, curChartIdx))
        return false;

    if(!IsPersonaltradeCanBuyTime(chartdatasTemp, curChartIdx))
        return false;

    if(defulatConfig.usefilternotices && tradestock.notices != '')
        return false;

    if(defulatConfig.validrightsdays && tradestock.validrights == false)
        return false;

    if(defulatConfig.usepersonstocktrade)
    {
        // if(!defulatConfig.usepersonstocktrade || rest.canbuy)
        const personstockinfo = GetGoogStock(tradestock.ticker);
        if(personstockinfo && personstockinfo.canbuy)
        {
            if(IsTouchedBuyPrice(tradestock, curChartIdx, hasstockcount, ))
            {
                Callback("BUY1_LONG");
                return true;
            }
        }

        if(globalval.excelvalues && !globalval.excelvalues.USESHBUY)
            return false;
    }

    else if(defulatConfig.usebreakouttrade)
    {
        // ?먯긽?쒖쇅
        if(IsJumSang(tradestock, curChartIdx))
            return false;
        
        // ?쒓?? 鍮꾩듂?댁빞 ?곕떎.
        if(!IsSimilarWithfirstgetprice(chartdatasTemp, curChartIdx))
            return false;
        const macdparts = IsEnoughBreakoutUpLimit(tradestock, curChartIdx);
        if(!macdparts)
            return false;
        let macdlongshorttemp = `BREAKOUT_${macdparts}_LONG`;
        // macdlongshorttemp = `FORCE_${macdlongshorttemp}`;
        Callback(macdlongshorttemp);
        return true;
        
            
        if(globalval.excelvalues && !globalval.excelvalues.USESHBUY)
            return false;
    }
    

    // if(IsLongStyle(chartdatasTemp[curChartIdx].macdlongshort))
    //     return false;
    // if(NeedPassiveLong(chartdatasTemp, curChartIdx))
    // {
    //     if(IsNewMacdGoldCross(chartdatasTemp, curChartIdx))
    //     {
    //         Callback("MACD_LONG");
    //         return true;
    //     }
    //     return false;
    // }


    ////

    if(IsNewMacdGoldCross(chartdatasTemp, curChartIdx))
    {
        Callback("MACD_LONG");
        return true;
    }
    else if(IsRSIlongCross(tradestock))
    {
        Callback("RSI_LONG");
        return true;
    }
    else if(IsRefundsLong(chartdatasTemp, curChartIdx))
    {
        Callback("RSIREFUND_LONG");
        return true;
    }

    // if (NeedPassiveLong(chartdatasTemp, curChartIdx))
    // {
    //     // if(IsNewMacdGoldCross(chartdatasTemp, curChartIdx))
    //     // {
    //     //     Callback("MACD_LONG");
    //     //     return true;
    //     // }
    // }
    // else if(IsRSIlongCross(chartdatasTemp, curChartIdx))
    // {
    //     Callback("RSI_LONG");
    //     return true;
    // }
    
    return false;
}

let lognoselluplimitcnt = 0;
const ProcessShort=(account, tradestockdic, tradestock, curChartIdx, minutelongshort, averagebuyprice, hasstockcount, Callback)=>{
    let chartdatasTemp = tradestock.chartdatas;
    if(!IsAlmostCloseTime(chartdatasTemp, curChartIdx))
        return false;

    if(!defulatConfig.usebeforeliveperiod)
    {
        if(hasstockcount<=0)
            return false;
    }
    // if(tradeutilsma.IsSMAArrange(chartdatasTemp, curChartIdx, [10,20,60,120]) && tradeutilsma.IsSMAArrange(chartdatasTemp, curChartIdx-1, [10,20,60,120]))
    // {
    //     return false;
    // }

    if(IsShortLowPrice(chartdatasTemp, curChartIdx, GetAveragePrice(account, tradestock.ticker)))
    {
        let macdlongshorttemp = "LOWPRICE_SHORT";
        // if(defulatConfig.usebreakouttrade)
        //     macdlongshorttemp = `FORCE_${macdlongshorttemp}`
        Callback(macdlongshorttemp);
        return true;
    }

    if(defulatConfig.usepersonstocktrade)
    {
        const personstockinfo = globalval.personstocklist[tradestock.ticker] || globalval.successpersonstocklist[tradestock.ticker];
        
        if(personstockinfo)
        {
            if(IsTouchedWantPrice(tradestock, curChartIdx, hasstockcount, personstockinfo.want1))
            {
                Callback("WANT1_SHORT");
                return true;
            }
        } 
        
        if(globalval.excelvalues && !globalval.excelvalues.USESHSELL)
            return false;
    }
    else if(defulatConfig.usebreakouttrade){        
        const actdate = GetLastDateTime(account, tradestock.ticker);
        const passedday = GetPassedDayFromBought(tradestock.chartdatas, tradestock.curchartdataidx, actdate);
        const istoday = IsBuyDayIsToday(account, tradestock.ticker, tradestock.chartdatas, tradestock.curchartdataidx);
        const curelement = chartdatasTemp[curChartIdx];
        const beforeelement = chartdatasTemp[curChartIdx-1];
        // 泥リ?寃⑹씠 ?곸씤寃쎌슦 25?꾨줈?댄븯濡??⑥뼱?몄빞 ?먮ℓ?쒕떎
        if(defulatConfig.usebreakoutsequenceuplimit)
        {
            if(IsRecheadUpLimit(beforeelement.close, tradestock.firstgetprice, defulatConfig.dnlimitper) &&
            (tradestock.blackratefromfirstgetprice > -5))
            {
                if(tradestock.getpricecount<2)
                {
                    ++lognoselluplimitcnt;
                    AddSimulationLog(`UPLIMIT NOSELL >> D${passedday} ${tradestock.name}(${tradestock.ticker}) BC:${beforeelement.close}=>CF:${tradestock.firstgetprice} ${(tradestock.firstgetprice/beforeelement.close).toFixed(3)}% cnt:${lognoselluplimitcnt} ${GetLogDate(curelement)}`);
                }
                return false;      
            }  
        }
        ////////////////////////////////
        // 釉뚯븘 ?덉쟾?먮ℓ
        if(defulatConfig.usebreakoutsafetyshort)
        {
            // > ?쒓???蹂댁쑀 ?④퀎 ?ㅼ젙 ( 援ъ엯媛寃⑸?鍮??꾩옱媛寃⑹쓽 ?곸듅瑜?/ 2 )  
            // > 留ㅼ닚媛??꾩떆 ?④퀎 ?산린 ( 援ъ엯媛寃⑸?鍮??꾩옱媛寃⑹쓽 ?곸듅瑜?/ 2 ).   
            // > ?꾩떆?④퀎媛 湲곗〈 ?④퀎蹂대떎 ?믪쑝硫?蹂댁쑀 ?④퀎 蹂寃?
            // > ?꾩떆?④퀎媛 湲곗〈 ?④퀎蹂대떎 ??쑝硫??먮ℓ.
            // if(passeddaystr)
            let macdshorttemp = `BASAFETY_SHORT D+${passedday-1}`;
            // macdshorttemp = `FORCE_${macdshorttemp}`;
            const cansellday = !istoday || !defulatConfig.usebreakouttodaynosel;
            if(cansellday)
            {
                const averagebuyprice = GetAveragePrice(account, tradestock.ticker);
                const tempbreakoutsafetyshortlv = GetBreakoutsafetyshortlv(averagebuyprice, tradestock.latestclose);
                const changedperstr = GetChangePerLog( GetChangePer(averagebuyprice, tradestock.latestclose) )
                if(tradestock.breakoutsafetyshortlv != tempbreakoutsafetyshortlv)
                {
                    if(tempbreakoutsafetyshortlv > tradestock.breakoutsafetyshortlv)
                    {
                        AddSimulationLog(`BREAKOUT_LV UP TODAY:${istoday} ${tradestock.name}(${tradestock.ticker}) ${tradestock.breakoutsafetyshortlv}=>${tempbreakoutsafetyshortlv} ${changedperstr} ${GetLogDate(curelement)}`);
                        tradestock.breakoutsafetyshortlv = tempbreakoutsafetyshortlv;
                    }
                    else{
                        const lvdropgap = tradestock.breakoutsafetyshortlv - tempbreakoutsafetyshortlv;
                        const skipsell = (defulatConfig.fakedropsellskiplv && lvdropgap >= defulatConfig.fakedropsellskiplv);
                        const skipsellstr = skipsell ? `SKIPSELL_BA_FAKE_DROP gap:${lvdropgap}` : '';
                            
                        AddSimulationLog(`${skipsellstr} BREAKOUT_LV DN TODAY:${istoday} ${tradestock.name}(${tradestock.ticker}) ${tradestock.breakoutsafetyshortlv}=>${tempbreakoutsafetyshortlv} ${changedperstr} ${GetLogDate(curelement)}`);
                        tradestock.breakoutsafetyshortlv = tempbreakoutsafetyshortlv;
                        
                        if(!skipsell)
                        {
                            Callback(`${macdshorttemp}`);
                            return true;    
                        }
                    }
                }
                // 1?꾨줈留??щ씪???덈꺼??
                // else
                // {
                //     // tradestock.breakoutsafetyshortlv
                //     //  tradestock.latestclose-averagebuyprice
                //     if(defulatConfig.usebreakoutuponeper)
                //     {
                //         if(GetBreakoutsafetyshortlvTest(averagebuyprice, tradestock.latestclose,tradestock.breakoutsafetyshortlv)) 
                //         {
                //             AddSimulationLog(`BREAKOUT_LV UP(S) TODAY${istoday} ${tradestock.name}(${tradestock.ticker}) ${tradestock.breakoutsafetyshortlv}=>${tempbreakoutsafetyshortlv} ${GetLogDate(curelement)}`);
                //             ++tradestock.breakoutsafetyshortlv;// = tempbreakoutsafetyshortlv;
                //         }
                //     }
                // }
                // // ?쒓?媛 ?곌?寃⑸낫???믪쑝硫??먮ℓ 
                // else{
                //     const isstarttimetrade = tradestock.getpricecount < 2; 
                //     if(!istoday && isstarttimetrade && tradestock.latestclose>averagebuyprice)
                //     {
                //         macdshorttemp = `BAFIRSTPRICE_SHORT D+${passedday-1}`;
                //         Callback(`${macdshorttemp}`);
                //         return true;
                //     }
                // }
            }
            if(globalval.excelvalues && !globalval.excelvalues.USESHSELL)
                return false;
        }
        ////////////////////////////////

        const passeddaystr = IsPassedNDays(tradestock, curChartIdx, hasstockcount, account);
        if(passeddaystr)
        {
            Callback(`${passeddaystr}`);
            return true;
        }
        else if(IsTouchedWantPriceBreakout(tradestock, curChartIdx, hasstockcount, account))
        {
            Callback("WANTPRICE_SHORT");
            return true;
        }

        if(globalval.excelvalues && !globalval.excelvalues.USESHSELL)
            return false;
    }

    // ORIGINAL TOOL

    if(IsNewMacdDeadCross(chartdatasTemp, curChartIdx, Callback))
    {
        // Callback("MACD_SHORT");
        return true;
    }
    else if(IsMacdUnderRsiShortDownNotBuyDay(chartdatasTemp, curChartIdx, account, tradestock.ticker))
    {
        Callback("RSI_MACD_DOWN_SHORT");
        return true;
    }
    else if(IsMacdUnderRsiShortDownOnlyBuyDay(chartdatasTemp, curChartIdx, account, tradestock.ticker))
    {
        Callback("RSI_BUYDAY_DOWN_SHORT");
        return true;
    }
    else if(IsMacdUnderRsiShortCross(chartdatasTemp, curChartIdx))
    {
        Callback("MACDUNDER_RSI_SHORT_CROSS");
        return true;
    }
    else if(IsShortDayout(chartdatasTemp, curChartIdx))
    {
        Callback("DAYOUT_SHORT");
        return true;        
    }
    else if(IsRefundsShort(tradestock))
    {
        Callback("RSIREFUND_SHORT");
        return true;
    }
    else if(IsTodaySSaksuCut(tradestock,account))
    {
        Callback("SSAKSUCUT_SHORT");
        return true;   
    }
    else if(XX(tradestock,account))
    {
        Callback("XX_SHORT");
        return true;   
    }
    else if(!ShouldSkipJiJiBuJinShortByAssetSellCashGate(account, tradestockdic) && IsJiJiBuJinShort(tradestock,account))
    {
        Callback("JIJIBUJIN_SHORT");
        return true;   
    }
    else if(IsProfitToLossShort(tradestock,account))
    {
        Callback("PROFITLOSS_SHORT");
        return true;   
    }
    else if(IsEarlyProfitLockShort(tradestock,account))
    {
        Callback("EARLY_PROFIT_LOCK_SHORT");
        return true;   
    }
    else if(IsProfitGivebackShort(tradestock,account))
    {
        Callback("PROFITGIVEBACK_SHORT");
        return true;   
    }    
    
    return false;
}



const IsShortDayout=(chartdatasTemp, curChartIdx)=>{
    if(!defulatConfig.usedayout)
        return false;
    if(!IsAlmostCloseTimePure(chartdatasTemp, curChartIdx))
        return false;
    const curelement = chartdatasTemp[curChartIdx];
    if(curelement.macdlongshort.includes('DAYOUT_SHORT'))
        return false;
    return true;
}

const IsAlreadyDayOut=(tradestockdic, account, tradestock, chartdatasTemp, curChartIdx)=>{
    if(!defulatConfig.usedayout)
        return false;

    const isalreadydayout = Object.entries(account).find((walletelement)=>{
        const ticker = walletelement[0];
        const walletstock = tradestockdic[ticker];
        if(!walletstock)
            return false;
        
        const macdlongshort = walletstock.chartdatas[walletstock.curchartdataidx].macdlongshort;
        return macdlongshort == 'DAYOUT_SHORT';
    });

    return (isalreadydayout != undefined);
}



/////////////////////////////////////////////////////////////////////////////////

const isMAGood=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    if(!curelement.sma5 || !curelement.sma10 || !curelement.sma20 || !curelement.sma60 || !curelement.sma120)
        return true;

    // const musthigh = Math.min(curelement.sma60, curelement.sma120); 

    if(curelement.close > curelement.sma120 
        && curelement.sma5  > curelement.sma120
        && curelement.sma10  > curelement.sma120
        && curelement.sma20 > curelement.sma120
        && curelement.sma60 > curelement.sma120)
        return false;
    // if(curelement.close > musthigh 
    //     && curelement.sma5  > musthigh
    //     && curelement.sma20 > musthigh)
    //     return false;
    // if(curelement.close > musthigh 
    //     || curelement.sma5  > musthigh
    //     || curelement.sma20 > musthigh)
    //     return false;

    // if((curelement.sma5 > curelement.sma20))
    // {
    //     return true;
    // }

    return true;
}

const isRSIGood=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];
    if(!curelement || !beforeelement)
        return false;
    
    const currsisignalgap = curelement.rsi.RSI-curelement.rsi.signal
    const befrsisignalgap = beforeelement.rsi.RSI-beforeelement.rsi.signal
    const buyToGooTimeRSI = currsisignalgap > befrsisignalgap;
    return buyToGooTimeRSI;

}

// Trend //////////////////////////////////////
// ?쇰큺 : 5?쇱꽑??20?쇱꽑 ?꾨옒 - 留ㅼ닔 x
// 二쇰큺 : RSI 14,9 ?щ줈???섎떒 - 留ㅼ닔 x
// ?붾큺 : RSI 14,9 ?щ줈???섎떒 - 留ㅼ닔 x
const IsPriceTrend=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.usePriceTrend)
        return true;

    if(IsmacdlongZeroUnderMACD(chartdatas, chartdatasidx))
        return false;

    return true;
}

const IsVirtualExcludeTest=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.useVirtualExcludeTest)
        return false;

    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const excludeYMs = [
        {Y:23,M:8},{Y:23,M:9},{Y:23,M:10},
        {Y:24,M:7},{Y:24,M:8},{Y:24,M:9},{Y:24,M:10},{Y:24,M:11},{Y:24,M:12},
    ]
    
    const year = curelement.datetime.getFullYear().toString().slice(2,4);
    const month = curelement.datetime.getMonth()+1;
    // let isExclude = false;
    return excludeYMs.some((excludeYM)=>{
        // isExclude = (excludeYM.Y == year && excludeYM.M == month);
        return (excludeYM.Y == year && excludeYM.M == month);
    })

    // return isExclude;
}

// ?뚭레??留ㅻℓ ?꾩슂 ?곹깭
const NeedPassiveLong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    
    if(!curelement.sma60)
        return false;

    return curelement.close < curelement.sma60;
}

// *留ㅼ닔 //////////////////////////////////////
// macd 怨⑤뱺?щ줈??&& ?대? ?댁젣?먮퉬??rsi媛뺣룄媛醫뗫떎 ( rsi媛 怨⑤뱶諛⑺뼢?쇰줈 醫곸븘吏?)
const IsNewMacdGoldCross=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.longbymacd)
        return false;
    return ( ((Ismacdlong(chartdatas, chartdatasidx) || IsmacdlongCrossOverZero(chartdatas, chartdatasidx)) /*|| IsmacdlongYesterday(chartdatas, chartdatasidx)*/ ) 
    && isRSIGood(chartdatas, chartdatasidx) );
    // && isMAGood(chartdatas, chartdatasidx);
    
    // && IsmacdlongZeroOver(chartdatas, chartdatasidx)
}

// ?뱀씪 ?ш뎄留?
const IsRefundsLong=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.useRefundsLong)
        return false;

    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    if(!curelement.macdlongshort.includes('SHORT'))
        return false;

    if(!IsAlmostCloseTime(chartdatas, chartdatasidx))
        return false;

    if(!IsNewMacdDeadCross(chartdatas, chartdatasidx))
        return true;
}

// 吏?쒕떖 醫낃?蹂대떎 ?꾩옱 醫낃?媛 鍮꾩뙂
const IsNewBeforeMonthCloseOver=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    const beforemonthdata = GetBeforeMonthdata(chartdatas, chartdatasidx);
    if(!beforemonthdata)
        return false;

    return curelement.close > beforemonthdata.close;
}

// *留ㅻ룄
// rsi 70?댁긽?먯꽌 ?곕뱶?щ줈??OR macd ?곕뱶?щ줈??
const IsNewMacdDeadCross=(chartdatas, chartdatasidx, Callback)=>{
    if(Ismacdshort(chartdatas, chartdatasidx))
    {
        Callback("MACD_SHORT");    
        return true;
    }
    else 
        if(IsRSIshortOnTopCross(chartdatas, chartdatasidx))// || IsRSIshortOnTop(chartdatas, chartdatasidx) ;
    {
        Callback("RSITOPCROSS_SHORT");    
        return true;
    }
    else if(defulatConfig.usersishortcross && IsRSIshortCross(chartdatas, chartdatasidx))// || IsRSIshortOnTop(chartdatas, chartdatasidx) ;
    {
        Callback("RSI_SHORT");    
        return true;
    }
    return false;
}


const IsMacdUnderRsiShortDownOnlyBuyDay=(chartdatasTemp, curChartIdx, account, ticker)=>{
    if(!defulatConfig.useMacdUnderRsiShortDownOnlyBuyDay)
        return false;

    // const buydate = GetLastTradeDate(account, ticker);
    // if(!buydate)
    //     return false;

    // const buydayYMD = GetYMD(buydate);
    // const curelement = chartdatasTemp[curChartIdx];
    // const todayYMD = GetYMD(curelement.datetime);
    
    // if(todayYMD != buydayYMD)
    //     return false;
    if(!IsBuyDayIsToday(account, ticker, chartdatasTemp, curChartIdx))
        return false;

    return (IsMacdUnderRsiShortDown(chartdatasTemp, curChartIdx));
}

const IsMacdUnderRsiShortDownNotBuyDay=(chartdatasTemp, curChartIdx, account, ticker)=>{
    if(!defulatConfig.useMacdUnderRsiShortDown)
        return false;

    // const buydate = GetLastTradeDate(account, ticker);
    // if(!buydate)
    //     return false;

    // const buydayYMD = GetYMD(buydate);
    // const curelement = chartdatasTemp[curChartIdx];
    // const todayYMD = GetYMD(curelement.datetime);
    
    // if(todayYMD != buydayYMD)
    //     return false;
    if(IsBuyDayIsToday(account, ticker, chartdatasTemp, curChartIdx))
        return false;
    // if(!IsBuyDayIsOverday(account, ticker, chartdatasTemp, curChartIdx))
    //     return false;

    return (IsMacdUnderRsiShortDown(chartdatasTemp, curChartIdx));
}

const IsMacdUnderRsiShortDown=(chartdatasTemp, curChartIdx)=>{
    // if(!IsAlmostCloseTimePure(chartdatasTemp, curChartIdx))
    //     return false;

    // TESTDBUG DELETE
    // if(GetYMD(chartdatasTemp[curChartIdx].date) == '20250829' && chartdatasTemp[curChartIdx].date.getHours() == 11 && chartdatasTemp[curChartIdx].code == 'a068270')
    // {
    //     console.log('DEBUG ', tradestock.ticker);
    // }

    return (!Ismacdup(chartdatasTemp, curChartIdx) && IsRSIshortDown(chartdatasTemp, curChartIdx));
}

const IsMacdUnderRsiShortCross=(chartdatasTemp, curChartIdx)=>{
    if(!defulatConfig.useMacdUnderRsiShortCross)
        return false;

    return (!Ismacdup(chartdatasTemp, curChartIdx) && IsRSIshortCross(chartdatasTemp, curChartIdx));
}

// ?뱀씪 ?ы뙋留?
const IsRefundsShort=(tradestock)=>{
    if(!defulatConfig.useRefundsShort)
        return false;

    const chartdatas = tradestock.chartdatas;;
    const chartdatasidx = tradestock.curchartdataidx;
    
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    if(!curelement.macdlongshort.includes('LONG'))
        return false;

    if(!IsAlmostCloseTime(chartdatas, chartdatasidx))
        return false;
    
    let longcondition = false;

    if (curelement.macdlongshort.includes('MACD'))
        longcondition = IsNewMacdGoldCross(chartdatas, chartdatasidx);
    else if(curelement.macdlongshort.includes('RSI'))
        longcondition = IsRSIlongCross(tradestock);

    return !longcondition;
}


const IsTodaySSaksuCut=(tradestock, account)=>{
    if(!defulatConfig.usetodayssaksucut)
        return false;

    const chartdatas = tradestock.chartdatas;;
    const chartdatasidx = tradestock.curchartdataidx;
    
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    // if(!curelement.macdlongshort.includes('LONG'))
    //     return false;
    const actdate = GetLastDateTime(account, tradestock.ticker);
    const passedday = GetPassedDayFromBought(chartdatas, chartdatasidx, actdate);

    if(passedday != 0)
        return false;

    // if(!IsAlmostCloseTimePure(chartdatas, chartdatasidx))
    //     return false;
    
    // let longcondition = false;

    // if (curelement.macdlongshort.includes('MACD'))
    //     longcondition = IsNewMacdGoldCross(chartdatas, chartdatasidx);
    // else if(curelement.macdlongshort.includes('RSI'))
    //     longcondition = IsRSIlongCross(tradestock);

    // return !longcondition;
    const walletelement = account[tradestock.ticker];
    if(!walletelement)
        return false;
    if(!walletelement.averagebuyprice)
        return false;

    // if(!globalval.excelvalues || !globalval.excelvalues.SELLUPRATE)
    //     return false;
        
    const cutprice = walletelement.averagebuyprice * (1+defulatConfig.ssaksucutrate*0.01);
    return curelement.close < cutprice;
}

// 吏?쒕떖 醫낃?蹂대떎 ?꾩옱 醫낃?媛 ??
const IsNewBeforeMonthCloseUnder=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    const beforemonthdata = GetBeforeMonthdata(chartdatas, chartdatasidx);
    if(!beforemonthdata)
        return false;

    return curelement.close < beforemonthdata.close;
}

const IsDoNotLongSMA=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    // const beforeelement = chartdatas[chartdatasidx-1];
    // if(!curelement || !beforeelement)
    //     return false;
    
    // if(curelement.close < beforeelement.close)
    //     return false;

    // if(curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
    //     return false;

    if(!curelement.sma5 || !curelement.sma20 || !curelement.sma60)
        return false;

    if((curelement.sma5 < curelement.sma20) && (curelement.sma20 < curelement.sma60))
    {
        return true;
    }

    return false;
}

// const IsUnlockLongSMA=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const beforeelement = chartdatas[chartdatasidx-1];
//     if(!curelement || !beforeelement)
//         return false;
    
//     // if(curelement.close < beforeelement.close)
//     //     return false;

//     // if(curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
//     //     return false;

//     const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
//     if(!latestTradechart)
//         return false;

//     const latestTradeLongstyle = latestTradechart.macdlongshort;
//     if(latestTradeLongstyle === '')
//         return false;

//     if(!curelement.sma5 || !curelement.sma20 || !curelement.sma60)
//         return false;

//     if((curelement.sma5 > curelement.sma20) && (beforeelement.sma5 < beforeelement.sma20) && (beforeelement.sma20 < beforeelement.sma60))
//     {
//         return true;
//     }

//     return false;
// }

// const setLowPrice=(chartdatas, account)=>{
//     let element = chartdatas[chartdatas.length-1];
//     const isPriceShort = account && account.count > 0 && element.close > account.averagebuyprice * lowPriceSellPercent;

//     if(isPriceShort)
//         element.pricelongShort = "PRICESHORT";
//     else
//         element.pricelongShort = "NONE";
// }

const ProcessCoolTime=(db_id, account, tradestocklist, g_tradecooltimes, cooltimecheckdelay, setaccount, ResetCooltime)=>{
    for(const [key,value] of Object.entries(g_tradecooltimes))
    {
        if(value === undefined)
        continue;

        if(value <= 0)
        {
            g_tradecooltimes[key] = undefined;

            // 留ㅻℓ ?깃났 硫붿떆吏 諛쏆?吏 5遺꾩씠 吏?쒖긽?? 
            //console.log(`${key} stock passed 5minutes after latest trade`)
            
            // odno媛 ?ъ쟾??req ?곹깭 ( ?붿껌 ???묐떟??紐삳컺??) 嫄곕굹 ?좏슚?쒓컪 (二쇰Ц?깃났?곹깭) ?닿퀬 1嫄대룄 泥닿껐?쒓쾶 ?놁쑝硫?罹붿뒳?대쾭由곕떎.
            const tradestock = tradestocklist.find(element=>element.ticker===key);
            if(tradestock && tradestock.odno && tradestock.tot_ccld_qty === '0')
            {
                const name = tradestock.name;
                const ticker = key;
                const market = tradestock.market;
                const odno = tradestock.odno;
                let loghead = `${name}(${ticker}) ${odno}`;

                if(defulatConfig.usebreakouttrade)
                {
                    const macdlongshort = tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort;
                    
                    loghead = `${loghead} try trading...`;
                    telegramapi.SendMessageSellBuy(loghead, macdlongshort);
                }
                else{
                    Market_cancel_order(db_id, odno, market, ticker, ()=>{
                        loghead = `${loghead} cancel to before 5minutes requested trade`;
                        console.log('[RES]', loghead);
                        tradestock.tot_ccld_qty = null;
                        tradestock.odno = null;
                        const macdlongshort = tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort;
                        const sell_buy_dvsn = tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort.includes('SHORT') ? '01' : '02';
                        tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort = '';
                        const log = `${macdlongshort} TO '${tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort}' \r\n`;
                        telegramapi.SendMessageSellBuy(loghead, log);
                        const isAllOdnoNull = tradestocklist.every(item => item.odno == null);
                        if(isAllOdnoNull)
                        {
                            Getaccount(db_id).then((r)=>{
                                setaccount(r);
                                let addlog = `?쒕쾭 ?뺣낫濡?怨꾩쥖由ъ뀑. because ${loghead}`;
                                console.log(addlog);
                            });
                        }
                        else
                        {
                            copyaccount = GetCloneAccount('fail', account, ticker, name, sell_buy_dvsn, 0, 0, 0, macdlongshort);
                            setaccount(copyaccount);
                        }
                        
                        
                        // ResetCooltime(ticker, 1000 * 60 * 60 * 3); // 3?쒓컙?숈븞 嫄곕옒 湲덉? // 20250405 湲됰씫 ?몃젅?대뱶 ??몃줈 紐삵뙆??寃쎌슦 ?앷?! 紐뉖쾲???쒕룄?댁꽌?쇰룄 ?ㅼ떆?붿븘?쇳븿
                        // ?깃났??
                        // *CASH* 痍⑥냼??媛?닔, 泥섎━??媛?닔 ?묐쭔??cash?먯꽌 falseamount, amount 泥섎━ 
                        // *STOCK* 痍⑥냼??媛?닔, 泥섎━??媛?닔 ?묐쭔??falseamount, amount 泥섎━
                    })
                }
            }
            continue;
        }else{
            g_tradecooltimes[key] -= cooltimecheckdelay;
            // console.log(`${key} cool is ${value}`)
        } 
    }
}

const GetBuyMoney=(stockvalue)=>
{
    return stockvalue * (1+((defulatConfig.buycharge+defulatConfig.simlatebuycharge)/100));
}

const GetSellMoney=(stockvalue)=>
{
    return stockvalue * (1-((defulatConfig.sellcharge+defulatConfig.simlatesellcharge)/100));
}
    
const EnoughMoneyExport=(hasmoney, stockvalue)=>{
    return ((hasmoney > stockvalue * (1+((defulatConfig.buycharge+defulatConfig.simlatebuycharge)/100))));
}

// ?뚯?湲덉씠 ?щ젮?붽툑?≪쓽 ?덈컲 ?댁긽?몄? ?먮떒. ??鍮꾩떬 二쇱떇? 1媛??댁긽 ?????덈뒗吏??泥댄겕
const EnoughNeedBuyMoney=(hasmoney, needmoney)=>{
    // ?щ젮??湲덉븸???덈컲濡쒖쭅 ?ъ슜 ?뚮옒洹몃? ?꾨㈃, 臾댁“嫄?
    if(!useDivEnoughNeedBuyMoney)
        return true;
    
    if(defulatConfig.usesamebuyrate)
        return hasmoney >= needmoney;
    else
        return ((hasmoney >= needmoney * 0.5));
}

const GetChartDataYMD = (chartdata) => {
    if(!chartdata || !chartdata.date)
        return '';

    const time = chartdata.date.getTime ? chartdata.date.getTime() : chartdata.date;
    if(chartdata._ymdTime === time && chartdata._ymd)
        return chartdata._ymd;

    const ymd = GetYMD(chartdata.date);
    chartdata._ymdTime = time;
    chartdata._ymd = ymd;
    return ymd;
};

const GetPartialEntryConfig = () => {
    if(!defulatConfig.autosimulation)
        return null;
    const mode = defulatConfig.usepartialentry || '';
    if(cachedPartialEntryMode !== mode)
    {
        cachedPartialEntryMode = mode;
        cachedPartialEntryModeKey = mode ? String(mode).toLowerCase() : '';
        cachedPartialEntryPreset = GetPartialEntryPreset(mode);
    }
    return cachedPartialEntryPreset;
};

const GetHeldStockKindCount = (account) => {
    return Object.entries(account).filter(element => {
        if(element[0] === 'a0')
            return false;
        const accountdata = element[1];
        return accountdata && (((accountdata.amount || 0) > 0) || ((accountdata.falseamount || 0) > 0));
    }).length;
};

const IsPartialEntryNewBuyBlocked = (account, preset) => {
    if(!preset || !preset.maxNewPositions)
        return false;
    return GetHeldStockKindCount(account) >= preset.maxNewPositions;
};

const MakePartialEntryState = (preset, mode, basePrice, targetCapital, step, extraState = null) => {
    return Object.assign({
        partialentrymode: mode,
        partialentrybaseprice: basePrice,
        partialentrystep: step,
        partialentrymaxstep: preset.maxSteps,
        partialentrytargetcapital: targetCapital,
    }, extraState || {});
};

const GetPartialEntryTrancheCash = (accountdata) => {
    if(!accountdata)
        return 0;
    const storedCash = Number(accountdata.partialentrytranchecash || 0);
    if(storedCash > 0)
        return storedCash;

    const firstLot = GetPartialEntryLots(accountdata)
        .sort((a, b) => a.step - b.step)[0];
    if(!firstLot)
        return 0;

    return firstLot.price * firstLot.amount;
};

const GetPartialEntryLots = (accountdata) => {
    if(!accountdata || !Array.isArray(accountdata.partialentrylots))
        return [];
    return accountdata.partialentrylots
        .map(lot => ({
            step: Number(lot.step || 0),
            price: Number(lot.price || 0),
            amount: Math.floor(Number(lot.amount || 0)),
            date: lot.date || '',
        }))
        .filter(lot => lot.step > 0 && lot.price > 0 && lot.amount > 0);
};

const MakePartialEntryLot = (step, price, amount, chartdata) => ({
    step,
    price,
    amount,
    date: GetChartDataYMD(chartdata),
});

const AppendPartialEntryLotState = (accountdata, step, price, amount, chartdata) => {
    const lots = GetPartialEntryLots(accountdata);
    lots.push(MakePartialEntryLot(step, price, amount, chartdata));
    return {
        partialentrylots: lots,
        partialentrylastbuydate: GetChartDataYMD(chartdata),
    };
};

const GetPartialEntryAddPlan = (account, ticker, latestclose, canusecashamount, preset, chartdata = null) => {
    if(preset === undefined)
        preset = GetPartialEntryConfig();
    if(!preset)
        return null;

    const accountdata = account[ticker];
    if(!accountdata)
        return null;

    const stockAmount = GetStockAmount(account, ticker);
    if(stockAmount <= 0)
        return null;

    const basePrice = Number(accountdata.partialentrybaseprice);
    const currentStep = Number(accountdata.partialentrystep || 0);
    const maxStep = Number(accountdata.partialentrymaxstep || preset.maxSteps);
    const targetCapital = Number(accountdata.partialentrytargetcapital || 0);
    if(!basePrice || !currentStep || !maxStep || !targetCapital)
        return null;
    if(currentStep >= maxStep)
        return null;

    const todayYmd = GetChartDataYMD(chartdata);
    if(preset.oncePerDay && accountdata.partialentrylastbuydate === todayYmd)
        return null;

    const nextStep = currentStep + 1;
    const triggerRates = Array.isArray(preset.triggerProfitRates) ? preset.triggerProfitRates : null;
    const triggerRate = triggerRates ? Number(triggerRates[nextStep - 1] || 0) : ((nextStep - 1) * preset.triggerProfitStep);
    const triggerBasePrice = preset.useBasePriceTrigger ? basePrice : GetAveragePrice(account, ticker);
    const triggerPrice = triggerBasePrice * (1 + (triggerRate * 0.01));
    if(latestclose < triggerPrice)
        return null;

    const buymoneywithchargebyonestock = GetBuyMoney(latestclose);
    let buyamount = 0;
    if(preset.fixedAddAmountFromFirst)
    {
        const trancheCash = GetPartialEntryTrancheCash(accountdata);
        if(trancheCash <= 0)
            return null;

        buyamount = Math.floor(trancheCash / buymoneywithchargebyonestock);
        if(buyamount <= 0)
            return null;

        const needCapital = buyamount * buymoneywithchargebyonestock;
        if(canusecashamount < needCapital)
            return null;
    }
    else
    {
        const targetCapitalForStep = targetCapital * (nextStep / maxStep);
        const currentCapital = stockAmount * latestclose;
        const needCapital = targetCapitalForStep - currentCapital;
        if(needCapital <= 0)
            return null;
        if(canusecashamount < needCapital)
            return null;

        buyamount = Math.floor(needCapital / buymoneywithchargebyonestock);
    }
    if(buyamount <= 0)
        return null;

    return {
        buyamount,
        nextStep,
        maxStep,
        triggerPrice,
    };
};

const GetPartialEntryStepStopPlan = (account, ticker, latestclose, stockAmount, preset) => {
    if(!preset || !Number.isFinite(Number(preset.stepStopLossPercent)))
        return null;

    const accountdata = account[ticker];
    const lots = GetPartialEntryLots(accountdata);
    if(!accountdata || !lots.length || stockAmount <= 0)
        return null;

    const stopMultiplier = 1 + (Number(preset.stepStopLossPercent) * 0.01);
    const stopLot = lots
        .slice()
        .sort((a, b) => b.step - a.step)
        .find(lot => latestclose <= lot.price * stopMultiplier);
    if(!stopLot)
        return null;

    const sellAmount = Math.min(stockAmount, stopLot.amount);
    if(sellAmount <= 0)
        return null;

    let remainToSell = sellAmount;
    const nextLots = [];
    lots.forEach(lot => {
        if(lot.step !== stopLot.step || remainToSell <= 0)
        {
            nextLots.push(lot);
            return;
        }
        const sold = Math.min(lot.amount, remainToSell);
        remainToSell -= sold;
        const remainAmount = lot.amount - sold;
        if(remainAmount > 0)
            nextLots.push(Object.assign({}, lot, {amount: remainAmount}));
    });

    const nextStep = nextLots.reduce((max, lot) => Math.max(max, lot.step), 0);
    return {
        sellAmount,
        step: stopLot.step,
        stopPrice: stopLot.price * stopMultiplier,
        lotPrice: stopLot.price,
        nextLots,
        nextStep,
    };
};

const GetGoogStock=(ticker)=>{
    const personstockinfo = globalval.personstocklist[ticker];
    return personstockinfo;
}

const IsTouchedBuyPrice=(tradestock, chartdatasidx, hasstockcount)=>{
    if(hasstockcount>0)
        return false;
    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    const personstockinfo = GetGoogStock(tradestock.ticker);
    if(!personstockinfo)
        return false;
    return curelement.close < personstockinfo.buy1;
}

// 援ъ엯?쇨뎄?낆떆 遺???ㅻ뒛源뚯? 理쒓퀬媛 ?산린. 援ъ엯?쇰쭔 ?밸퀎??援ъ엯?쒕텇遊??댄썑??遺꾨큺?쇰줈 ?살뼱?⑤떎
const Gethighclosefromactoday=(chartdatas, chartdatasidx, actdate)=>{
    let highclose = 0;
    if(GetYMD(chartdatas[chartdatasidx].date) == actdate)
         return highclose;
        
    for(let i = chartdatasidx; i > 0; --i)
    {
        const tempdata = chartdatas[i];
        highclose = Math.max(highclose, tempdata.close); 
        const tempymd = `${tempdata.date.getFullYear()}${(tempdata.date.getMonth()+1).toString().padStart(2, 0)}${tempdata.date.getDate().toString().padStart(2, 0)}`;
        if(tempymd === actdate)
            break;
    }

    return highclose;
}

const IsTouchedWantPriceAfterDroped=(tradestock, chartdatasidx, hasstockcount)=>{
    // 援щℓ?댄썑濡??꾩옱源뚯? 媛寃⑹쨷??want1蹂대떎 ??媛믪씠 ?덈떎硫?
    // ?꾩옱媛媛 want1蹂대떎 -3?꾨줈 ?댄븯濡??섎씫??留ㅻ룄
    // return false;   // ?묒뾽?꾨즺?덈맖

    if(hasstockcount<0)
        return false;
    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    const personstockinfo = globalval.personstocklist[tradestock.ticker] || globalval.successpersonstocklist[tradestock.ticker];
    if(!personstockinfo)
        return false;

    const walletelement = account[tradestock.ticker];
    const actdate = walletelement[1].actdate;
    const istouchedwant1 = Gethighclosefromactoday(chartdatas, chartdatasidx, actdate)

    return istouchedwant1 && (curelement.close < (personstockinfo.want1 * ((100 - 3)*0.01)));
}

const IsTouchedWantPrice=(tradestock, chartdatasidx, hasstockcount, wantprice)=>{
    if(hasstockcount<=0)
        return false;

    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;
    return curelement.close > wantprice;
}

const IsTouchedWantPriceBreakout=(tradestock, chartdatasidx, hasstockcount, account)=>{
    if(hasstockcount<=0)
        return false;

    const walletelement = account[tradestock.ticker];
    if(!walletelement)
        return false;
    if(!walletelement.averagebuyprice)
        return false;

    if(!globalval.excelvalues || !globalval.excelvalues.SELLUPRATE)
        return false;
        
    const wantprice = walletelement.averagebuyprice * (1+globalval.excelvalues.SELLUPRATE*0.01);
    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    if(curelement.close > wantprice)
    {
        console.log('');
    }
    return curelement.close > wantprice;
}

const getDaysDiff = (startday, endday, chartdatas,chartdatasidx) => {
    // YYYY-MM-DDT00:00:00 ?뺤떇?쇰줈 蹂?섑븯??UTC Date 媛앹껜 ?앹꽦 (?쒓컙? 臾몄젣 理쒖냼??
    const toDate = (str) => new Date(str.slice(0, 4) + '-' + str.slice(4, 6) + '-' + str.slice(6, 8) + 'T00:00:00Z');

    const dateA = toDate(startday);
    const dateB = toDate(endday);

    // 諛由ъ큹 李⑥씠 / (1000ms * 60s * 60m * 24h)
    return Math.floor(Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
};

const IsPassedNDays=(tradestock, chartdatasidx, hasstockcount, account)=>{
    if(hasstockcount<=0)
        return false;

    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const actdate = GetLastDateTime(account, tradestock.ticker);
    const passedday = GetPassedDayFromBought(chartdatas, chartdatasidx, actdate);
    
    if(actdate==null)
        return false;
    // ?ㅻ뒛?곌굔 ?ㅻ뒛 ?붿? ?딅뒗??
    if(IsBuyDayIsToday(account, tradestock.ticker, chartdatas, chartdatasidx))
        return false;
    if(globalval.excelvalues && !globalval.excelvalues.SELLOVERDAY)
        return false;
    // 5???댁긽 吏?쒓굔 議곌굔?놁씠 ?먮ℓ
    const ispassedday = passedday >= globalval.excelvalues.SELLOVERDAY;
    if(ispassedday)
        return `SELLOVERDAYSHORT D+${passedday}`;

    ////////////// ba v1??寃쎌슦
    if(globalval.excelvalues.UPLIMIT)
    {
        const thedayfirsttrade = ThedayFirstTrade(tradestock, chartdatasidx, passedday, account);
        if(thedayfirsttrade)
            return thedayfirsttrade;
    }

    return false;
}

//
const ThedayFirstTrade=(tradestock, chartdatasidx, passedday, account)=>{
    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[chartdatasidx];
    // 洹몃궇??泥??몃젅?대뱶
    const isstarttimetrade = tradestock.getpricecount < 2; 
    // 援щℓ??3?쇱씠??吏?ш굅???꾨궇 ?곸뿉 ??붾뜲 ?곸쓣 紐살??④꼍??
    const ispassedmidday = (passedday >= globalval.excelvalues.SELLMIDDAY) || IsGuardFailFastSell(chartdatas, chartdatasidx);   

    // const isrealtimesel = defulatConfig.realtimebuystartday ? ispassedmidday : false; // 3?쇱감遺???ㅼ떆媛꾨ℓ??// XXX BA HALL
    const isrealtimesel = defulatConfig.realtimebuystartday ? true : ispassedmidday; 
    const cansel = isstarttimetrade || isrealtimesel;
    if(cansel && curelement.close > GetAveragePrice(account, tradestock.ticker))
    {
        let macdlongshorttemp = `THEDAYFIRSTUPSHORT D+${passedday-1}`;
        // macdlongshorttemp = `FORCE_${macdlongshorttemp}`
        return macdlongshorttemp;
    }
    // 泥??몃젅?대뱶?먯꽌 紐???寃쎌슦 3?쒓? 吏?ъ쑝硫??먮떎
    // else if(IsPersonaltradeCanSelTime(chartdatas, chartdatasidx))
    // {
    //     return 'THEDAYCLEANTIME';
    // }

    // 留ㅼ닔?ㅼ쓬?좊???援щℓ媛蹂대떎 ?믪쑝硫?利됱떆 ?먮떎
    // if(passedday>0)
    // {   
    //     if(curelement.close > GetAveragePrice(account, tradestock.ticker))
    //     {
    //         return `ALLTIMEUP D+${passedday-1}`;
    //     }
    // }

    return false;
} 

// ?꾩씪醫낃?媛 ?꾩쟾??醫낃???+28?꾨줈 誘몃쭔?쇰줈 ?섎씫??( ??紐살???) 
const IsGuardFailFastSell=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.useguardfailfastsell)
        return false;

    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];   
    const before2element = chartdatas[chartdatasidx-2];

    if(!curelement || !beforeelement || !before2element)
        return false;
    
    return (!IsRecheadUpLimit(before2element.close, beforeelement.close));
}

const IsBuyToGooTime=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const buyToGooTime = useBuyToGooTime ? curelement.open * (1 + (nothightToBuypercent / 100)) > curelement.close : true;
    return buyToGooTime;
}

const IsBuyToGooTimeRSI=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const rsisignalgap = curelement.rsi.RSI-curelement.rsi.signal;
    const buyToGooTimeRSI = (useBuyToGooTimeRSI && curelement.rsi) ? (rsisignalgap >= notToBuyPercentRsiUnder && rsisignalgap <= notToBuyPercentRsiOver) : true;
    
    return buyToGooTimeRSI;
}

// 媛?씠 n蹂대떎 ?묒쑝硫?履쇨컻?붽린?????
const GetSellToGooTimeRSI=(chartdatas, chartdatasidx)=>{
    const nonsellgap = 100;
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return nonsellgap;
    if(!curelement.rsi)
        return nonsellgap;

    const rsisignalgap = curelement.rsi.RSI-curelement.rsi.signal;
    return rsisignalgap;
}
///////////// ORIGINAL LOGIC /////////////////////////////

const IsOriginRSIlong=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    if(!IsRSICanLong(chartdatas, chartdatasidx))
        return false;
    // beforeday test
    // if(!beforeelement.rsi)
    //     return;    
    // return (beforeelement.rsi.RSI <= rsilow)// && curelement.rsi.RSI > rsilow)

    return curelement.rsi.RSI < rsilow;
}

const IsOriginRSIshort=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement || !beforeelement)
        return false;

    if(!curelement.rsi)
        return false;

    // beforeday test
    // if(!beforeelement.rsi)
    //     return;
    // return (beforeelement.rsi.RSI >= rsihigh ) // && curelement.rsi.RSI < rsihigh

    return curelement.rsi.RSI > rsihigh;
}
const IsOriginRSIlong2=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement.rsi)
        return false;
    
    if(chartdatasidx<=rsi2day)
        return false; 
    
    const rsidaystart = chartdatasidx-rsi2day+(beforetest?0:1);
    const rsidayend = chartdatasidx+(beforetest?0:1);
    const compareelement = chartdatas[rsidayend-1];

    // case1.
    const slices = chartdatas.slice(rsidaystart, rsidayend);
    const arrs = GetVolumes (slices).sort((a, b) => b-a);    
    const highest = Highest2(arrs);
    if((curelement.volume < highest * 0.8 || curelement.volume < arrs[3])) 
        return false;

    // const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    // if(!latestTradechart)
    //     return false;

    // const latestTradeLongstyle = latestTradechart.macdlongshort;
    // if(latestTradeLongstyle === '')
    //     return false;

    // if(latestTradeLongstyle.includes('LONG'))
    //     return false;

    if(!IsRSICanLong(chartdatas, chartdatasidx))
        return false;
    return compareelement.rsi.RSI < rsilow2;// && curelement.rsi.RSI > beforeelement.rsi.RSI-10;

    return true;
}

const IsOriginRSIshort2=(chartdatas, chartdatasidx)=>{
    const curelement = chartdatas[chartdatasidx];
    const beforeelement = chartdatas[chartdatasidx-1];    

    if(!curelement.rsi)
        return false;

    if(chartdatasidx<=rsi2day)
        return false;

    const rsidaystart = chartdatasidx-rsi2day+(beforetest?0:1);
    const rsidayend = chartdatasidx+(beforetest?0:1);
    const compareelement = chartdatas[rsidayend-1];

    // case1.
    const slices = chartdatas.slice(rsidaystart, rsidayend);
    const arrs = GetVolumes (slices).sort((a, b) => b-a);
    const highest = Highest2(arrs);
    // if(curelement.volume < highest * 0.8 || curelement.volume < arrs[3])
    if((curelement.volume < highest * 0.8 || curelement.volume < arrs[3]))
        return false;

    // const latestTradechart = GetLatestTradechart(chartdatas, chartdatasidx);
    // if(!latestTradechart)
    //     return false;

    // const latestTradeLongstyle = latestTradechart.macdlongshort;
    // if(latestTradeLongstyle === '')
    //     return false;

    // if(latestTradeLongstyle.includes('SHORT'))
    //     return false;

    return compareelement.rsi.RSI > rsihigh2;
}

// const LocalDate=(date, market)=>{
//     if(IsNasdaq(market))
//     {
//         //let amdate = new Date(new Date().toLocaleString('en', {timeZone: 'America/New_York'}))
//         let usdate = new Date(new Date().toLocaleString('en', {timeZone: 'US/Eastern'}))
        
//         return usdate;
//     }
        
    
//     return date;
// }




const IsJiJiBuJinShort = (tradestock, account) => {
    // 1. ?ㅼ젙媛??뺤씤
    if (!defulatConfig.usejijibujinsell) return false;

    // 2. 留ㅼ닔??T) ?뺤씤
    const actdate = GetLastDateTime(account, tradestock.ticker);
    if (!actdate) return false;

    // 3. 蹂댁쑀 湲곌컙 怨꾩궛 (?꾩슜 ?⑥닔 ?쒖슜)
    const holdDays = GetPassedDayFromBought(tradestock.chartdatas, tradestock.curchartdataidx, actdate);

    // 4. T+3???λ쭏媛?泥댄겕
    // 留ㅼ닔 ??3嫄곕옒?쇱씠 寃쎄낵?덈뒗吏 ?뺤씤
    if (holdDays < 3) return false;

    // 5. ?섏씡瑜?怨꾩궛
    const boughtprice = GetAveragePrice(account, tradestock.ticker);
    const currentPrice = tradestock.latestclose;
    const currentProfitRate = (currentPrice / boughtprice - 1) * 100;

    // 6. 蹂댄빀沅?짹1%) ?〓낫 ???꾨웾 留ㅻ룄
    if (currentProfitRate >= -1 && currentProfitRate <= 1) {
        return true; 
    }

    return false;
};


const GetMaxHighProfitRateFromBoughtInfo = (tradestock, account, ticker) => {
    const actdate = GetLastDateTime(account, ticker);
    if (!actdate) return null;

    const boughtprice = GetAveragePrice(account, ticker);
    if (!boughtprice) return null;

    const chartdatas = tradestock.chartdatas;
    const curidx = tradestock.curchartdataidx;

    let maxHigh = 0;
    let maxHighIdx = -1;

    for (let i = curidx; i >= 0; --i) {
        const chartdata = chartdatas[i];
        if (!chartdata) continue;

        if (chartdata.high > maxHigh) {
            maxHigh = chartdata.high;
            maxHighIdx = i;
        }

        if (actdate == GetYMD(chartdata.date)) {
            break;
        }
    }

    if (!maxHigh || maxHighIdx < 0) return null;

    return {
        maxHighProfitRate: (maxHigh / boughtprice - 1) * 100,
        maxHighAgo: curidx - maxHighIdx
    };
};

// ???섏씡 ?덈떎媛 ?ㅻ뒭寃??뚮뒗嫄?諛⑹?
const IsEarlyProfitLockShort = (tradestock, account) => {
    const earlyProfitLockPreset = GetEarlyProfitLockPreset(defulatConfig.useearlyprofitlocksell);
    if (!earlyProfitLockPreset) return false;

    const {
        ACTIVE_PROFIT_RATE,
        GIVEBACK_POINT,
        MIN_HOLD_DAYS,
        MIN_HIGH_AGO,
        REQUIRE_CLOSE_TIME,
    } = earlyProfitLockPreset;

    const actdate = GetLastDateTime(account, tradestock.ticker);
    if (!actdate) return false;

    const boughtprice = GetAveragePrice(account, tradestock.ticker);
    if (!boughtprice) return false;

    const holdDays = GetPassedDayFromBought(tradestock.chartdatas, tradestock.curchartdataidx, actdate);
    if (holdDays < MIN_HOLD_DAYS) return false;

    const maxHighInfo = GetMaxHighProfitRateFromBoughtInfo(tradestock, account, tradestock.ticker);
    if (!maxHighInfo) return false;

    const maxHighProfitRate = maxHighInfo.maxHighProfitRate;
    const maxHighAgo = maxHighInfo.maxHighAgo;

    if (maxHighProfitRate < ACTIVE_PROFIT_RATE) return false;
    if (maxHighAgo < MIN_HIGH_AGO) return false;
    if (REQUIRE_CLOSE_TIME && !IsAlmostCloseTimePure(tradestock.chartdatas, tradestock.curchartdataidx)) return false;

    const currentPrice = tradestock.latestclose;
    const currentProfitRate = (currentPrice / boughtprice - 1) * 100;
    const givebackRate = maxHighProfitRate - currentProfitRate;

    return givebackRate >= GIVEBACK_POINT;
};

let marketStrengthRows = null;
let marketStrengthPrevByDate = null;
let marketStrengthExposureStateByMode = {};

const GetMarketStrengthPrevRow = (ymd) => {
    if(!defulatConfig.usemarketstrengthbuyfilter && !defulatConfig.usemarketstrengthexposurelimit)
        return null;

    if(!marketStrengthPrevByDate)
    {
        marketStrengthPrevByDate = new Map();
        try {
            const path = 'C:/Users/srhsh/Documents/Codex/2026-05-30/new-chat/market_strength_daily_20221026_20260529.json';
            const data = JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
            marketStrengthRows = data.rows || [];
            for(let i = 1; i < marketStrengthRows.length; ++i)
                marketStrengthPrevByDate.set(String(marketStrengthRows[i].date), marketStrengthRows[i - 1]);
        }
        catch(err) {
            marketStrengthRows = [];
        }
    }

    return marketStrengthPrevByDate.get(String(ymd)) || null;
}

const GetMarketStrengthPrevRows = (ymd) => {
    const row = GetMarketStrengthPrevRow(ymd);
    if(!row || !marketStrengthRows)
        return { row: null, beforeRow: null };

    const rowIndex = marketStrengthRows.findIndex(element=>String(element.date) === String(row.date));
    return {
        row,
        beforeRow: rowIndex > 0 ? marketStrengthRows[rowIndex - 1] : null,
    };
}

const GetMarketStrengthMetrics = (row) => {
    if(!row)
        return null;

    const avg = (a, b) => (Number(a || 0) + Number(b || 0)) / 2;
    return {
        net10: avg(row.KOSPI_priceNetUpRatio_10ma, row.KOSDAQ_priceNetUpRatio_10ma),
        above10: avg(row.KOSPI_aboveSignalRatio_10ma, row.KOSDAQ_aboveSignalRatio_10ma),
        below40: avg(row.KOSPI_below40Ratio_10ma, row.KOSDAQ_below40Ratio_10ma),
    };
}

const IsMarketStrengthBuyBlocked = (tradestock, chartindex) => {
    const mode = String(defulatConfig.usemarketstrengthbuyfilter || '').toLowerCase();
    if(!mode)
        return false;

    const chartdata = tradestock.chartdatas[chartindex];
    if(!chartdata || !chartdata.date)
        return false;

    const row = GetMarketStrengthPrevRow(GetYMD(chartdata.date));
    if(!row)
        return false;

    const avg = (a, b) => (Number(a || 0) + Number(b || 0)) / 2;
    const net10 = avg(row.KOSPI_priceNetUpRatio_10ma, row.KOSDAQ_priceNetUpRatio_10ma);
    const above10 = avg(row.KOSPI_aboveSignalRatio_10ma, row.KOSDAQ_aboveSignalRatio_10ma);
    const delta10 = avg(row.KOSPI_delta5Avg_10ma, row.KOSDAQ_delta5Avg_10ma);
    const below40 = avg(row.KOSPI_below40Ratio_10ma, row.KOSDAQ_below40Ratio_10ma);

    if(mode === 'breadthweak')
        return net10 <= -10;
    if(mode === 'rsiweak')
        return above10 < 50 && delta10 < 0;
    if(mode === 'severeweak')
        return net10 <= -15 || (above10 < 45 && below40 >= 25);

    return false;
}

const GetMarketStrengthBuyScale = (tradestock, chartindex) => {
    const mode = String(defulatConfig.usemarketstrengthbuyfilter || '').toLowerCase();
    if(!mode)
        return 1;

    const chartdata = tradestock.chartdatas[chartindex];
    if(!chartdata || !chartdata.date)
        return 1;

    const row = GetMarketStrengthPrevRow(GetYMD(chartdata.date));
    if(!row)
        return 1;

    const avg = (a, b) => (Number(a || 0) + Number(b || 0)) / 2;
    const net10 = avg(row.KOSPI_priceNetUpRatio_10ma, row.KOSDAQ_priceNetUpRatio_10ma);
    const above10 = avg(row.KOSPI_aboveSignalRatio_10ma, row.KOSDAQ_aboveSignalRatio_10ma);
    const below40 = avg(row.KOSPI_below40Ratio_10ma, row.KOSDAQ_below40Ratio_10ma);

    if(mode === 'breadthhalf')
        return net10 <= -10 ? 0.5 : 1;
    if(mode === 'breadthlight')
        return net10 <= -10 ? 0.8 : 1;
    if(mode === 'severehalf')
        return (net10 <= -15 || (above10 < 45 && below40 >= 25)) ? 0.5 : 1;
    if(mode === 'severelight')
        return (net10 <= -15 || (above10 < 45 && below40 >= 25)) ? 0.8 : 1;
    if(mode === 'adaptive')
    {
        if(net10 <= -20)
            return 0.4;
        if(net10 <= -10)
            return 0.7;
    }
    if(mode === 'adaptive2')
    {
        if(net10 <= -20)
            return 0.6;
        if(net10 <= -10)
            return 0.85;
    }
    if(mode === 'adaptive3')
    {
        if(net10 <= -15)
            return 0.75;
        if(net10 <= -5)
            return 0.9;
    }

    return 1;
}

const IsMarketStrengthNoRecycleBuyBlocked = (tradestock, chartindex) => {
    const mode = String(defulatConfig.usemarketstrengthbuyfilter || '').toLowerCase();
    if(!mode.startsWith('norecycle'))
        return false;

    const chartdata = tradestock.chartdatas[chartindex];
    if(!chartdata || !chartdata.date)
        return false;

    const row = GetMarketStrengthPrevRow(GetYMD(chartdata.date));
    if(!row)
        return false;

    const avg = (a, b) => (Number(a || 0) + Number(b || 0)) / 2;
    const net10 = avg(row.KOSPI_priceNetUpRatio_10ma, row.KOSDAQ_priceNetUpRatio_10ma);
    const above10 = avg(row.KOSPI_aboveSignalRatio_10ma, row.KOSDAQ_aboveSignalRatio_10ma);
    const below40 = avg(row.KOSPI_below40Ratio_10ma, row.KOSDAQ_below40Ratio_10ma);

    if(mode === 'norecycleweak')
        return net10 <= -10;
    if(mode === 'norecyclesevere')
        return net10 <= -15 || (above10 < 45 && below40 >= 25);
    if(mode === 'norecycleadaptive')
        return net10 <= -20 || (net10 <= -10 && above10 < 50);

    return false;
}

const GetMarketStrengthExposureLimit = (tradestock, chartindex) => {
    const mode = String(defulatConfig.usemarketstrengthexposurelimit || '').toLowerCase();
    if(!mode)
        return 1;

    const chartdata = tradestock.chartdatas[chartindex];
    if(!chartdata || !chartdata.date)
        return 1;

    const ymd = GetYMD(chartdata.date);
    const { row, beforeRow } = GetMarketStrengthPrevRows(ymd);
    const metrics = GetMarketStrengthMetrics(row);
    if(!metrics)
        return 1;

    const { net10, above10, below40 } = metrics;

    if(mode === 'light')
    {
        if(net10 <= -20)
            return 0.75;
        if(net10 <= -10 && above10 < 50)
            return 0.85;
        return 1;
    }

    if(mode === 'balanced')
    {
        if(net10 <= -20)
            return 0.60;
        if(net10 <= -10 && above10 < 50)
            return 0.75;
        return 1;
    }

    if(mode === 'conservative')
    {
        if(net10 <= -20)
            return 0.45;
        if(net10 <= -10 && above10 < 50)
            return 0.65;
        return 1;
    }

    if(mode === 'streak')
    {
        const weak = net10 <= -10 && above10 < 50;
        const severeWeak = net10 <= -20 || (above10 < 45 && below40 >= 25);
        const stateKey = `${mode}`;
        const state = marketStrengthExposureStateByMode[stateKey] || { ymd: null, weakStreak: 0, severeWeakStreak: 0 };

        if(state.ymd !== ymd)
        {
            state.ymd = ymd;
            state.weakStreak = weak ? state.weakStreak + 1 : 0;
            state.severeWeakStreak = severeWeak ? state.severeWeakStreak + 1 : 0;
            marketStrengthExposureStateByMode[stateKey] = state;
        }

        if(state.severeWeakStreak >= 10)
            return 0.25;
        if(state.severeWeakStreak >= 5)
            return 0.40;
        if(state.weakStreak >= 20)
            return 0.35;
        if(state.weakStreak >= 10)
            return 0.50;
        if(state.weakStreak >= 5)
            return 0.65;
        if(state.weakStreak >= 2)
            return 0.80;
        return 1;
    }

    if(mode === 'adaptive_stabilize')
    {
        const beforeMetrics = GetMarketStrengthMetrics(beforeRow);
        const weak = net10 <= -10 && above10 < 50;
        const severeWeak = net10 <= -20 || (above10 < 45 && below40 >= 25);
        const recover = net10 > 0 || above10 >= 55;
        const notGettingWorse = beforeMetrics
            ? net10 >= beforeMetrics.net10 - 2 && above10 >= beforeMetrics.above10 - 2 && below40 <= beforeMetrics.below40 + 2
            : false;
        const stateKey = `${mode}`;
        const state = marketStrengthExposureStateByMode[stateKey] || { ymd: null, exposure: 1 };

        if(state.ymd !== ymd)
        {
            state.ymd = ymd;
            if(recover)
                state.exposure += 0.15;
            else if(severeWeak && !notGettingWorse)
                state.exposure -= 0.10;
            else if(weak && !notGettingWorse)
                state.exposure -= 0.05;
            else if(weak && notGettingWorse)
                state.exposure += 0.05;

            state.exposure = Math.max(0.25, Math.min(1, state.exposure));
            marketStrengthExposureStateByMode[stateKey] = state;
        }

        return state.exposure;
    }

    return 1;
}

const IsProfitGivebackShort = (tradestock, account) => {
    const profitGivebackPreset = GetProfitGivebackPreset(defulatConfig.useprofitgivebacksell);
    if (!profitGivebackPreset) return false;

    // ?쀬튂湲? ?ш쾶 媛?醫낅ぉ??留롮씠 ?좏븯??耳?댁뒪 諛⑹뼱
    const {
        ACTIVE_PROFIT_RATE,
        MIN_GIVEBACK_RATE,
        GIVEBACK_RATIO,
        MIN_HOLD_DAYS,
        MIN_HIGH_AGO,
    } = profitGivebackPreset;

    const actdate = GetLastDateTime(account, tradestock.ticker);
    if (!actdate) return false;

    const boughtprice = GetAveragePrice(account, tradestock.ticker);
    if (!boughtprice) return false;

    const holdDays = GetPassedDayFromBought(tradestock.chartdatas, tradestock.curchartdataidx, actdate);
    if (holdDays < MIN_HOLD_DAYS) return false;

    const maxHighInfo = GetMaxHighProfitRateFromBoughtInfo(tradestock, account, tradestock.ticker);
    if (!maxHighInfo) return false;

    const maxHighProfitRate = maxHighInfo.maxHighProfitRate;
    const maxHighAgo = maxHighInfo.maxHighAgo;

    if (maxHighProfitRate < ACTIVE_PROFIT_RATE) return false;
    if (maxHighAgo < MIN_HIGH_AGO) return false;

    const currentPrice = tradestock.latestclose;
    const currentProfitRate = (currentPrice / boughtprice - 1) * 100;
    const givebackRate = maxHighProfitRate - currentProfitRate;
    const givebackLimit = Math.max(MIN_GIVEBACK_RATE, maxHighProfitRate * GIVEBACK_RATIO);

    if (givebackRate >= givebackLimit) {
        return true;
    }

    return false;
};

// 諛묒튂湲?
const IsProfitToLossShort = (tradestock, account) => {
    const profitToLossPreset = GetProfitToLossPreset(defulatConfig.useprofittolosssell);
    if (!profitToLossPreset) return false;

    const {
        ACTIVE_PROFIT_RATE,
        EXIT_PROFIT_RATE,
        MIN_HOLD_DAYS,
        MIN_HIGH_AGO,
    } = profitToLossPreset;

    // const ACTIVE_PROFIT_RATE = 2;
    // const EXIT_PROFIT_RATE = -1;
    // const MIN_HOLD_DAYS = 1;
    // const MIN_HIGH_AGO = 1;

    const actdate = GetLastDateTime(account, tradestock.ticker);
    if (!actdate) return false;

    const boughtprice = GetAveragePrice(account, tradestock.ticker);
    if (!boughtprice) return false;

    const holdDays = GetPassedDayFromBought(tradestock.chartdatas, tradestock.curchartdataidx, actdate);
    if (holdDays < MIN_HOLD_DAYS) return false;

    const maxHighInfo = GetMaxHighProfitRateFromBoughtInfo(tradestock, account, tradestock.ticker);
    if (!maxHighInfo) return false;

    const maxHighProfitRate = maxHighInfo.maxHighProfitRate;
    const maxHighAgo = maxHighInfo.maxHighAgo;

    if (maxHighProfitRate < ACTIVE_PROFIT_RATE) return false;
    if (maxHighAgo < MIN_HIGH_AGO) return false;

    const currentPrice = tradestock.latestclose;
    const currentProfitRate = (currentPrice / boughtprice - 1) * 100;

    if (currentProfitRate <= EXIT_PROFIT_RATE) {
        return true;
    }

    return false;
};

const XX=(tradestock, account)=>{
    if (!defulatConfig.XX)
        return false;
    const actdate = GetLastDateTime(account, tradestock.ticker);
    const highclose = GetHighcloseFromBoughtDay(tradestock.chartdatas, tradestock.curchartdataidx, actdate);
    const boughtprice = GetAveragePrice(account, tradestock.ticker);
    const maxProfitRate = (highclose / boughtprice - 1) *  100;
    const currentProfitRate =  (tradestock.latestclose / boughtprice - 1) *  100;
     
    if (
        maxProfitRate >= 6 &&
        currentProfitRate <= maxProfitRate - 4
    ) {
        // ?꾨웾留ㅻ룄
        return true;
    }
    return false;
}

const GetRecyclingStock =(account, tradestockdic, totalcapital, maxonebuycapital, tickerbyReason, issimulation)=>
{ 
    if(!defulatConfig.useRecyc)
        return null;
    let bigestwallet;
    
    if(globalval.excelvalues && defulatConfig.usepersonstocktrade || defulatConfig.usebreakouttrade)
    {
        percentByoneBuy = globalval.excelvalues.DIVCOUNT;
    }

    const accountEntries = defulatConfig.autosimulation && globalval.accounttickerlist
    ? globalval.accounttickerlist.map(ticker => [ticker, account[ticker]]).filter(e => e[1])
    : Object.entries(account);

    accountEntries.forEach(walletelement=>{
        walletelement[1].blackrate = 0;
        walletelement[1].onedayblackrate = 0;
        walletelement[1].Recymacdlongshort = '';
    })

    const IsShortRecYesterday=(onedayblackrate, chartdatas, chartdatasidx)=>{
        return (defulatConfig.shortRecYesterday && (onedayblackrate < divsellpercent) && IsAlmostOpenTimePure(chartdatas, chartdatasidx));
    }

    const IsShortRecHighPriceDrop=(walletstock, chartindex, actdate, lastclose, blackrate)=>{
        if(!defulatConfig.shortRecHighpricedrop)
            return false;

        let validblackrate = defulatConfig.highdropblackrate ? blackrate > defulatConfig.highdropblackrate : true;
        if(!validblackrate)
            return false;

        const hiclosefromboughtday = GetHighcloseFromBoughtDay(walletstock.chartdatas, chartindex, actdate);
        return (lastclose < hiclosefromboughtday * ((100-defulatConfig.highdroprate)*0.01));
    }

    const IsShortRecWrongBought=(chartdatas, chartdatasidx, walletstock, passedday)=>{
        if(!defulatConfig.shortRecWrongBought && !defulatConfig.shortRecWrongBoughtrecyselloverday)
            return false;

        const ticker = walletstock.ticker;
        
        if(IsBuyDayIsToday(account, ticker, chartdatas, chartdatasidx))
            return false;

        const ismacdunderrsishortdown = IsMacdUnderRsiShortDown(chartdatas, chartdatasidx);
        
        if(!defulatConfig.shortRecWrongBoughtrecyselloverday)
            return ismacdunderrsishortdown;

        // down ?곹깭 + 湲곌컙 ?쇰줈 ?먮ℓ?섎뒗寃쎌슦 
        return ismacdunderrsishortdown && passedday >= defulatConfig.shortRecWrongBoughtrecyselloverday;
    }

    const IsShortRecIndex=(onedayblackrate, walletstock)=>{
        if(!defulatConfig.shortRecIndex)
            return false;
        // const chartdatas = walletstock.chartdatas;
        // const curchartdataidx = walletstock.curchartdataidx;
        // walletstock.
        // chartdatas[chartdatasidx]
        // ;
        const GetIndexOnedayblackrate=(indexnum)=>{
            const indexwallet = tradestockdic[GetIndexTicker(indexnum)];
            const indexlastcolose = indexwallet.latestclose;
            const before1element = indexwallet.chartdatas[walletstock.curchartdataidx-1];
            indexwallet.blackrate = ((before1element.close / indexlastcolose) - 1 * 100);
            return indexwallet.blackrate;
        }

        const index0blackrate = GetIndexOnedayblackrate(0);
        const index1blackrate = GetIndexOnedayblackrate(1);

        return ((onedayblackrate < index0blackrate) && (onedayblackrate < index1blackrate));
    }

    //case1 ?쒖씪 ?μ궗媛 ???섎뒗 醫낅ぉ???먮떎
    let filteredwallets = [];
    
    if(defulatConfig.usepersonstocktrade)
    {
        filteredwallets = accountEntries.filter(walletelement=>{
            const ticker = walletelement[0];
            
            const walletstock = tradestockdic[ticker];
            const fullamount = GetStockAmount(account, ticker);//walletelement[1].amount;
            const lastclose = walletstock ? walletstock.latestclose : 0;

            if(ticker === 'a0' || !walletstock || fullamount === 0)
                return false;
            if(!walletstock.curchartdataidx)
                return false;
            const personstockinfo = globalval.personstocklist[ticker];      
            
            if(!personstockinfo || !personstockinfo.buylv)
                return false;
            walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(J)';
            walletelement[1].latestclose = lastclose;
            return true;
        });

        if(filteredwallets && filteredwallets.length > 0)
        {        
            // account?먮룄 filtered???덈뒗 fullasset???덈뒗吏 ?뺤씤
            let sortedwallets = clone(filteredwallets);//_.cloneDeep(filteredwallets);
            
            if(sortedwallets.length)
            {
                let filtereddata = sortedwallets;//sortedwallets.filter(element=>element[1].Recymacdlongshort == 'SHORTRecyclingFor(B)');
                if(filtereddata && filtereddata.length > 0)
                {
                    sortedwallets.sort(function(a,b){
                        return a[1].buylv-b[1].buylv;
                    })

                    // console.log(`${sortedwallets[0][1].Recymacdlongshort} ${sortedwallets[0][1].blackrate.toFixed(2)} ${sortedwallets[0][1].onedayblackrate.toFixed(2)}`);
                }
                
            }
            bigestwallet = sortedwallets.length > 0 ? sortedwallets[0] :  null;
            // console.log(`recstock f:${filteredwallets}, s:${sortedwallets} ${bigestwallet}`)
        }
    }
    else
    {
        filteredwallets = accountEntries.filter(walletelement=>{
            
            const ticker = walletelement[0];
            const walletstock = tradestockdic[ticker];
            const fullamount = walletelement[1].amount;

            if(ticker === 'a0' || !walletstock || fullamount === 0)
                return false;
            if(!walletstock.curchartdataidx)
                return false;
            const chartindex = walletstock.curchartdataidx;//issimulation ? walletstock.curchartdataidx : walletstock.chartdatas.length-1;
            const lastclose = walletstock ? walletstock.latestclose : 0;
            const fullasset = fullamount > 0 ? lastclose * fullamount : 0;
            const actdate = GetLastDateTime(account, ticker);

            // let halfamount = Math.max(1, Math.floor(fullamount / 2))
            // const halfasset = GetSellMoney(lastclose)*halfamount;
            const canrecycling = walletstock && !walletstock.chartdatas[chartindex].macdlongshort.includes("RSIREFUND") && !walletstock.chartdatas[chartindex].macdlongshort.includes("Recycling");

            // if(fullasset>0)
            // console.log(`walletstock T:${fullasset} ${halfasset}`)
            const before1element = walletstock.chartdatas[walletstock.curchartdataidx-1];
            
            
            walletelement[1].latestclose = lastclose;
            walletelement[1].blackrate = walletelement[1].averagebuyprice > 0 && lastclose > 0 ? ((lastclose / walletelement[1].averagebuyprice)-1) * 100 : 10000; // ?됰떒媛媛 ?꾩옱媛寃⑸낫????? 寃쎌슦?먮쭔 ?먰빐?④린濡??꾨땶寃쎌슦 ?곌컪?쇰줈 媛뺤젣?뗮똿
            walletelement[1].onedayblackrate = before1element && before1element.close > 0 && lastclose > 0 ? ((lastclose / before1element.close)-1) * 100 : 10000;
            walletelement[1].passedday = GetPassedDayFromBought(walletstock.chartdatas, walletstock.curchartdataidx, actdate);
            if(walletelement[1].blackrate < divsellpercent)
            {
                if((fullasset > totalcapital * ((1/percentByoneBuy)*divminpercent)))
                    walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(B)';
                else if(defulatConfig.usedoublehalfallsell)
                {
                    walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(F)';
                }
            }
            else if(IsShortRecYesterday(walletelement[1].onedayblackrate, walletstock.chartdatas, walletstock.curchartdataidx))
                walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(Y)';
            else if(IsShortRecIndex(walletelement[1].onedayblackrate, walletstock))
                walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(I)';
            else if(IsShortRecWrongBought(walletstock.chartdatas, walletstock.curchartdataidx, walletstock, walletelement[1].passedday))
                walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(W)';
            // else if(lastclose < hiclosefromboughtday * 0.97)
            else if(IsShortRecHighPriceDrop(walletstock, chartindex, actdate, lastclose, walletelement[1].blackrate))
                walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(H)';
            else
                walletelement[1].Recymacdlongshort = '';
        
            if(defulatConfig.recyselloverday && walletelement[1].passedday >= defulatConfig.recyselloverday)
                walletelement[1].Recymacdlongshort = 'SHORTRecyclingFor(D)';

            walletelement[1].sellToGooTimeRSI = walletstock && walletstock.chartdatas ? GetSellToGooTimeRSI(walletstock.chartdatas, walletstock.curchartdataidx) : 100;
            
            return (
            (walletelement[1].Recymacdlongshort != '')                     // ?먰빐蹂몄쥌紐⑹씤媛?
            && canrecycling                                                 // ?대? 履쇨컻吏吏?? ?섏궗吏吏?? ?섑뙏由ъ????딆? 二쇱떇?멸??
            && (tickerbyReason != ticker)                                   // 履쇨컻湲곗쓽 ?먯씤??二쇱떇? ?쒖쇅
            // && (fullasset > totalcapital * ((1/percentByoneBuy)*divminpercent))    // case1 1踰덉ぜ媛쒓린?덉슜 醫낅ぉ??珥?媛移섍? 泥섏쓬???≪닔???덈컲?댁긽. ( ?대? ?쒕쾲 履쇨컻吏꾧구 ?ㅼ떆 履쇨컻吏 ?딄린 ?꾪븿 ). 0.5媛?꾨땶 留덉씠?덉뒪媛먯븞?섏뿬 0.45濡쒗븳??
            && (defulatConfig.useRecycRSI ? (walletelement[1].sellToGooTimeRSI < 1) : true)
            )
        })

        if(filteredwallets && filteredwallets.length > 0)
        {        
            // account?먮룄 filtered???덈뒗 fullasset???덈뒗吏 ?뺤씤
            let sortedwallets = clone(filteredwallets);//_.cloneDeep(filteredwallets);
            let filtereddata;            
            if(sortedwallets.length)
            {

                if(defulatConfig.recyselloverday)
                {
                    filtereddata = sortedwallets.filter(element=>element[1].passedday >= defulatConfig.recyselloverday);
                    filtereddata.sort(function(a,b){
                        const dayDiff = b[1].passedday - a[1].passedday;
    
                        // 2. 留뚯빟 passedday媛 媛숇떎硫?dayDiff媛 0?대㈃) blackrate ?ㅻ쫫李⑥닚 (?묒? 寃껊???
                        return dayDiff || ((a[1].blackrate) - (b[1].blackrate));
                        // return b[1].passedday-a[1].passedday;
                        // const passedday = GetPassedDayFromBought(walletstock.chartdatas, walletstock.curchartdataidx);
                    })
                }
                else{
                        filtereddata = [];
                        const recchars = ['B', 'F', 'Y', 'W', 'H'];
                        let reccharidx = 0;
                        while(filtereddata.length <= 0)
                        {
                            filtereddata = sortedwallets.filter(element=>element[1].Recymacdlongshort == `SHORTRecyclingFor(${recchars[reccharidx]})`);
                            ++reccharidx;
                            if(filtereddata && filtereddata.length > 0)
                            {
                                filtereddata.sort(function(a,b){
                                    return a[1].blackrate-b[1].blackrate;
                                })

                                console.log(`${sortedwallets[0][1].Recymacdlongshort} ${sortedwallets[0][1].blackrate.toFixed(2)} ${sortedwallets[0][1].onedayblackrate.toFixed(2)}`); 
                                break;
                            }
                        }       
                    // }
                }
            }
            bigestwallet = filtereddata.length > 0 ? filtereddata[0] :  null;
            // console.log(`recstock f:${filteredwallets}, s:${sortedwallets} ${bigestwallet}`)
        }
    }
    
    

    if(!bigestwallet || bigestwallet.length < 2)
        return null;
    if(defulatConfig.useforcekorbuy){
        bigestwallet[1].Recymacdlongshort = `FORCE_${bigestwallet[1].Recymacdlongshort}`;
    }
    return bigestwallet;
}

const GetStockAmount =(account, ticker)=>
{     
    const stockaccount = account[ticker];
    if(stockaccount === undefined)
        return 0;
    
    return stockaccount.amount + stockaccount.falseamount;
}

const GetAveragePrice = (account, ticker)=>
{
    const stock = account[ticker];
    if(stock === undefined)
        return 0;

    return stock.averagebuyprice;
}

const GetLastTradeDate = (account, ticker)=>
{
    const stock = account[ticker];
    if(stock === undefined)
        return 0;

    return stock.datetime;
}

const GetStockCapitalValue = (account, ticker)=>
{
    return GetStockAmount(account, ticker) * GetAveragePrice(account, ticker);
}

        
const EnoughStock = (account, ticker, canbuycapital) => {
    return GetStockAmount(account, ticker) > 0;

    // if(GetStockCapitalValue(account, ticker) > canbuycapital)
}

const GetCashAmount =(account)=>
{ 
    const cashaccount = account["a0"];
    if(cashaccount === undefined)
        return 0;

    let falseamount = cashaccount.falseamount;
    return cashaccount.amount + falseamount;
}

const GetInjurance =(account)=>
{ 
    const cashaccount = account["a0"];
    if(cashaccount === undefined)
        return 0;
    return cashaccount.induranceamount;
}

// ?섏씡湲덉쓽 ?쇰?瑜?蹂댄뿕湲덉쑝濡?蹂닿??쒕떎
const SetInjurance =(account, todayearnamount)=>
{ 
    if(!todayearnamount || todayearnamount<=0 || !defulatConfig.injurance)
        return;

    const cashaccount = account["a0"];
    if(cashaccount === undefined)
        return 0;

    if(cashaccount.amount <= 0)
        return;
    // let falseamount = cashaccount.falseamount;

    const injuranceamount = Math.min(todayearnamount * (defulatConfig.injurance/100), cashaccount.amount);
    if(!cashaccount.induranceamount)
        cashaccount.induranceamount = 0;
    cashaccount.amount -= injuranceamount;
    cashaccount.induranceamount += injuranceamount;

    console.log(`?섏씡湲?${todayearnamount} 蹂댄뿕湲?${injuranceamount} ?꾩쟻蹂댄뿕湲?${cashaccount.induranceamount}`);
}
 
const GetCanUseCashAmount =(account)=>
{ 
    const cashaccount = account["a0"];
    if(cashaccount === undefined)
        return 0;

    let falseamount = cashaccount.falseamountBuy;
    const rawcashamount = cashaccount.amount + falseamount;
    const lockamount = GetEarlyProfitLockCashAmount(cashaccount);
    return rawcashamount - Math.min(rawcashamount, lockamount);
}

const InitAssetBuyGateCashForDay = (account, chartdata) => assetBuyGate.initCashForDay(account, chartdata, GetCanUseCashAmount);
const GetAssetBuyGateOldCashRemaining = () => assetBuyGate.getOldCashRemaining();
const RegisterAssetBuyGateSellCash = (addmoney) => assetBuyGate.registerSellCash(addmoney);
const RegisterAssetBuyGateBuyCash = (buymoney) => assetBuyGate.registerBuyCash(buymoney);
const IsAssetBuyGateConditionOkForTotal = (totalcapital) => assetBuyGate.isConditionOkForTotal(totalcapital);
const GetAssetBuyGateCarryLockedCash = () => assetBuyGate.getCarryLockedCash();
const ShouldSkipJiJiBuJinShortByAssetSellCashGate = (account, tradestockdic) => assetBuyGate.shouldSkipJiJiBuJinShort(account, tradestockdic, GetAllStockCapitalValue, GetCanUseCashAmount);

const GetIndexMoveState = (tradestockdic, marketidx) => {
    const indexstock = tradestockdic[GetIndexTicker(marketidx)];
    if(!indexstock || !indexstock.chartdatas || indexstock.curchartdataidx == null)
        return null;

    const idx = indexstock.curchartdataidx;
    const today = indexstock.chartdatas[idx];
    const yesterday = indexstock.chartdatas[idx - 1];
    const latestclose = Number(indexstock.latestclose);
    if(!today || !yesterday || idx < 2 || !Number.isFinite(latestclose))
        return null;

    const threshold = Number(defulatConfig.crashrebounddownthreshold || -10);
    let baseIdx = idx - 1;
    while(baseIdx > 0)
    {
        const current = Number(indexstock.chartdatas[baseIdx].close);
        const previous = Number(indexstock.chartdatas[baseIdx - 1].close);
        if(!Number.isFinite(current) || !Number.isFinite(previous) || current >= previous)
            break;
        --baseIdx;
    }

    const baseClose = Number(indexstock.chartdatas[baseIdx].close);
    const yesterdayClose = Number(yesterday.close);
    const downDays = (idx - 1) - baseIdx;
    const downRate = baseClose > 0 ? ((yesterdayClose / baseClose) - 1) * 100 : 0;
    const yesterdayDown = downDays > 0 && downRate <= threshold;
    const todayUp = latestclose >= Number(yesterday.close);
    return {
        ticker:indexstock.ticker,
        yesterdayDown,
        todayUp,
        downRate,
        downDays,
        latestclose,
        yesterdayClose:Number(yesterday.close),
        beforeYesterdayClose:baseClose,
    };
}

const ShouldHoldCrashReboundSell = (account, tradestockdic, tradestock, ticker, latestclose, totalcapital, assetBuyGateHasHistory, assetBuyGateYesterdayUp, assetBuyGateTodayUp, reason) => {
    if(!defulatConfig.usecrashreboundsellhold)
        return false;
    const mode = String(defulatConfig.crashreboundsellholdmode || '').toLowerCase();
    if(!mode)
        return false;
    if(mode !== 'asset' && mode !== 'assetindex')
        return false;
    const assetCrashDownEnough = !!globalval.assetCrashReboundYesterdayDownEnough;
    if(!assetBuyGateHasHistory || !assetCrashDownEnough || !assetBuyGateTodayUp)
        return false;
    if(!tradestock || !tradestock.chartdatas || tradestock.curchartdataidx == null || tradestock.curchartdataidx < 1)
        return false;

    const actdate = GetLastDateTime(account, ticker);
    if(!actdate)
        return false;

    const passedday = GetPassedDayFromBought(tradestock.chartdatas, tradestock.curchartdataidx, actdate);
    if(passedday !== 1)
        return false;

    const yesterday = tradestock.chartdatas[tradestock.curchartdataidx - 1];
    const prevclose = Number(yesterday && yesterday.close);
    const current = Number(latestclose);
    if(!Number.isFinite(prevclose) || !Number.isFinite(current) || prevclose <= 0)
        return false;

    if(current < prevclose)
        return false;

    let indexText = '';
    if(mode === 'assetindex')
    {
        const index0 = GetIndexMoveState(tradestockdic, 0);
        const index1 = GetIndexMoveState(tradestockdic, 1);
        if(!index0 || !index1 || !index0.yesterdayDown || !index1.yesterdayDown || !index0.todayUp || !index1.todayUp)
            return false;
        indexText = ` I0:${index0.beforeYesterdayClose}->${index0.yesterdayClose}->${index0.latestclose}(${index0.downRate.toFixed(2)}%/${index0.downDays}d) I1:${index1.beforeYesterdayClose}->${index1.yesterdayClose}->${index1.latestclose}(${index1.downRate.toFixed(2)}%/${index1.downDays}d)`;
    }

    if(useconsolelog)
    {
        const timeString = GetLogDate(tradestock.chartdatas[tradestock.curchartdataidx]);
        const yChange = Number.isFinite(globalval.assetBuyGateYesterdayChangePer) ? GetChangePerLog(globalval.assetBuyGateYesterdayChangePer) : '-';
        const crashRate = Number(globalval.assetCrashReboundYesterdayDownRate || 0);
        AddSimulationLog(`[CRASH_REBOUND_SELL_HOLD] ${timeString} ${reason} mode:${mode} ${ticker} ${tradestock.name || ''} buy:${actdate} passed:${passedday} Y:CRASHDN(${globalval.assetBuyGateYesterdayDate || '-'}/${crashRate.toFixed(2)}%/${globalval.assetCrashReboundYesterdayDownDays || 0}d daily:${yChange}) T:KEEP start:${Math.round(globalval.assetBuyGateTodayStartCapital || 0)} cur:${Math.round(totalcapital || 0)} prevclose:${prevclose} current:${current}${indexText}`);
    }
    return true;
}

const GetEarlyProfitLockCashAmount = (cashaccount) => {
    if(!cashaccount || !cashaccount.earlyprofitlockcashamount)
        return 0;

    const currentymd = cashaccount.earlyprofitlockcurrentymd;
    if(currentymd && cashaccount.earlyprofitlocklastymd && currentymd !== cashaccount.earlyprofitlocklastymd)
    {
        cashaccount.earlyprofitlockdaysleft = Math.max(0, (cashaccount.earlyprofitlockdaysleft || 0) - 1);
        cashaccount.earlyprofitlocklastymd = currentymd;
        if(cashaccount.earlyprofitlockdaysleft <= 0)
        {
            cashaccount.earlyprofitlockcashamount = 0;
            return 0;
        }
    }

    if((cashaccount.earlyprofitlockdaysleft || 0) <= 0)
    {
        cashaccount.earlyprofitlockcashamount = 0;
        return 0;
    }

    return Math.max(0, cashaccount.earlyprofitlockcashamount || 0);
}

const AddEarlyProfitLockCash = (account, tradestockdic, ticker, addmoney, macdlongshort) => {
    if(!defulatConfig.useearlyprofitlockcash)
        return;
    if(!macdlongshort || !macdlongshort.includes('EARLY_PROFIT_LOCK_SHORT'))
        return;
    if(!addmoney || addmoney <= 0 || !account || !account['a0'])
        return;

    const cashaccount = account['a0'];
    const tradestock = tradestockdic ? tradestockdic[ticker] : null;
    const chartdata = tradestock && tradestock.chartdatas ? tradestock.chartdatas[tradestock.curchartdataidx] : null;
    const currentymd = chartdata && chartdata.date ? GetYMD(chartdata.date) : cashaccount.earlyprofitlockcurrentymd;
    if(currentymd)
    {
        cashaccount.earlyprofitlockcurrentymd = currentymd;
        cashaccount.earlyprofitlocklastymd = currentymd;
    }

    let lockdays = 0;
    const lockmode = String(defulatConfig.useearlyprofitlockcash).toLowerCase();
    if(lockmode === 'sameday')
        lockdays = 1;
    else if(lockmode === 'oneday')
        lockdays = 2;
    else if(lockmode === 'weakmarket')
    {
        const currentcapital = GetAllStockCapitalValue(account, tradestockdic) + GetCashAmount(account);
        lockdays = currentcapital < globalval.earlyprofitlockbeforetotalcapital ? 2 : 1;
    }

    if(lockdays <= 0)
        return;

    cashaccount.earlyprofitlockcashamount = (cashaccount.earlyprofitlockcashamount || 0) + addmoney;
    cashaccount.earlyprofitlockdaysleft = Math.max(cashaccount.earlyprofitlockdaysleft || 0, lockdays);
}

const GetAllStockCapitalValue =(account, tradestockdic)=>
{ 
    if(defulatConfig.autosimulation && globalval.accounttickerlist)
    {
        return CaculateAllStockCapitalValueByTickers(account, tradestockdic, globalval.accounttickerlist);
    }

    return CaculateAllStockCapitalValue(account, tradestockdic);
}

const GetNormalCapitalClose=(value)=>{
    if(value == null || value === '')
        return null;

    const close = Number(value);
    return Number.isFinite(close) && close > 0 ? close : null;
}

const GetFirstNormalCapitalMinuteClose=(tradestock)=>{
    if(!tradestock || !tradestock.minchartdatas)
        return null;

    for(let i = 0; i < tradestock.minchartdatas.length; ++i)
    {
        const minuteData = tradestock.minchartdatas[i];
        const close = tradestock.simMinuteCompact ? GetNormalCapitalClose(minuteData) : GetNormalCapitalClose(minuteData && minuteData.close);
        if(close != null)
            return close;
    }

    return null;
}

const GetCapitalLatestClose=(tradestock, ticker)=>{
    const latestclose = GetNormalCapitalClose(tradestock.latestclose);
    if(latestclose != null)
        return latestclose;

    if(!defulatConfig.useerrorminuteclosefilter)
        return tradestock.latestclose;

    const fallbackClose = GetFirstNormalCapitalMinuteClose(tradestock);
    if(fallbackClose == null)
        return tradestock.latestclose;

    const chartdata = tradestock.chartdatas ? tradestock.chartdatas[tradestock.curchartdataidx] : null;
    const ymd = chartdata && chartdata.date ? GetYMD(chartdata.date) : '';
    const logKey = `${ymd}${ticker}${fallbackClose}`;
    if(tradestock._lastCapitalErrorMinuteCloseLogKey !== logKey)
    {
        tradestock._lastCapitalErrorMinuteCloseLogKey = logKey;
        AddSimulationLog(`[ERROR_MINUTE_CLOSE] ${ymd} ${ticker} ?ㅻ쪟遺꾨큺?쇰줈?명븳 ?댁쟾媛?泥섎━ ${tradestock.latestclose}=>${fallbackClose} capital`);
    }

    tradestock.latestclose = fallbackClose;
    return fallbackClose;
}


const CaculateAllStockCapitalValueByTickers = (account, tradestockdic, tickers)=>
{
    let sum = 0;

    tickers.forEach(ticker=>{
        if(ticker !== "a0")
        {
            const accountdata = account[ticker];
            const tradestock = tradestockdic[ticker];

            if(accountdata && tradestock)
            {
                const latestclose = GetCapitalLatestClose(tradestock, ticker);
                sum += (latestclose * accountdata.amount);
                sum += accountdata.falseamount * accountdata.falseaveragebuyprice;

                if(isNaN(sum))
                {
                    console.log('CaculateAllStockCapitalValue isNaN:', tradestock.latestclose, JSON.stringify(accountdata))
                    if(!accountdata.falseamount)
                        accountdata.falseamount = 0;
                    if(!accountdata.falseaveragebuyprice)
                        accountdata.falseaveragebuyprice = 0;
                }
            }
        }
    })

    return sum;
}


const CaculateAllStockCapitalValue = (account, tradestockdic)=>
{ 
    let sum = 0;
    Object.entries(account).forEach(element=>{
        if(element[0] !== "a0")
        {
            let tradestock = tradestockdic[element[0]]
            if(tradestock)
            {
                const latestclose = GetCapitalLatestClose(tradestock, element[0]);
                sum += (latestclose * element[1].amount);
                sum += element[1].falseamount * element[1].falseaveragebuyprice;

                if(isNaN(sum))
                {
                    console.log('CaculateAllStockCapitalValue isNaN:', tradestock.latestclose, JSON.stringify(element[1]))
                    if(!element[1].falseamount)
                        element[1].falseamount = 0;
                    if(!element[1].falseaveragebuyprice)
                        element[1].falseaveragebuyprice = 0;
                }
            }          
        }
    })
    
    if(defulatConfig.autosimulation)
    {
        globalval.accounttickerlist = Object.entries(account).reduce((accum, element)=>{
            if(element[0] !== "a0" && (((element[1].amount || 0) > 0) || ((element[1].falseamount || 0) > 0)))
                accum.push(element[0]);
            return accum;
        }, []);
    }

    return sum;
}   

const GetBlackSellStock =(account, tradestocklist, minblackrate)=>
{ 
    let tradestocks = [];

    Object.entries(account).forEach(element=>{
        if(element[0] !== "a0")
        {
            const walletticker = `a${element[1].ticker}`;
            const tradestock = tradestocklist.find((element)=> element.ticker === walletticker)

            if(tradestock)
            {
                const lastchartdata = tradestock.chartdatas[tradestock.chartdatas.length-1];
                const avrPrice = element[1].averagebuyprice;
                const close = lastchartdata.close;
                const blackrate = close/avrPrice;
                const longshort = lastchartdata.macdlongshort;

                if(longshort === '')
                    return null;

                if(blackrate > 1+(minblackrate/100) && longshort === 'NONE')
                {
                    tradestocks[tradestock.ticker] = {
                        ticker:tradestock.ticker,
                        name:tradestock.name,
                        close:close,
                        amount:element[1].amount,
                        blackrate:blackrate,
                    }
                }
            }
        }
    })     

    if(Object.entries(tradestocks).length === 0)
        return null;
    
    tradestocks = Object.entries(tradestocks).sort(function(a,b){
        return a[1].blackrate-b[1].blackrate;
    })

    return Object.entries( tradestocks)[0][1][1];
}

// const IsNaq=(db_id)=>{
//     return db_id.includes('naq');
// }


const DeleteTestUpdateDic=(tradestockdic)=>{
    // recticker = 'AMD'
    // chartindex = tradestockdic[recticker].chartdatas.length-1;
    // tradestockdic[recticker].chartdatas[chartindex].macdlongshort = 'test';
    // tradestockdic[recticker].chartdatas[chartindex].macdlongshort = macdlongshort;
  }
  /////////////////////////////////
   
// const GetNextMinuteClose=(tradestock, chartidx)=>{
//     const nextchartidx = chartidx + 1;
//     const nextchart = tradestock.minchartdatas[nextchartidx];
//     if(nextchart)
//         return nextchart.close;
//     return tradestock.latestclose;
// }

const IsSimilarWithfirstbuytriedclose=(curclose, tradestock)=>{
    if(!defulatConfig.usefirstbuytriedclose)
        return true;
    if(defulatConfig.usepersonstocklist)
        return true;
    const downsimilarper = -1;   // ?꾨옒濡?-1?꾨줈 源뚯?留??덉슜
    const upsimilarper = 1;     // ?꾨줈 1?꾨줈 源뚯?留??덉슜
    
    const limitdownprice = 1 + downsimilarper*0.01;
    const limitupprice = 1 + upsimilarper*0.01;
  
    if(!tradestock.firstbuytriedclose)
        return true;

    return(
       (curclose > tradestock.firstbuytriedclose * limitdownprice) 
    && (curclose < tradestock.firstbuytriedclose * limitupprice));
}

const IsSimilarWithfirstgetprice=(curclose, tradestock)=>{
    if(!globalval.excelvalues.BUYPRICERATE)
        return true;

    const buypricerate = globalval.excelvalues.BUYPRICERATE;

    return (!tradestock.blackratefromfirstgetprice) || (Math.abs(tradestock.blackratefromfirstgetprice)<=buypricerate);
}

let testjumsangcount = {}
// ?먯긽?쒖쇅
const IsJumSang=(tradestock, curChartIdx, account)=>{
    // ?먯긽?덉궗湲??뷀뙆???놁쑝硫?寃???⑥뒪
    if(!defulatConfig.nobuyjumsang)
        return false;
    // ?쇱씠釉뚮뒗 寃???⑥뒪
    if(!defulatConfig.autosimulation)
        return false;

    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[curChartIdx];
    const beforeelement = chartdatas[curChartIdx-1];    
    if(!curelement || !beforeelement)
        return false;
   
    const chartindex = tradestock.curchartdataidx;
    // 姨쒖긽
    if(IsRecheadUpLimit(beforeelement.close, curelement.close) &&
    (tradestock.orignclose == tradestock.orignopen) &&
    (tradestock.orignlow == tradestock.orignhigh) && 
    (tradestock.orignclose == tradestock.orignhigh)
    )
    {
        const timeString = GetYMD(GetLogDate(tradestock.chartdatas[chartindex]));
        const key = `${tradestock.ticker}${timeString}`;
        if(!testjumsangcount[key])
        {
            testjumsangcount[key] = true;
            const jumsanglen =  Object.entries(testjumsangcount).length;
            AddSimulationLog(`JUMSANG (${jumsanglen}) ${timeString} ${tradestock.name}(${tradestock.ticker})`);
        }
        return true;
    }
    
    return false;
    // return (!tradestock.blackratefromfirstgetprice) || (Math.abs(tradestock.blackratefromfirstgetprice)<=buypricerate);
}

const IsEnoughBreakoutUpLimit=(tradestock, curChartIdx, account)=>{
    if(!globalval.excelvalues.UPLIMIT)
        return 'NORMAL';

    let chartdatas = tradestock.chartdatas;
    const curelement = chartdatas[curChartIdx];
    const beforeelement = chartdatas[curChartIdx-1];    
    if(!curelement || !beforeelement)
        return false;

    
    const endidx = chartdatas.length-(curChartIdx+1);
    const movavg120 = curelement.sma120;//CalculateEMA(GetCloses(Getslices(chartdatas, 120, endidx)), 120);
    const movavg60 = curelement.sma60;//CalculateEMA(GetCloses(Getslices(chartdatas, 60, endidx)), 60);
    
    const yesterdaymovavg60 = beforeelement.sma60; //CalculateEMA(GetCloses(Getslices(chartdatas, 60, endidx+1)), 60);
    const yesterdaymovavg20 = beforeelement.sma20;
    const movavg20 = curelement.sma20; //CalculateEMA(GetCloses(Getslices(chartdatas, 20, endidx)), 20);

    const ticker = tradestock.ticker;
    const close = curelement.close;
    const yesterdayclose = beforeelement.close;
    const volumecount = curelement.volume ? curelement.volume/close : 0;
    const name = tradestock.name;
    // const high = result[lastidx].high;
    // const yesterdayhigh = result[lastidx-1].high;
    // const volumemoney = result[lastidx].value;
    const validclosesma = defulatConfig.usebavolumesma20 ? (close>=movavg20 && yesterdayclose<yesterdaymovavg20) : (close>=movavg60 && yesterdayclose<yesterdaymovavg60);
    const bafreesmacondition = defulatConfig.usebafreesmacondition ? true : validclosesma
    && (movavg120>movavg60 && movavg60>movavg20);

    // ?곗긽?援щℓ?쒖쇅
    if(defulatConfig.usebanobuydoubleup)
    {
        const before2element = chartdatas[curChartIdx-2];  
        if(before2element && IsRecheadUpLimit(before2element.close, beforeelement.close))
            return false;
    }
    
    const canpush =(volumecount > 50000)// && volumecount < 999999999) 
    && curelement.close >= curelement.open
    && !IsETF(name)
    && !(IsPrimary(ticker))
    && (close>1000 && close<2000000) // ok
    && bafreesmacondition;

    if(!canpush)
        return false;


    // 嫄곕옒???レ뿀?쇰㈃ 洹몃깷 ?곕떎. ?대? ?ш린源뚯??④굔 ?κ린??3媛??꾩쟾??같 + 媛寃⑹씠 60???レ쓬
    if(defulatConfig.uplimitearlyvolume)
    {
        if(!IsAlmostOpenTimePure(chartdatas, curChartIdx))
            return false;
        if(!volumefilter(tradestock, 20, defulatConfig.uplimitearlyvolume, defulatConfig.usetimedetail))
            return false;
        if(defulatConfig.reachedlimit && !IsRecheadLimit(yesterdayclose, close))
            return false;
        return 'UPVOLUME';
    }

    const todayuplimit = (Hasuplimit(GetCloses(Getslices(chartdatas, defulatConfig.limitfilter, endidx))));
    if(todayuplimit)
        return 'UPLIMIT';

    return false;
}

const GetSellStocks =(account, tradestockdic, buybottomstock)=>
{ 
    let sellist = [];
    Object.entries(account).forEach(element=>{
        if(element[0] !== "a0")
        {
            const ticker = element[0];
            const accstk = element[1];
             
            let tradestock = tradestockdic[ticker];

            const isdrawdown = tradestock 
            && (tradestock.blackratefromfirstgetprice < buybottomstock.blackratefromfirstgetprice)
            && (buybottomstock.blackratefrombeforegetprice < 0)
            && (accstk.amount > 0);
            // // 1. blackrate change
            // if(isdrawdown)
            //     sellist.push(tradestock);
            

            // 2. up and down price 
            if(isdrawdown)
            {
                let averagebuyprice = GetAveragePrice(account, ticker);
                let blackrate = (tradestock.latestclose / averagebuyprice - 1) * 100; 
                
                const upper = 1.0;
                const dnper = -1.0;
                 if(blackrate < dnper || blackrate > upper)
                 {
                    sellist.push(tradestock);
                 }
            }
            
        }
    })
    
    return sellist;
}   


const RealTradeSortedStocks=(issimulation, apiserver, isPlayingCool, account, tradestocklist, tradestockdic, db_id, minutelongshort, simmNextmindata, ResetCooltime, setaccount)=>
{  
    // let sortedlist = tradestocklist.sort((a,b)=>b.blackratefromfirstgetprice - a.blackratefromfirstgetprice);
    let sortedlist = tradestocklist.sort((a,b)=>b.volume - a.volume);
    sortedlist = sortedlist.filter(element=>element.blackratefromfirstgetprice>0 && element.blackratefromfirstgetprice>0);

    if(!sortedlist || sortedlist.length == 0)
        return false;

    const buylist = sortedlist.slice(0,20);
    const sellist = GetSellStocks(account, tradestockdic, buylist[buylist.length-1]);
    percentByoneBuy = 20;
    // sellist ?먮ℓ
    sellist.forEach((tradestock)=>{
        maxonebuymoney = IsNaq(db_id) ? defulatConfig.maxonebuymoney_naq : defulatConfig.maxonebuymoney_kor; // 1000000000; // TEST1 
        let name = tradestock.name;
        let latestclose =  tradestock.latestclose;
        const ticker = tradestock.ticker;
        let cashamount = GetCashAmount(account);
        let canusecashamount = GetCanUseCashAmount(account);
        let stockAmount = GetStockAmount(account, ticker);
        let sellAmount = stockAmount;

        const returnf = ((ticker === GetIndexTicker(0)) || (ticker === GetIndexTicker(1)));

        /////////////////////////////////////////// ?쒓컙???≪븘癒밸뒗 二쇰쾾
        // -援щℓ梨낆젙 : 珥앹옱???됯??≪쓽 10?꾨줈 VS ?덉닔湲덉킑??以??곸? 湲덉븸, 援щℓ梨낆젙??二쇱떇1二쇰낫???몃㈃ 二쇱떇1二?湲덉븸,     
        let totalcapital = GetAllStockCapitalValue(account, tradestockdic)+cashamount;      
        let onebuycapital = Math.min(maxonebuymoney, totalcapital * (1/percentByoneBuy)); // ?쒕쾲???ш만 ?먰븯??二쇱떇??珥?媛移?
        let canbuycapital = Math.min(onebuycapital, canusecashamount);
        //////////////////////////////////////////
        let buymoneywithchargebyonestock = GetBuyMoney(latestclose)
        let sellmoneywithchargebyonestock = GetSellMoney(latestclose)
        //let resultbuycapital = Math.max(buycapital, buymoneywithcharge);
        let buyamount = Math.max(1, Math.max(1, Math.floor(canbuycapital / buymoneywithchargebyonestock) ));
        buyamount = Math.max(1,Math.floor(buyamount * (tradestock.faildiscount ? ((100-tradestock.faildiscount) * 0.01) : 1)));
        
        //// 媛?μ닔?됯퀎?곕떒媛 ////////////////////////////////
        const hantucanbuycacupriceper = 0.3; // 30?꾨줈 踰꾪띁.
        if (canusecashamount < (buymoneywithchargebyonestock * buyamount * (1+hantucanbuycacupriceper)))
            buyamount = Math.max(1, Math.floor(buyamount * (1-hantucanbuycacupriceper)));
        ////////////////////////////////////////////////////////////////
        
        let averagebuyprice = GetAveragePrice(account, ticker);
        let blackrate = Math.round( (latestclose / averagebuyprice - 1) * 10000 ) / 100; 
        
        const chartindex = tradestock.curchartdataidx;

        ///////////////
        const macdlongshort = 'MINUTE_SHORT'
        ///////////////
        sellAmount = Math.floor(sellAmount);
        sellAmount = Math.max(1, sellAmount);
        
        if(sellAmount > 0 && !returnf)
        {
            const addmoney = sellmoneywithchargebyonestock*sellAmount;
            if(useconsolelog)
            {
                let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
                const selcntstr = account[ticker].todayselcnt ? `selcnt:${account[ticker].todayselcnt}` : ''
                const blackratestr = `${GetBlackRateStr(blackrate)} ${blackrate < -10 ? 'OVERSEL':''}`;
                AddSimulationLog(`SELL ${timeString} ${macdlongshort} ${ticker} ${name} ${averagebuyprice}>>${latestclose}:${sellmoneywithchargebyonestock}*${sellAmount} ${blackratestr} ${selcntstr}(T)`);
            }
            if(issimulation)
                simm.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate);
            else
                real.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate);

            return true;
        }
    });
    
    // buylist 援щℓ
    buylist.forEach((tradestock)=>{
        maxonebuymoney = IsNaq(db_id) ? defulatConfig.maxonebuymoney_naq : defulatConfig.maxonebuymoney_kor; // 1000000000; // TEST1 
        let name = tradestock.name;
        let latestclose =  tradestock.latestclose;
        const ticker = tradestock.ticker;
        let cashamount = GetCashAmount(account);
        let canusecashamount = GetCanUseCashAmount(account);
        let stockAmount = GetStockAmount(account, ticker);
        let sellAmount = stockAmount;

        const returnf = (ticker === GetIndexTicker(0)) 
        || (ticker === GetIndexTicker(1)) 
        || (stockAmount>0)
        || account[ticker].todaybuycnt > 0;

        /////////////////////////////////////////// ?쒓컙???≪븘癒밸뒗 二쇰쾾
        // -援щℓ梨낆젙 : 珥앹옱???됯??≪쓽 10?꾨줈 VS ?덉닔湲덉킑??以??곸? 湲덉븸, 援щℓ梨낆젙??二쇱떇1二쇰낫???몃㈃ 二쇱떇1二?湲덉븸,     
        let totalcapital = GetAllStockCapitalValue(account, tradestockdic)+cashamount;      
        let onebuycapital = Math.min(maxonebuymoney, totalcapital * (1/percentByoneBuy)); // ?쒕쾲???ш만 ?먰븯??二쇱떇??珥?媛移?
        let canbuycapital = Math.min(onebuycapital, canusecashamount);
        //////////////////////////////////////////
        let buymoneywithchargebyonestock = GetBuyMoney(latestclose)
        let sellmoneywithchargebyonestock = GetSellMoney(latestclose)
        //let resultbuycapital = Math.max(buycapital, buymoneywithcharge);
        let buyamount = Math.max(1, Math.max(1, Math.floor(canbuycapital / buymoneywithchargebyonestock) ));
        buyamount = Math.max(1,Math.floor(buyamount * (tradestock.faildiscount ? ((100-tradestock.faildiscount) * 0.01) : 1)));
        
        //// 媛?μ닔?됯퀎?곕떒媛 ////////////////////////////////
        const hantucanbuycacupriceper = 0.3; // 30?꾨줈 踰꾪띁.
        if (canusecashamount < (buymoneywithchargebyonestock * buyamount * (1+hantucanbuycacupriceper)))
            buyamount = Math.max(1, Math.floor(buyamount * (1-hantucanbuycacupriceper)));
        if(canusecashamount < totalcapital / percentByoneBuy)
            buyamount = 0;
        ////////////////////////////////////////////////////////////////
        
        let averagebuyprice = GetAveragePrice(account, ticker);
        let blackrate = Math.round( (latestclose / averagebuyprice - 1) * 10000 ) / 100; 
        
        const chartindex = tradestock.curchartdataidx;

        ///////////
        const macdlongshort = 'MINUTE_LONG';
        ///////////
        if(stockAmount>0)
            buyamount = Math.max (1, stockAmount * defulatConfig.bnbdiv); //bnbdiv : 1,  1/2, 1/4, 1/8 
        
        const addmoney = -buymoneywithchargebyonestock * buyamount;
        

        if(buyamount>0 && !returnf)
        {
            if(issimulation)
                simm.market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort);
            else
                real.market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort);
            
            if(useconsolelog)
            {
                const stockblackrateByAveraging = defulatConfig.AveragingDown && issimulation ? GetStockBlackRate(account, tradestockdic, ticker) : '';
                const buystepstr = '';
                let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
                const buycntstr = account[ticker].todaybuycnt && account[ticker].todaybuycnt > 1 ? `buycnt:${account[ticker].todaybuycnt}` : ''
                const totalprice = (buymoneywithchargebyonestock * buyamount).toFixed(2);
                AddSimulationLog(`BUYS ${timeString} ${macdlongshort}${buystepstr} ${stockblackrateByAveraging} ${ticker} ${name} ${latestclose.toFixed(2)}:${buymoneywithchargebyonestock.toFixed(2)} x ${buyamount}=${totalprice} ${buycntstr}`);
            }
        }
    })
    return true;
    // if(toplist);
}

const SellAllStocks=(issimulation, apiserver, isPlayingCool, account, tradestocklist, tradestockdic, db_id, minutelongshort, simmNextmindata, ResetCooltime, setaccount)=>
{  
    Object.entries(account).forEach(element=>{
        
        const ticker = element[0];
        const accstk = element[1];
        let tradestock = tradestockdic[ticker];
        if(ticker !== "a0" && tradestock && (ticker != GetIndexTicker(0)) && (ticker != GetIndexTicker(1)))
        {
            
            maxonebuymoney = IsNaq(db_id) ? defulatConfig.maxonebuymoney_naq : defulatConfig.maxonebuymoney_kor; // 1000000000; // TEST1 
            let name = tradestock.name;
            let latestclose =  tradestock.latestclose;
            // const ticker = tradestock.ticker;
            let cashamount = GetCashAmount(account);
            let canusecashamount = GetCanUseCashAmount(account);
            let stockAmount = GetStockAmount(account, ticker);
            let sellAmount = stockAmount;
    
            if((ticker === GetIndexTicker(0)) || (ticker === GetIndexTicker(1)))
                return false;
    
            /////////////////////////////////////////// ?쒓컙???≪븘癒밸뒗 二쇰쾾
            // -援щℓ梨낆젙 : 珥앹옱???됯??≪쓽 10?꾨줈 VS ?덉닔湲덉킑??以??곸? 湲덉븸, 援щℓ梨낆젙??二쇱떇1二쇰낫???몃㈃ 二쇱떇1二?湲덉븸,     
            let totalcapital = GetAllStockCapitalValue(account, tradestockdic)+cashamount;      
            let onebuycapital = Math.min(maxonebuymoney, totalcapital * (1/percentByoneBuy)); // ?쒕쾲???ш만 ?먰븯??二쇱떇??珥?媛移?
            let canbuycapital = Math.min(onebuycapital, canusecashamount);
            //////////////////////////////////////////
            let buymoneywithchargebyonestock = GetBuyMoney(latestclose)
            let sellmoneywithchargebyonestock = GetSellMoney(latestclose)
            //let resultbuycapital = Math.max(buycapital, buymoneywithcharge);
            let buyamount = Math.max(1, Math.max(1, Math.floor(canbuycapital / buymoneywithchargebyonestock) ));
            buyamount = Math.max(1,Math.floor(buyamount * (tradestock.faildiscount ? ((100-tradestock.faildiscount) * 0.01) : 1)));
            
            //// 媛?μ닔?됯퀎?곕떒媛 ////////////////////////////////
            const hantucanbuycacupriceper = 0.3; // 30?꾨줈 踰꾪띁.
            if (canusecashamount < (buymoneywithchargebyonestock * buyamount * (1+hantucanbuycacupriceper)))
                buyamount = Math.max(1, Math.floor(buyamount * (1-hantucanbuycacupriceper)));
            ////////////////////////////////////////////////////////////////
            
            let averagebuyprice = GetAveragePrice(account, ticker);
            let blackrate = Math.round( (latestclose / averagebuyprice - 1) * 10000 ) / 100; 
            
            const chartindex = tradestock.curchartdataidx;
    
            ///////////////
            const macdlongshort = 'CLEAR_SHORT'
            ///////////////
            if(sellAmount>0)
            {
                sellAmount = Math.floor(sellAmount);
                sellAmount = Math.max(1, sellAmount);    
            }
            
            if(sellAmount > 0)
            {
                const addmoney = sellmoneywithchargebyonestock*sellAmount;
                if(useconsolelog)
                {
                    let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
                    const selcntstr = account[ticker].todayselcnt ? `selcnt:${account[ticker].todayselcnt}` : ''
                    const blackratestr = `${GetBlackRateStr(blackrate)} ${blackrate < -10 ? 'OVERSEL':''}`;
                    AddSimulationLog(`SELL ${timeString} ${macdlongshort} ${ticker} ${name} ${averagebuyprice}>>${latestclose}:${sellmoneywithchargebyonestock}*${sellAmount} ${blackratestr} ${selcntstr}(T)`);
                }
                if(issimulation)
                    simm.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate);
                else
                    real.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate);
    
                return true;
            }
                  
        }
    })
}

// 2?꾨줈媛 ?ㅻⅤ嫄곕굹 ?대━硫??④퀎 蹂??
const GetBreakoutsafetyshortlv=(boughclose, curclose)=>{
    const changerate = (curclose-boughclose)/boughclose * 100
    if(changerate != Infinity)
    {
        const safetyshortlv = changerate / defulatConfig.usebreakoutupper;
        return Math.trunc(safetyshortlv);
    }
    return 0;
}

// 1?꾨줈留??щ씪???④퀎?곸듅
const GetBreakoutsafetyshortlvTest=(boughclose, curclose, curlv)=>{
    const changerate = (curclose-boughclose)/boughclose * 100
    if(changerate != Infinity)
    {
        const shrtLV = changerate - (curlv/defulatConfig.usebreakoutupper);
        if(shrtLV<=0)
            return false;
        if(Math.trunc(shrtLV) >= defulatConfig.usebreakoutuponeper)
            return true;
        // const safetyshortlv = changerate / 2;
        // return Math.trunc(safetyshortlv);
    }
    return false;
}

const RealTrade=(issimulation, apiserver, isPlayingCool, curchartdataidx, tradestock, account, tradestockdic, db_id, minutelongshort, simmNextmindata, ResetCooltime, setaccount)=>
{  
    const realTradeProfile = globalval.realTradeProfile;
    let realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    if(!validTradetime(tradestock.chartdatas, curchartdataidx))
        return false;

    const currentChartdata = tradestock.chartdatas[curchartdataidx];
    if(defulatConfig.useearlyprofitlockcash && account && account['a0'])
        account['a0'].earlyprofitlockcurrentymd = GetChartDataYMD(currentChartdata);

    ++tradestock.getpricecount;
    if(!tradestock.firstgetprice)
    {
        tradestock.firstgetprice = tradestock.latestclose;
        const averagebuyprice = GetAveragePrice(account, tradestock.ticker);
        tradestock.breakoutsafetyshortlv = GetBreakoutsafetyshortlv(averagebuyprice, tradestock.latestclose);
    }
    else
    {
        tradestock.blackratefromfirstgetprice = (tradestock.latestclose - tradestock.firstgetprice ) / tradestock.firstgetprice * 100;
        tradestock.blackratefrombeforegetprice = (tradestock.latestclose - tradestock.beforegetprice ) / tradestock.beforegetprice * 100;
    }
    tradestock.beforegetprice = tradestock.latestclose;
    if(realTradeProfile)
        realTradeProfile.pre += Date.now() - realTradeProfileStart;

    if(defulatConfig.minutetrade)
    {
        return false;
    }
    if(globalval.excelvalues && defulatConfig.usepersonstocktrade || defulatConfig.usebreakouttrade)
    {
        percentByoneBuy = globalval.excelvalues.DIVCOUNT;
    }
    maxonebuymoney = IsNaq(db_id) ? defulatConfig.maxonebuymoney_naq : defulatConfig.maxonebuymoney_kor; // 1000000000; // TEST1 
    let name = tradestock.name;
    let latestclose =  tradestock.latestclose;
    const ticker = tradestock.ticker;
    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    let cashamount = GetCashAmount(account);
    let canusecashamount = GetCanUseCashAmount(account);
    let stockAmount = GetStockAmount(account, ticker);
    let sellAmount = stockAmount;
    if(realTradeProfile)
        realTradeProfile.account += Date.now() - realTradeProfileStart;

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    const partialEntryPreset = GetPartialEntryConfig();
    const partialEntryMode = cachedPartialEntryModeKey;
    if(realTradeProfile)
        realTradeProfile.partialConfig += Date.now() - realTradeProfileStart;

    if((ticker === GetIndexTicker(0)) || (ticker === GetIndexTicker(1)))
        return false;


    if(ticker === 'a105560' && GetYMD(currentChartdata.date) === '20250226')
    {
        AddSimulationLog(`[BUY_SIZE_TRACE] ${ticker} `);
    }
        
    /////////////////////////////////////////// ?쒓컙???≪븘癒밸뒗 二쇰쾾
    // -援щℓ梨낆젙 : 珥앹옱???됯??≪쓽 10?꾨줈 VS ?덉닔湲덉킑??以??곸? 湲덉븸, 援щℓ梨낆젙??二쇱떇1二쇰낫???몃㈃ 二쇱떇1二?湲덉븸,     
    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    let totalcapital = GetAllStockCapitalValue(account, tradestockdic)+cashamount;
    if(realTradeProfile)
        realTradeProfile.capital += Date.now() - realTradeProfileStart;

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    let onebuycapital = Math.min(maxonebuymoney, totalcapital * (1/percentByoneBuy)); // ?쒕쾲???ш만 ?먰븯??二쇱떇??珥?媛移?
    let canbuycapital = Math.min(onebuycapital, canusecashamount);
    if(defulatConfig.usemarketstrengthbuyfilter)
        canbuycapital = canbuycapital * GetMarketStrengthBuyScale(tradestock, curchartdataidx);
    const exposureLimit = defulatConfig.usemarketstrengthexposurelimit ? GetMarketStrengthExposureLimit(tradestock, curchartdataidx) : 1;
    const isExposureLimited = exposureLimit < 1;
    if(isExposureLimited)
    {
        const stockcapital = totalcapital - cashamount;
        const remainExposure = (totalcapital * exposureLimit) - stockcapital;
        if(remainExposure <= 0)
            return false;
        canbuycapital = Math.min(canbuycapital, remainExposure);
    }
    const partialEntryTargetCapital = canbuycapital;
    const isPartialEntryInitialBuy = partialEntryPreset && stockAmount <= 0;
    if(isPartialEntryInitialBuy)
    {
        const tranchePercent = Number(partialEntryPreset.tranchePercent || 0);
        canbuycapital = tranchePercent > 0
            ? canbuycapital * (tranchePercent * 0.01)
            : canbuycapital / partialEntryPreset.maxSteps;
    }
    //////////////////////////////////////////
    let buymoneywithchargebyonestock = GetBuyMoney(latestclose)
    if(isExposureLimited && canbuycapital < buymoneywithchargebyonestock)
        return false;
    let sellmoneywithchargebyonestock = GetSellMoney(latestclose)
    //let resultbuycapital = Math.max(buycapital, buymoneywithcharge);
    let buyamount = Math.max(1, Math.max(1, Math.floor(canbuycapital / buymoneywithchargebyonestock) ));
    buyamount = Math.max(1,Math.floor(buyamount * (tradestock.faildiscount ? ((100-tradestock.faildiscount) * 0.01) : 1)));
    const buyamountBeforeCashBuffer = buyamount;
    
    //// 媛?μ닔?됯퀎?곕떒媛 ////////////////////////////////
    const hantucanbuycacupriceper = 0.3; // 30?꾨줈 踰꾪띁.
    if (canusecashamount < (buymoneywithchargebyonestock * buyamount * (1+hantucanbuycacupriceper)))
    {
        // if(defulatConfig.usesamebuyrate)
        //     buyamount = Math.floor(canusecashamount / buymoneywithchargebyonestock);
        // else
        if(defulatConfig.autosimulation && (defulatConfig.usesinglesimulation || IsOneStockSimulation()))
        {}
        else
            buyamount = Math.max(1, Math.floor(buyamount * (1-hantucanbuycacupriceper)));

    }

    ////////////////////////////////////////////////////////////////
    
    let averagebuyprice = GetAveragePrice(account, ticker);
    let blackrate = Math.round( (latestclose / averagebuyprice - 1) * 10000 ) / 100; 
    if(realTradeProfile)
        realTradeProfile.buySizing += Date.now() - realTradeProfileStart;
    
    const chartindex = curchartdataidx;
    InitAssetBuyGateCashForDay(account, tradestock.chartdatas[chartindex]);
    const assetBuyGateState = assetBuyGate.getConditionState(totalcapital);
    const assetBuyGateStartCapital = assetBuyGateState.startCapital;
    const assetBuyGateHasHistory = assetBuyGateState.hasHistory;
    const assetBuyGateYesterdayUp = assetBuyGateState.yesterdayUp;
    const assetBuyGateTodayUp = assetBuyGateState.todayUp;
    const IsAssetBuyGateConditionOk = () => IsAssetBuyGateConditionOkForTotal(totalcapital);
    const LogAssetBuyGateBuyBlock = (reason) => {
        if(!useconsolelog)
            return;
        const timeString = GetLogDate(tradestock.chartdatas[chartindex]);
        const logFields = assetBuyGate.getBuyBlockLogFields(totalcapital);
        AddSimulationLog(`[ASSET_BUY_GATE_ALLBUY_BLOCK] ${timeString} ${reason} ${ticker} ${name} H:${logFields.condition.hasHistory ? 'Y' : 'N'} Y:${logFields.condition.yesterdayUp ? 'KEEP' : 'DN'}(${logFields.condition.state.yesterdayDate || '-'}/${logFields.yChange}) T:${logFields.condition.todayUp ? 'KEEP' : 'DN'} start:${Math.round(logFields.condition.startCapital)} cur:${Math.round(totalcapital)} cash:${Math.round(canusecashamount)}`);
    };
    const GetAssetBuyGateAllowedBuyAmount = (reason, requestedBuyAmount, buyMoneyByOneStock) => {
        return assetBuyGate.getAllowedBuyAmount({
            reason,
            requestedBuyAmount,
            buyMoneyByOneStock,
            totalcapital,
            useconsolelog,
            timeString:GetLogDate(tradestock.chartdatas[chartindex]),
            ticker,
            name,
            canusecashamount,
            addSimulationLog:AddSimulationLog,
        });
    };
    ///////////

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    const cacuChartdata = tradestock.chartdatas[chartindex];
    if(cacuChartdata._cacuOnedaysClose !== cacuChartdata.close)
    {
        CacuOnedays(tradestock.chartdatas, chartindex);
        cacuChartdata._cacuOnedaysClose = cacuChartdata.close;
    }
    else if(realTradeProfile)
    {
        ++realTradeProfile.cacuSkipped;
    }
    if(realTradeProfile)
        realTradeProfile.cacu += Date.now() - realTradeProfileStart;

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    let macdlongshort = setmacdbuysellRealTrade(tradestockdic, account, tradestock, chartindex, minutelongshort, averagebuyprice, stockAmount, canusecashamount, db_id);
    if(realTradeProfile)
    {
        realTradeProfile.signal += Date.now() - realTradeProfileStart;
        ++realTradeProfile.calls;
    }

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    if(isPlayingCool)
        return false;

    
    let trademarkbuy = true;
    if(defulatConfig.usetrademark && !tradestock.chartdatas[curchartdataidx].trademark)
        trademarkbuy = false;
    if(defulatConfig.usetrademarkrsi && !tradestock.chartdatas[curchartdataidx].trademarkrsi)
        trademarkbuy = false;
    
    // const simtestoldlatestclose = latestclose;
    // const simtestoldbuymoneywithchargebyonestock = buymoneywithchargebyonestock;
    // const simtestoldsellmoneywithchargebyonestock = sellmoneywithchargebyonestock;
    if(issimulation && defulatConfig.uselatetrade)
    {
        latestclose = typeof simmNextmindata === 'number' ? simmNextmindata : simmNextmindata.close;//GetNextMinuteClose(tradestock, chartindex);
        buymoneywithchargebyonestock = GetBuyMoney(latestclose)
        sellmoneywithchargebyonestock = GetSellMoney(latestclose)
    }
    if(realTradeProfile)
        realTradeProfile.postSignal += Date.now() - realTradeProfileStart;

    // SELL
    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    if(IsShortStyle(macdlongshort) && stockAmount > 0)
    {
        if(defulatConfig.locksell)
        {
            if(realTradeProfile)
                realTradeProfile.sell += Date.now() - realTradeProfileStart;
            return false;
        }
        
        sellAmount = Math.floor(sellAmount * GetSellPercent(macdlongshort));
        sellAmount = Math.max(1, sellAmount);
        
        if(sellAmount > 0)
        {
            if(ShouldHoldCrashReboundSell(account, tradestockdic, tradestock, ticker, latestclose, totalcapital, assetBuyGateHasHistory, assetBuyGateYesterdayUp, assetBuyGateTodayUp, macdlongshort))
            {
                if(realTradeProfile)
                    realTradeProfile.sell += Date.now() - realTradeProfileStart;
                return false;
            }
            const addmoney = sellmoneywithchargebyonestock*sellAmount;
            if(useconsolelog)
            {
                let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
                const selcntstr = account[ticker].todayselcnt ? `selcnt:${account[ticker].todayselcnt}` : ''
                const blackratestr = `${GetBlackRateStr(blackrate)} ${blackrate < -10 ? 'OVERSEL':''}`;
                if(blackrate > 0)
                    ++globalval.simsingleplus;
                else
                    ++globalval.simsingleminus;
                const addlogsinglesim = (defulatConfig.autosimulation && defulatConfig.usesinglesimulation) ? `A:${GetCanUseCashAmount(account)+GetAllStockCapitalValue(account, tradestockdic)}` : ''; 
                
                AddSimulationLog(`SELL ${timeString} ${macdlongshort} ${ticker} ${name} ${averagebuyprice}>>${latestclose}:${sellmoneywithchargebyonestock}*${sellAmount} ${blackratestr} ${selcntstr} ${addlogsinglesim}${GetGivebackTraceLog(tradestock, account, ticker)}`);
            }
            if(issimulation)
                simm.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate);
            else
                real.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate);

            if(realTradeProfile)
                realTradeProfile.sell += Date.now() - realTradeProfileStart;
            return true;
        }
    }
    if(realTradeProfile)
        realTradeProfile.sell += Date.now() - realTradeProfileStart;

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    const partialStepStopPlan = (!defulatConfig.locksell && partialEntryPreset && stockAmount > 0)
        ? GetPartialEntryStepStopPlan(account, ticker, latestclose, stockAmount, partialEntryPreset)
        : null;
    if(partialStepStopPlan)
    {
        const partialStopMacdlongshort = 'FORCE_RSI_LONG_PARTIAL_STEP_STOP';
        const stepSellAmount = partialStepStopPlan.sellAmount;
        const addmoney = sellmoneywithchargebyonestock * stepSellAmount;
        const nextPartialState = {
            partialentrylots: partialStepStopPlan.nextLots,
            partialentrystep: partialStepStopPlan.nextStep,
        };
        if(partialStepStopPlan.nextLots.length <= 0)
        {
            nextPartialState.partialentrymode = '';
            nextPartialState.partialentrybaseprice = 0;
            nextPartialState.partialentrytargetcapital = 0;
            nextPartialState.partialentrymaxstep = 0;
            nextPartialState.partialentrylastbuydate = '';
        }
        if(issimulation)
            simm.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, stepSellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, partialStopMacdlongshort, blackrate, '', nextPartialState);
        else
            real.market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, stepSellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, partialStopMacdlongshort, blackrate, '');

        if(useconsolelog)
        {
            let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
            const blackratestr = `${GetBlackRateStr(blackrate)} ${blackrate < -10 ? 'OVERSEL':''}`;
            AddSimulationLog(`SELL ${timeString} ${partialStopMacdlongshort} PSTEP:${partialStepStopPlan.step}/${partialEntryPreset.maxSteps} ${ticker} ${name} ${partialStepStopPlan.lotPrice.toFixed(2)}>>${latestclose}:${sellmoneywithchargebyonestock}*${stepSellAmount} STOP:${partialStepStopPlan.stopPrice.toFixed(2)} ${blackratestr}`);
        }
        if(realTradeProfile)
            realTradeProfile.sell += Date.now() - realTradeProfileStart;
        return true;
    }
    if(realTradeProfile)
        realTradeProfile.sell += Date.now() - realTradeProfileStart;

    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    const partialAddPlan = (partialEntryPreset && stockAmount > 0 && !defulatConfig.lockbuy && (!defulatConfig.usemarketstrengthbuyfilter || !IsMarketStrengthBuyBlocked(tradestock, chartindex)))
        ? GetPartialEntryAddPlan(account, ticker, latestclose, canusecashamount, partialEntryPreset, tradestock.chartdatas[chartindex])
        : null;
    if(realTradeProfile)
        realTradeProfile.partialPlan += Date.now() - realTradeProfileStart;
    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    if(partialAddPlan)
    {
        if(defulatConfig.useassetupbuygate && !IsAssetBuyGateConditionOk())
        {
            LogAssetBuyGateBuyBlock('partial-add');
            return false;
        }
        const partialMacdlongshort = 'FORCE_RSI_LONG_PARTIAL_ADD';
        const allowedPartialBuyAmount = GetAssetBuyGateAllowedBuyAmount('partial-add', partialAddPlan.buyamount, GetBuyMoney(latestclose));
        if(allowedPartialBuyAmount <= 0)
            return false;
        partialAddPlan.buyamount = allowedPartialBuyAmount;
        const addmoney = -GetBuyMoney(latestclose) * partialAddPlan.buyamount;
        const tradeOptions = Object.assign(
            {preserveBuyTime: true},
            MakePartialEntryState(
                partialEntryPreset,
                partialEntryMode,
                account[ticker].partialentrybaseprice,
                account[ticker].partialentrytargetcapital,
                partialAddPlan.nextStep,
                {partialentrytranchecash: GetPartialEntryTrancheCash(account[ticker])}
            ),
            AppendPartialEntryLotState(account[ticker], partialAddPlan.nextStep, latestclose, partialAddPlan.buyamount, tradestock.chartdatas[chartindex])
        );

        if(issimulation)
            simm.market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, partialAddPlan.buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, partialMacdlongshort, tradeOptions);
        else
            real.market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, partialAddPlan.buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, partialMacdlongshort, tradeOptions);

        if(useconsolelog)
        {
            let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
            const totalprice = (GetBuyMoney(latestclose) * partialAddPlan.buyamount).toFixed(2);
            AddSimulationLog(`BUYS ${timeString} ${partialMacdlongshort} PSTEP:${partialAddPlan.nextStep}/${partialAddPlan.maxStep} ${ticker} ${name} ${latestclose.toFixed(2)}:${GetBuyMoney(latestclose).toFixed(2)} x ${partialAddPlan.buyamount}=${totalprice}`);
        }
        if(realTradeProfile)
            realTradeProfile.buy += Date.now() - realTradeProfileStart;
        return true;
    }

    // BUY
    realTradeProfileStart = realTradeProfile ? Date.now() : 0;
    if(IsLongStyle(macdlongshort) && trademarkbuy)
    {
        if(defulatConfig.useassetupbuygate && !IsAssetBuyGateConditionOk())
        {
            LogAssetBuyGateBuyBlock('buy');
            return false;
        }
        if(defulatConfig.lockbuy)
            return false;
        if(defulatConfig.usemarketstrengthbuyfilter && IsMarketStrengthBuyBlocked(tradestock, chartindex))
            return false;
        if(stockAmount <= 0 && IsPartialEntryNewBuyBlocked(account, partialEntryPreset))
            return false;

        const buyToGoodTime = (defulatConfig.usepersonstocktrade || defulatConfig.usebreakouttrade) ? true : ((IsBuyToGooTime(tradestock.chartdatas, chartindex)
        && IsBuyToGooTimeRSI(tradestock.chartdatas, chartindex)));

        if(!tradestock.firstbuytriedclose && buyToGoodTime)
        {
            tradestock.firstbuytriedclose = latestclose;
        }

        if(EnoughStock(account, ticker, canbuycapital))
            return false;

        if(!IsSimilarWithfirstbuytriedclose(latestclose, tradestock))
            return false;

        const needbuycapital = isPartialEntryInitialBuy ? canbuycapital : onebuycapital;
        if(!EnoughNeedBuyMoney(canusecashamount, needbuycapital))
        {
            if(defulatConfig.locksell)
                return false;
            if(defulatConfig.usemarketstrengthbuyfilter && IsMarketStrengthNoRecycleBuyBlocked(tradestock, chartindex))
                return false;

            const recyclingStocks = GetRecyclingStock(account, tradestockdic, totalcapital, 0, ticker, issimulation);
            if(recyclingStocks && recyclingStocks[1])
            {
                const recticker = recyclingStocks[0];
                const recyclingStock = recyclingStocks[1];
                let addlog = `because buy ${ticker} ${name} ${recyclingStock.Recymacdlongshort} GATE:${assetBuyGateYesterdayUp ? 'KEEP' : 'DN'}/${assetBuyGateTodayUp ? 'KEEP' : 'DN'} CAN:${canusecashamount} NEED:${onebuycapital}`;
                macdlongshort = recyclingStock.Recymacdlongshort;
                name = recyclingStock.name;

                if(!recticker || !tradestockdic[recticker])
                {
                    console.log('GetRecyclingStock', `${addlog} ${recticker}`);
                    telegramapi.SendMessageErrorMSG('GetRecyclingStock', `${addlog} ${recticker}`);
                    return false;
                }

                const recchartindex = tradestockdic[recticker].curchartdataidx;
                tradestockdic[recticker].chartdatas[recchartindex].macdlongshort = macdlongshort;
                latestclose = recyclingStock.latestclose;
                if(macdlongshort.includes('SHORTRecyclingFor(F)' || 'SHORTRecyclingFor(W)') || macdlongshort.includes('SHORTRecyclingFor(H)'))
                    sellAmount = recyclingStock.amount;
                else
                    sellAmount = Math.max(1, Math.floor(recyclingStock.amount * (defulatConfig.recselper/100)));

                stockAmount = recyclingStock.amount;
                sellmoneywithchargebyonestock = GetSellMoney(latestclose);
                const addmoney = sellmoneywithchargebyonestock*sellAmount;

                let averagebuyprice = GetAveragePrice(account, recticker);
                let blackrate = Math.round( (latestclose / averagebuyprice - 1) * 10000 ) / 100;
                if(ShouldHoldCrashReboundSell(account, tradestockdic, tradestockdic[recticker], recticker, latestclose, totalcapital, assetBuyGateHasHistory, assetBuyGateYesterdayUp, assetBuyGateTodayUp, macdlongshort))
                    return false;

                if(issimulation)
                    simm.market_sell_order(apiserver, tradestockdic, db_id, recticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate, addlog);
                else
                    real.market_sell_order(apiserver, tradestockdic, db_id, recticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate, addlog);
                if(useconsolelog)
                {
                    const recchartdata = tradestockdic[recticker].chartdatas[recchartindex];
                    let timeString = GetLogDate(recchartdata);
                    const selcntstr = account[ticker].todayselcnt ? `selcnt:${account[ticker].todayselcnt}` : '';
                    const blackratestr = `${GetBlackRateStr(blackrate)} ${blackrate < -10 ? 'OVERSEL':''}`;
                    if(recchartdata)
                        AddSimulationLog(`SELR ${timeString} ${macdlongshort} ${recticker} ${name} ${averagebuyprice}>>[${latestclose}:${sellmoneywithchargebyonestock}*${stockAmount} ${blackratestr} ${selcntstr}(T)=??{(stockAmount)*latestclose}] ${addlog}${GetGivebackTraceLog(tradestockdic[recticker], account, recticker)}`);
                    else
                        AddSimulationLog(`SELR console chartdatas Err ${recticker}`);
                }
                return true;
            }
        }
        else
        {
            if(EnoughMoneyExport(canusecashamount, latestclose)
                && buyToGoodTime)
            {
                if(!defulatConfig.buyandbuy && stockAmount>0)
                    return false;

                if(stockAmount>0)
                    buyamount = Math.max (1, stockAmount * defulatConfig.bnbdiv);

                buyamount = GetAssetBuyGateAllowedBuyAmount('buy', buyamount, buymoneywithchargebyonestock);
                if(buyamount <= 0)
                    return false;

                const addmoney = -buymoneywithchargebyonestock * buyamount;
                const tradeOptions = isPartialEntryInitialBuy
                    ? MakePartialEntryState(
                        partialEntryPreset,
                        partialEntryMode,
                        latestclose,
                        partialEntryTargetCapital,
                        1,
                        Object.assign(
                            {
                                partialentrytranchecash: buymoneywithchargebyonestock * buyamount,
                            },
                            AppendPartialEntryLotState(null, 1, latestclose, buyamount, tradestock.chartdatas[chartindex])
                        )
                    )
                    : null;
                if(issimulation)
                    simm.market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, tradeOptions);
                else
                    real.market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, tradeOptions);

                if(useconsolelog)
                {
                    const stockblackrateByAveraging = defulatConfig.AveragingDown && issimulation ? GetStockBlackRate(account, tradestockdic, ticker) : '';
                    const buystepstr = isPartialEntryInitialBuy ? ` PSTEP:1/${partialEntryPreset.maxSteps}` : '';
                    let timeString = GetLogDate(tradestock.chartdatas[chartindex]);
                    const totalprice = (buymoneywithchargebyonestock * buyamount).toFixed(2);
                    const buycntstr = account[ticker].todaybuycnt && account[ticker].todaybuycnt > 1 ? `buycnt:${account[ticker].todaybuycnt}` : '';
                    const addlogsinglesim = (defulatConfig.autosimulation && defulatConfig.usesinglesimulation) ? `A:${GetCanUseCashAmount(account)+GetAllStockCapitalValue(account, tradestockdic)}` : '';
                    AddSimulationLog(`BUYS ${timeString} ${macdlongshort}${buystepstr} ${stockblackrateByAveraging} ${ticker} ${name} ${latestclose.toFixed(2)}:${buymoneywithchargebyonestock.toFixed(2)} x ${buyamount}=${totalprice} ${buycntstr} ${addlogsinglesim}`);
                }
                return true;
            }
        }
    }
    return false;
}


const GetGivebackTraceLog = (tradestock, account, ticker) => {
    const actdate = GetLastDateTime(account, ticker);
    if (!actdate) return '';

    const holdDays = GetPassedDayFromBought(
        tradestock.chartdatas,
        tradestock.curchartdataidx,
        actdate
    );

    const boughtprice = GetAveragePrice(account, ticker);
    if (!boughtprice) return '';

    const chartdatas = tradestock.chartdatas;
    const curidx = tradestock.curchartdataidx;

    let maxHigh = 0;
    let maxHighIdx = -1;
    
    for (let i = curidx; i >= 0; --i) {
        const chartdata = chartdatas[i];
        if (!chartdata) continue;
    
        if (chartdata.high > maxHigh) {
            maxHigh = chartdata.high;
            maxHighIdx = i;
        }
    
        if (actdate == GetYMD(chartdata.date)) {
            break;
        }
    }
    
    if (!maxHigh || maxHighIdx < 0) return '';
    
    let minProfitAfterHigh = null;
    
    for (let i = maxHighIdx; i <= curidx; ++i) {
        const chartdata = chartdatas[i];
        if (!chartdata) continue;
    
        const lowProfitRate = (chartdata.low / boughtprice - 1) * 100;
    
        if (minProfitAfterHigh === null || lowProfitRate < minProfitAfterHigh) {
            minProfitAfterHigh = lowProfitRate;
        }
    }
    
    const maxHighProfitRate = (maxHigh / boughtprice - 1) * 100;
    const currentProfitRate = (tradestock.latestclose / boughtprice - 1) * 100;
    const givebackRate = maxHighProfitRate - currentProfitRate;
    const maxHighAgo = curidx - maxHighIdx;
    if (minProfitAfterHigh === null) return '';
    return `GB:${maxHighProfitRate.toFixed(2)},${givebackRate.toFixed(2)},${holdDays},${maxHighAgo},${minProfitAfterHigh.toFixed(2)}`;
};

const CheckToken=(db_id, msg)=>{
    if(msg.includes('token') || msg.includes('credentials_type'))
    {
        let usemok = true;
        if(db_id.includes('real'))
            usemok = false;
        Issue_access_token(db_id, usemok, ()=>{});

        return true;
    }
    return false;
}

const real = {
    market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, tradeOptions = null){
        const tradestock = tradestockdic[ticker]
        if(tradestock && tradestock.odno)
            return;

        // ?곌꼍????利됱떆 ?뚮え
        account = GetCloneAccount('req', account, ticker, name, '02', latestclose, buyamount, buyamount * GetBuyMoney( latestclose ), macdlongshort);
        RegisterAssetBuyGateBuyCash(buyamount * GetBuyMoney(latestclose));
        setaccount(account);
        //ResetCooltime();
        tradestock.odno = 'reqbuy';
        if(tradestock.failreasonS && tradestock.failreasonS.includes('?쒖옣媛?멸?遺덇?')){
            macdlongshort = `FORCE_${macdlongshort}`;
            tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort = macdlongshort;
        }
        console.log(`${tradestock.odno} ${name} ${ticker} ${buyamount} ${macdlongshort} ${GetLocalDateStr(db_id,'SSS')}`);
        Market_buy_order(apiserver, db_id, ticker, buyamount, macdlongshort, (res) => {
            const result = res.result;
            const odno = result.odno;
            const success = result.rt_cd === '0';
            if(success)
            {
                ResetCooltime(ticker);
                tradestock.odno = odno;
                if(tradestock.faildiscount)
                    tradestock.faildiscount = null;
                if(tradestock.failreasonS)
                    tradestock.failreasonS = null;
            }
            else
            {
                tradestock.odno = null;
                RegisterAssetBuyGateBuyCash(-buyamount * GetBuyMoney(latestclose));
                account = GetCloneAccount('fail', account, ticker, name, '02', latestclose, buyamount, buyamount * GetBuyMoney( latestclose ), macdlongshort);
                setaccount(account);

                // if(result.msg1.includes('token') || result.msg1.includes('credentials_type'))
                // {
                //     Issue_access_token(db_id, true, ()=>{});
                // }    
                if(CheckToken(db_id, result.msg1))
                {
                    
                }        
                else if(result.msg1.includes('\ub9e4\ub9e4\ubd88\uac00')) // 2?쒓컙?숈븞 嫄곕옒 ?덊븿
                {
                    ResetCooltime(ticker, 1000 * 60 * 60 * 2);
                }    
                else if(result.msg1.includes('\uc8fc\ubb38\uac00\ub2a5\uae08\uc561'))
                { 
                    // ?섎굹吏쒕┛??紐살궗?붽굅硫?2?쒓컙?숈븞 ?ㅼ떆 ?쒕룄?덊븳??
                    if(buyamount === 1)
                    {
                        ResetCooltime(ticker, 1000 * 60 * 60 * 2);
                        return;
                    }
                        
                    const isAllOdnoNull = Object.values(tradestockdic).every(item => item.odno == null);
                    if(isAllOdnoNull)
                    {
                        Getaccount(db_id).then((r)=>{
                            setaccount(r);
                            let addlog = `?쒕쾭 ?뺣낫濡?怨꾩쥖由ъ뀑. because ${result.msg1}`;
                            console.log(addlog);
                        });
                    }
                    else
                    {
                        const adddiscountper = 10;
                        if(tradestock.faildiscount)
                            tradestock.faildiscount += adddiscountper;
                        else
                            tradestock.faildiscount = adddiscountper;    
                    }
                }
                tradestock.failreasonS = result.msg1;
            }
            
            const cashamounts = GetCashAmount(account);
            const stockscapital = GetAllStockCapitalValue(account, tradestockdic);
            const loghead = `${name}(${ticker}) ${macdlongshort}-${success}(${result.rt_cd}, ${result.odno} ${result.msg1} \r\n`
            
            const buycntstr = account[ticker].todaybuycnt && account[ticker].todaybuycnt > 1 ? `buycnt:${account[ticker].todaybuycnt}` : `buycnt:${account[ticker].todaybuycnt}`
            const log = `${(latestclose*buyamount).toFixed(2)}=${latestclose.toFixed(2)}X${buyamount} \r\n${(stockscapital+cashamounts).toFixed(2)}=S.${stockscapital.toFixed(2)}+C.${cashamounts.toFixed(2)} ${buycntstr}`;
            console.log(loghead, log, GetLocalDateStr(db_id,'SSS'));
            
            telegramapi.SendMessageSellBuy(loghead, log);
        })
    },

    market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate, addlog = '', tradeOptions = null){
        const tradestock = tradestockdic[ticker];
        if(tradestock && tradestock.odno)
            return;

        // ??寃쎌슦 ?꾩떆 ?ъ궛??利됱떆?뚮え : ?덉씠 ?녿뒗????쾶 ?뚮젮?몄꽌 怨꾩냽 ?щ뒗 寃쎌슦 諛⑹?
        account = GetCloneAccount('req', account, ticker, name, '01', latestclose, sellAmount, sellAmount * GetSellMoney(latestclose), macdlongshort);
        setaccount(account);
        //ResetCooltime();
        tradestock.odno = 'reqsel';
        const FAIL_REASONS = ['?쒖옣媛?멸?遺덇?', '寃쎌웳留ㅻℓ 嫄곕옒 遺덇?', 'SOR ?쒖옣?먯꽌 嫄곕옒媛 遺덇?'];

        if(tradestock.failreasonS && FAIL_REASONS.some(reason => tradestock.failreasonS.includes(reason))){
        // if(tradestock.failreasonS && tradestock.failreasonS.includes('?쒖옣媛?멸?遺덇?')){
            macdlongshort = `FORCE_${macdlongshort}`;
            tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort = macdlongshort;
        }
        console.log(`${name} ${ticker} ${sellAmount} ${tradestock.odno} ${macdlongshort} ${GetLocalDateStr(db_id,'SSS')}`);
        Market_sell_order(apiserver, db_id, ticker, sellAmount, macdlongshort, (res) => {
            const result = res.result;
            const odno = result.odno;
            const success = result.rt_cd === '0';
            if(success)
            {
                ResetCooltime(ticker);
                tradestock.odno = odno;
                RegisterAssetBuyGateSellCash(sellAmount * GetSellMoney(latestclose));
                if(tradestock.faildiscount)
                    tradestock.faildiscount = null;
                if(tradestock.failreasonS)
                    tradestock.failreasonS = null;
            }
            else
            {
                tradestock.odno = null;
                account = GetCloneAccount('fail', account, ticker, name, '01', latestclose, sellAmount, sellAmount * GetSellMoney(latestclose), macdlongshort);
                setaccount(account);

                // if(result.msg1.includes('token') || result.msg1.includes('credentials_type'))
                // {
                //     let usemok = true;
                //     if(db_id.includes('real'))
                //         usemok = false;
                //     Issue_access_token(db_id, usemok, ()=>{});
                // }
                CheckToken(db_id, result.msg1);
                tradestock.failreasonS = result.msg1;
            }

            const cashamounts = GetCashAmount(account);
            const stockscapital = GetAllStockCapitalValue(account, tradestockdic);

            const loghead = `${name}(${ticker}) ${macdlongshort}-${success}(${result.rt_cd}, ${result.odno} ${result.msg1}\r\n`
            const blackratestr = blackrate > 0 ? `+${blackrate}%` : `${blackrate}%`;
            const selcntstr = account[ticker].todayselcnt && account[ticker].todayselcnt > 1 ? `selcnt:${account[ticker].todayselcnt}` : `selcnt:${account[ticker].todayselcnt}`
                
            const log = `${latestclose*sellAmount}=${latestclose}X${sellAmount} \r\n${stockscapital+cashamounts}=S.${stockscapital}+C.${cashamounts} ${blackratestr} ${addlog} ${selcntstr}`;
            console.log(loghead, log, GetLocalDateStr(db_id,'SSS'));
            telegramapi.SendMessageSellBuy(loghead, log);            
        })
    }
}

const simm = {
    market_buy_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, buyamount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, tradeOptions = null){
        let copyaccount = JSON.parse(JSON.stringify(account));
        const todaybuycnt = copyaccount[ticker].todaybuycnt ? copyaccount[ticker].todaybuycnt+1 : 1;
        const todayselcnt = copyaccount[ticker].todayselcnt;
        const BuyStock=()=>
        {
            RegisterAssetBuyGateBuyCash(-addmoney);
            const resultaccount = {
                company : 'KIS',
                name : name,
                ticker : ticker,
                averagebuyprice : latestclose,
                amount : stockAmount + buyamount,
                todayaction : 'bought',
                datetime : null,
                macdlongshort : macdlongshort,
                falseamount : 0,
                falseaveragebuyprice : 0,
                falsecashamount : 0,
                todaybuycnt : todaybuycnt,
                todayselcnt : todayselcnt,
                blackrate: 0,
            };
            if(tradeOptions)
                Object.assign(resultaccount, tradeOptions);
            setaccount(ticker, resultaccount, addmoney);
        } 
        
        BuyStock();
    },

    market_sell_order(apiserver, tradestockdic, db_id, ticker, name, stockAmount, sellAmount, latestclose, addmoney, account, setaccount, ResetCooltime, macdlongshort, blackrate, addlog = '', tradeOptions = null){
        let copyaccount = JSON.parse(JSON.stringify(account));
        const todayselcnt = copyaccount[ticker].todayselcnt ? copyaccount[ticker].todayselcnt+1 : 1;
        const todaybuycnt = copyaccount[ticker].todaybuycnt;
        const SellStock=()=>
        {
            const resultaccount = {
                company : 'KIS',
                name : name,
                ticker : ticker,
                averagebuyprice : latestclose,
                amount : stockAmount - sellAmount,
                todayaction : 'sold',
                datetime : null,
                macdlongshort : macdlongshort,
                falseamount : 0,
                falseaveragebuyprice : 0,
                falsecashamount : 0,
                todayselcnt : todayselcnt,
                todaybuycnt : todaybuycnt,
                blackrate: blackrate,
            };
            if(tradeOptions)
                Object.assign(resultaccount, tradeOptions);
            setaccount(ticker, resultaccount, addmoney);
            RegisterAssetBuyGateSellCash(addmoney);
            AddEarlyProfitLockCash(account, tradestockdic, ticker, addmoney, macdlongshort);
        } 
        
        SellStock();
    }
}

const GetLogDate=(element)=>{
    const time = element.date.getTime();
    if(element._logDateTime === time && element._logDateString)
        return element._logDateString;

    const date = element.date;
    const logDateString = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,0)}/${date.getDate().toString().padStart(2,0)} ${date.getHours().toString().padStart(2,0)}:${date.getMinutes().toString().padStart(2,0)}`;
    element._logDateTime = time;
    element._logDateString = logDateString;
    return logDateString;
}

const GetBlackRateStr=(blackrate)=>{
    const blackratestr = blackrate > 0 ? `+${blackrate}%` : `${blackrate}%`;
    return blackratestr;
}

// tradestate 0=req 1=success 2=?ㅽ뙣=fail
const GetCloneAccount=(tradestate, account, ticker, name, sll_buy_dvsn_cd, avg_prvs, ord_qty, tot_ccld_amt, macdlongshort)=>{
    // 01 留ㅻ룄, 02 留ㅼ닔 sll_buy_dvsn_cd    
    let copyaccount = JSON.parse(JSON.stringify(account));
    let todaybuycnt = copyaccount[ticker] && copyaccount[ticker].todaybuycnt ? copyaccount[ticker].todaybuycnt : 0;
    let todayselcnt = copyaccount[ticker] && copyaccount[ticker].todayselcnt ? copyaccount[ticker].todayselcnt : 0;
    // todaybuycnt = IsLongStyle(macdlongshort) ? todaybuycnt+1 : todaybuycnt;
    // todayselcnt = IsShortStyle(macdlongshort) ? todayselcnt+1 : todayselcnt;
    if(tradestate != 'complete')
        todaybuycnt = sll_buy_dvsn_cd === '02' ? todaybuycnt+1 : todaybuycnt;
    todayselcnt = sll_buy_dvsn_cd === '01' ? todayselcnt+1 : todayselcnt;
    
    if(!copyaccount[ticker])
    {
        copyaccount[ticker] = {
            company : 'KIS',
            name : name,
            ticker : ticker,
            averagebuyprice : 0,
            amount : 0,
            todayaction : '',
            datetime : null,
            buytime : null,
            macdlongshort : macdlongshort,
            
            // ?붿껌 ??泥닿껐 ??媛?곸옄??
            falseamount: 0,
            falseaveragebuyprice: 0,
            falsecashamount:0,
            todaybuycnt: todaybuycnt,
            todayselcnt: todayselcnt,
        }            
    }

    // 泥닿껐?섏? ?딆? 媛?곸옄??怨꾩궛?댁꽌 媛吏怨??덈뒗?? 泥닿껐 ?꾩뿉 ?쒓굅 ?쒕떎
    
    // 嫄곕옒 ?붿껌 ?덇굅???ㅽ뙣??寃쎌슦?먮쭔 cash瑜?蹂?붿떆?⑤떎
    if(tradestate==='req' || tradestate==='fail')
    {
        copyaccount[ticker].todayaction = macdlongshort.includes('LONG') ? 'bought' : 'sold';
        if(macdlongshort)
            copyaccount[ticker].macdlongshort = macdlongshort;
        if(tradestate === 'req')
        {
            let falsecashamount = Number(ord_qty * GetBuyMoney(Number(avg_prvs)) * (sll_buy_dvsn_cd === '01' ? 1 : -1));
            copyaccount[ticker].falsecashamount = falsecashamount;
            copyaccount[ticker].falseamount = Number(sll_buy_dvsn_cd === '01' ? -ord_qty : ord_qty);
            copyaccount[ticker].falseaveragebuyprice = Number(avg_prvs);
            copyaccount['a0'].falseamount += falsecashamount;

            if (falsecashamount<0)
                copyaccount['a0'].falseamountBuy += falsecashamount;
        }
        else if(tradestate === 'fail')
        {
            let falsecashamount = copyaccount[ticker].falsecashamount;
            copyaccount[ticker].falsecashamount = 0;
            copyaccount[ticker].falseamount = 0;
            copyaccount[ticker].falseaveragebuyprice = 0;            
            copyaccount['a0'].falseamount -= falsecashamount;
            
            if (falsecashamount<0)
                copyaccount['a0'].falseamountBuy -= falsecashamount;
        }
        //copyaccount['a0'].amount += cashamount;        
    }    
    // 嫄곕옒 紐⑤몢 泥닿껐 ?덉쓣寃쎌슦?먮쭔 留ㅻЪ??媛?닔, ?됰떒媛瑜?蹂?붿떆?⑤떎. 二쇱쓽 : 嫄곕옒 ?깃났???꾨땶, 泥닿껐???꾨즺 ??寃쎌슦??
    else if(tradestate==='complete')
    {
        let falsecashamount = copyaccount[ticker].falsecashamount;
        copyaccount[ticker].falsecashamount = 0;
        copyaccount[ticker].falseamount = 0;
        copyaccount[ticker].falseaveragebuyprice = 0;

        copyaccount[ticker].averagebuyprice = Number(avg_prvs);
        copyaccount[ticker].amount += Number(sll_buy_dvsn_cd === '01' ? -ord_qty : ord_qty);
        copyaccount[ticker].todaybuycnt = todaybuycnt;
        copyaccount[ticker].todayselcnt = todayselcnt;
        //const tempamount = copyaccount['a0'].falseamount;
        copyaccount['a0'].falseamount -= falsecashamount;        
        copyaccount['a0'].amount += Number(sll_buy_dvsn_cd === '01' ? tot_ccld_amt : -tot_ccld_amt);

        if (falsecashamount<0)
            copyaccount['a0'].falseamountBuy -= falsecashamount;
        copyaccount['a0'].datetime = GetLocalDate(defulatConfig.db_id);
        if(sll_buy_dvsn_cd != '01')
            copyaccount['a0'].buytime = GetLocalDate(defulatConfig.db_id);
        //console.log(`${tempamount} ${copyaccount['a0'].amount}`);

    }    
    return copyaccount;
}

const GetEndTwoDays=(tradestock)=>{
    let endtwodays = 'NONE';
    if(tradestock && tradestock.chartdatas)
    {
        let lastchartdata = tradestock.chartdatas[tradestock.chartdatas.length-1];
        let beforelastchartdata = tradestock.chartdatas[tradestock.chartdatas.length-2];
        endtwodays = `${beforelastchartdata.date.getMonth()+1}/${beforelastchartdata.date.getDate()},${lastchartdata.date.getMonth()+1}/${lastchartdata.date.getDate()}`    
    }
      
    return endtwodays;
}

const GetEndTwoCloses=(tradestock)=>{
    let endtwocloses = 'NONE';
    if(tradestock.chartdatas)
    {
        let lastchartdata = tradestock.chartdatas[tradestock.chartdatas.length-1];
        let beforelastchartdata = tradestock.chartdatas[tradestock.chartdatas.length-2];
        endtwocloses = `${beforelastchartdata?beforelastchartdata.close:0},${lastchartdata?lastchartdata.close:0}`;
    }
      
    return endtwocloses;
}

// ?섎（???덈Т ?щ윭踰?援щℓ瑜??섏? ?딅룄濡??쒗븳?쒕떎
const IsBadCountTryLong=(account, tradestock, chartdatasTemp, curChartIdx)=>{
   const trylongcountlimit = (defulatConfig.usepersonstocktrade || defulatConfig.usebreakouttrade) ? globalval.excelvalues.TRYLONGCOUNTLIMIT: defulatConfig.trylongcountlimit;
    if(account[tradestock.ticker])
    {
        // // ?섎（ 1踰??섍쾶 援щℓ ?쒕룄?섎㈃ ?ㅻ쪟濡??먮떒
        if(account[tradestock.ticker].todaybuycnt >= trylongcountlimit || account[tradestock.ticker].todayselcnt >= trylongcountlimit)
        {
            // ??留덇컧易?諛쒖깮?섎뒗 嫄곕옒??1踰덇퉴吏???덉슜?댁???
            if(defulatConfig.trylongonmoreclosetime)
            {
                if((account[tradestock.ticker].todaybuycnt == trylongcountlimit) && IsAlmostCloseTimePure(chartdatasTemp, curChartIdx))
                    return false;
            }
            return true;
        }
    }

    // 洹몃궇?곌쾬 洹몃궇 紐??붽쾶 
    if(defulatConfig.usebreakouttrade)
    {
        if(account[tradestock.ticker] && account[tradestock.ticker].todayselcnt > 0)
        {
            return true;            
        }
    }
    return false;
}


const ListToTickerDic=(tradestocklist)=>{
    return tradestocklist.reduce((acc, stock) => {
        acc[stock.ticker] = stock; // ticker 媛믪쓣 ?ㅻ줈 ?ъ슜?섍퀬, ?섎㉧吏 ?뺣낫瑜?媛믪쑝濡????
        return acc;
      }, {});
}


const TsetThen=(db_id)=>{
                        
    Getaccount(db_id).then((r)=>{
        //setaccount(r);
        let addlog = `?쒕쾭 ?뺣낫濡?怨꾩쥖由ъ뀑. because ${result.msg1}`;
        console.log(addlog);
    });
}
///////////////////////////////////////////////////////////
module.exports = {
    Cacumacds, CacuStos, 
    CacuSMA, MoveAverage, 
    CacumacdOneday, CacuSMAOneday, CacuStoOneday, CacuRSIOneday, CacuOnedays, Cacus, Sum, ProcessCoolTime,
    GetBuyMoney, GetSellMoney, EnoughMoneyExport, setmacdbuysellRealTrade, CacuVolumes,   
    GetStockAmount, GetAveragePrice, GetRecyclingStock, EnoughStock, GetCashAmount, GetAllStockCapitalValue, CaculateAllStockCapitalValue, GetBlackSellStock, EnoughNeedBuyMoney, IsBuyToGooTime, IsBuyToGooTimeRSI, GetConfig,
    RealTrade, GetEndTwoDays, GetEndTwoCloses, GetCloneAccount, ListToTickerDic, RealTradeSortedStocks, SellAllStocks,
    DeleteTestUpdateDic,
    TsetThen,
    percentByoneBuy,    
    rsihigh, rsilow, StoOptions,     
    real,stockcompletedelaySec,
    SetInjurance, GetInjurance,
}






