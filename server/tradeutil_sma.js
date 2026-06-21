const {
    defulatConfig} = require('./util');
// const {MoveAverage, GetCloses, STDEVPA,} = require('./tradeutilcommon');
// const {Longbyrsi, Longbyrsicross} =require('./tradeutil_rsi');

// const IsSMAPerfectReverse=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
    
//     if(!ValidSMA(curelement))
//         return false;

//     const isReverse =  curelement.sma120 > curelement.sma60 
//     && curelement.sma60 > curelement.sma20;
    
//     const isTop120 = curelement.sma120 > curelement.sma10 
//     && curelement.sma120 > curelement.sma5;
    
//     return isReverse && isTop120;
//     // return (isReverse && curelement.sma10 > curelement.close);
//     // return (isReverse && curelement.sma10 > curelement.close && curelement.sma5 < curelement.close);
// }

// const IsSMAReverseBuy=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
    
//     if(
//     !curelement 
//     || !curelement.sma5
//     || !curelement.sma10
//     || !curelement.sma20
//     || !curelement.sma60
//     || !curelement.sma120
//     )
//     return false;

//     const isReverse =  curelement.sma120 > curelement.sma60 
//     && curelement.sma60 > curelement.sma20 
//     && curelement.sma20 > curelement.sma10 
//     && curelement.sma10 > curelement.sma5;
    
//     return isReverse;
//     // return (isReverse && curelement.sma10 > curelement.close);
//     // return (isReverse && curelement.sma10 > curelement.close && curelement.sma5 < curelement.close);
// }

// const IsSMALastReverse=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
    
//     if(
//     !curelement 
//     || !curelement.sma5
//     || !curelement.sma10
//     || !curelement.sma20
//     || !curelement.sma60
//     || !curelement.sma120
//     )
//     return false;

//     const isReverse = true; 
//     // curelement.sma120 > curelement.sma60 
//     // && curelement.sma60 > curelement.sma20; 
//     // && curelement.sma20 > curelement.sma10 
//     // && curelement.sma10 > curelement.sma5;

//     const isLastReverse = 
//     curelement.sma20 < curelement.sma10
//     && curelement.sma20 < curelement.sma5; 
//     // && curelement.sma20 < curelement.close;
    
//     return isReverse && isLastReverse;
//     // return (isReverse && curelement.sma10 > curelement.close);
//     // return (isReverse && curelement.sma10 > curelement.close && curelement.sma5 < curelement.close);
// }

// const ValidSMA=(element)=>{
//     if(!element 
//     || !element.sma5
//     || !element.sma10
//     || !element.sma20
//     || !element.sma60
//     || !element.sma120)
//         return false;
//     return true;
// }


const ValidSMAByNumber=(element, smaNumbers)=>{
    if (!element || !Array.isArray(smaNumbers)) return false;

    for (const smaNumber of smaNumbers) {
        const smaPropertyName = `sma${smaNumber}`;
        if (!element[smaPropertyName]) {
            return false;
        }
    }
    return true;
}

const IsSMAArrange=(chartdatas, chartdatasidx, smaNumbers)=>{
    const curelement = chartdatas[chartdatasidx];
    const port = defulatConfig.port;
    if(!ValidSMAByNumber(curelement, smaNumbers))
        return false;
    const isArranged = smaNumbers.every((smaNumber, index, arr) => {
        if (index === 0) return true;
        const prevSma = curelement[`sma${arr[index-1]}`];
        const currSma = curelement[`sma${smaNumber}`];
        return prevSma > currSma;
    });

    return isArranged;
}

const GetSMAGapPer=(chartdatas, chartdatasidx, smaNumbers)=>{
    const curelement = chartdatas[chartdatasidx];
    const port = defulatConfig.port;
    if(!ValidSMAByNumber(curelement, smaNumbers))
        return false;

    // const smadiffrate = smaNumbers.every((smaNumber, index, arr) => {
    //     if (index === 0) return true;
    //     const prevSma = curelement[`sma${arr[index-1]}`];
    //     const currSma = curelement[`sma${smaNumber}`];
    //     return (prevSma - currSma) / prevSma * 100;
    // });
    
    const prevSma = curelement[`sma${smaNumbers[0]}`];
    const currSma = curelement[`sma${smaNumbers[1]}`];
    const smadiffrate = (prevSma - currSma) / prevSma * 100;
    return smadiffrate;
    //(sma5-sma10) / sma5
}


const ProcessShort=(account, tradestockdic, tradestock, chartdatasTemp, curChartIdx, minutelongshort, averagebuyprice, Callback)=>{
    // return tradeutilrsi.ProcessShort(account, tradestockdic, tradestock, chartdatasTemp, curChartIdx, minutelongshort, averagebuyprice, Callback);
    // return tradeutillowprice.ProcessShort(account, tradestockdic, tradestock, chartdatasTemp, curChartIdx, minutelongshort, averagebuyprice, Callback);
    
    // if(IsUnderSMA20(chartdatasTemp, curChartIdx))
    // {
    //     Callback("SMA_SHORT_BOUGHTPRICE");
    //     return true;
    // }
    // return false;
    // if(IsArrangedTtoB6020120(chartdatasTemp, curChartIdx))
    // {
    //     Callback("SMA_SHORT_BOUGHTPRICE");
    //     return true;
    // }

    // if(IsUnderBBottom(chartdatasTemp, curChartIdx))
    // {
    //     Callback("SMA_SHORT_BOUGHTPRICE");
    //     return true;
    // }
    
    // else if(Shortbylowpricetodayhigh(chartdatasTemp, curChartIdx))
    // {
    //     Callback("LOWPRICE_SHORT_TODAYHIGH");
    //     return true;
    // }
}

// today 20 > 60 > 120
// const IsSMAarranged=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];
    
//     if(!ValidSMA(curelement)|| !ValidSMA(before1element))
//         return false;
//     const isArranged = 
//         curelement.sma20 > curelement.sma60
//         && curelement.sma60 > curelement.sma120;

//     return isArranged;
// }

// const IsArrangedTtoB6020120=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];

//     if(!ValidSMA(curelement))
//         return false;
//     const isArranged = 
//         curelement.sma60 > curelement.sma20
//         && curelement.sma20 > curelement.sma120;

//     return isArranged;
// }

// const GetCloseUnderSMACount=(element, undertype)=>{
//     let overcount = 0;
//     const value = undertype=='low'?element.low:element.close;
//     overcount += value < element.sma5 ? 1 : 0;
//     overcount += value < element.sma10 ? 1 : 0;
//     overcount += value < element.sma20 ? 1 : 0;
//     overcount += value < element.sma60 ? 1 : 0;
//     overcount += value < element.sma120 ? 1 : 0;
//     return overcount;
// }

// const GetCloseOverSMACount=(element)=>{
//     let overcount = 0;
//     const value = element.close;
//     overcount += value > element.sma5 ? 1 : 0;
//     overcount += value > element.sma10 ? 1 : 0;
//     overcount += value > element.sma20 ? 1 : 0;
//     overcount += value > element.sma60 ? 1 : 0;
//     overcount += value > element.sma120 ? 1 : 0;
//     return overcount;
// }

// const IsSMALong=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];
    
//     // if(!ValidSMA(curelement)|| !ValidSMA(before1element))
//     //     return false;
//     // const undercountlow = GetCloseUnderSMACount(before1element, 'low');
//     // const undercountclose = GetCloseUnderSMACount(before1element, 'close');
//     // const overcount = GetCloseOverSMACount(curelement);
//     // const isbeforeunder = undercountlow >= 4;
//     // const iscurover = overcount >= 4;

//     // // 어제오늘 합쳐서 8개 이상이면 구매
//     // const condition1 = (isbeforeunder && iscurover);
//     // // 최하단이었다면 2개만 올라도 구매
//     // const condition2 = (undercountclose>=5 && overcount>=2);   
//     // // 장기선3개 역배열 상태에서 가격이 단기선2개를 돌파 
//     // const condition3 = IsSMAHighStopToMoreHigh(chartdatas, chartdatasidx);
//     // // 완전역배 상황 거른다
//     // const isperfetreverse =  IsSMAPerfectReverse(chartdatas, chartdatasidx);
//     // // rsi > signal 때만 산다
//     // const isrsibingmorethansignal = Longbyrsi(chartdatas, chartdatasidx);
//     // return (condition1 || condition2 || condition3) && isrsibingmorethansignal && !isperfetreverse;
//     const isrsibingmorethansignal = Longbyrsicross(chartdatas, chartdatasidx);
//     const issma60_20_10 = IsSMAArrange(chartdatas, chartdatasidx-1, [60, 20, 10]);
//     return isrsibingmorethansignal && issma60_20_10;
// }

// const IsSMALong2=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];
    
//     const isrsibingmorethansignal = Longbyrsicross(chartdatas, chartdatasidx);
//     const issma10_20_60 = IsSMAArrange(chartdatas, chartdatasidx-1, [10, 20, 60]);
//     return isrsibingmorethansignal && issma10_20_60;
// }

// const IsSMALong3=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];

//     let isyesterdayshort = true;//IsLongStyle(chartdatasTemp[curChartIdx-1].macdlongshort);
//     const isrsiover = Longbyrsi(chartdatas, chartdatasidx);
//     // const issma10_20_60 = IsSMAArrange(chartdatas, chartdatasidx-1, [10, 20, 60]);
//     return isrsiover && isyesterdayshort;
// }


// const IsSMAHighStopToMoreHigh=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];
    
//     if(!ValidSMA(curelement)|| !ValidSMA(before1element))
//         return false;

//     const conditioncommon = curelement.sma60 > curelement.sma120
//         && curelement.sma20>curelement.sma60
//         && curelement.close>curelement.sma60
//         && curelement.sma10>curelement.sma60
//         && curelement.sma5>curelement.sma60;
        
//     const conditionyesterday = before1element.low < before1element.sma5
//     && before1element.low < before1element.sma10
//     && before1element.low < before1element.sma20; 
    
//     const conditiontoday = curelement.close > curelement.sma5
//     && curelement.close > curelement.sma10
//     && curelement.close > curelement.sma20;

//     return (conditioncommon&&conditiontoday&&conditionyesterday);
// }


// // today 120 > 20 > 60 
// const IsSMAarraging=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];
    
//     if(!ValidSMA(curelement)|| !ValidSMA(before1element))
//         return false;
//     const isArranged = 
//         curelement.sma120 > curelement.sma20
//         && curelement.sma20 > curelement.sma60;

//     return isArranged;
// }



// const IsTestSMA=(chartdatas, chartdatasidx, beforeday)=>{
//     // return true;
//     const curelement = chartdatas[chartdatasidx-beforeday];
    
//     if(!ValidSMAByNumber(curelement, [10,20,60,120]))
//         return false;
//     const isArranged = 
//         curelement.sma120 > curelement.sma60
//         || curelement.sma20 > curelement.sma60;

//     return isArranged;
// }

// // upright start
// const IsSMAlastReversefirstArrange=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
    
//     if(!ValidSMA(curelement))
//         return false;

//     const isReverse =  
//         curelement.sma120 > curelement.sma60 
//         && curelement.sma60 > curelement.sma20; 
    
//     const isArranged = 
//         curelement.sma5 > curelement.sma10
//         && curelement.sma10 > curelement.sma20;

//     return isReverse && isArranged;
// }

// const IssmaUpRight=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     const before1element = chartdatas[chartdatasidx-1];    
//     const before2element = chartdatas[chartdatasidx-1];        

//     const sma5valid = curelement.sma5>before1element.sma5 || (curelement.sma5-before1element.sma5 < before1element.sma5-before2element.sma5);
//     const sma20valid = curelement.sma20>before1element.sma20 || (curelement.sma20-before1element.sma20 < before1element.sma20-before2element.sma20);

//     return (sma5valid && sma20valid);
// }


// const IsDoNotLongSMA=(chartdatas, chartdatasidx)=>{
//     const curelement = chartdatas[chartdatasidx];
//     // const beforeelement = chartdatas[chartdatasidx-1];
//     // if(!curelement || !beforeelement)
//     //     return false;
    
//     // if(curelement.close < beforeelement.close)
//     //     return false;

//     // if(curelement[stoIdxStr1].K < beforeelement[stoIdxStr1].K)
//     //     return false;

//     if(!curelement.sma5 || !curelement.sma20 || !curelement.sma60)
//         return false;

//     if((curelement.sma5 < curelement.sma20) && (curelement.sma20 < curelement.sma60))
//     {
//         return true;
//     }

//     return false;
// }

// const IsUnderSMA20=(chartdatas, index)=>{
//     const smainfo = CacuSMAinfo(index, chartdatas);
//     let element = chartdatas[index];
    
//     return element.close < element.sma20;    
// }

// const IsUnderBBottom=(chartdatas, index)=>{
//     const smainfo = CacuSMAinfo(index, chartdatas);
//     let element = chartdatas[index];

//     if(!ValidSMA(element))
//         return false;
//     return element.close < element.bb.bottom;    
// }


// const smaday = [5,10,20,60,120];
// const CacuBBinfo=(chartdatas, index)=>{
    
//     const closesof20days = GetCloses(chartdatas.slice(index-smaday[1]+1, index+1));
//     const stdevpa = STDEVPA(closesof20days);

//     return {
//         stdevpa : stdevpa
//     }
// }

// const CacuSMAinfo=(index, chartdatas)=>
// {
//     return {
//         sma5 : index-smaday[0] >= 0 ? MoveAverage(GetCloses(chartdatas.slice(index-smaday[0]+1, index+1))) : 0,
//         sma10 : index-smaday[1] >= 0 ? MoveAverage(GetCloses(chartdatas.slice(index-smaday[1]+1, index+1))) : 0,
//         sma20 : index-smaday[2] >= 0 ? MoveAverage(GetCloses(chartdatas.slice(index-smaday[2]+1, index+1))) : 0,
//         sma60 : index-smaday[3] >= 0 ? MoveAverage(GetCloses(chartdatas.slice(index-smaday[3]+1, index+1))) : 0,
//         sma120 : index-smaday[4] >= 0 ? MoveAverage(GetCloses(chartdatas.slice(index-smaday[4]+1, index+1))) : 0,
//         stdevpa : index-smaday[2] >= 0 ? STDEVPA(GetCloses(chartdatas.slice(index-smaday[2]+1, index+1))):0,
//     }
// }

// const CacuSMAOneday=(chartdatas, index)=>{
//     const smainfo = CacuSMAinfo(index, chartdatas);
//     let element = chartdatas[index];
//     element.sma5 = smainfo.sma5;
//     element.sma10 = smainfo.sma10;
//     element.sma20 = smainfo.sma20;
//     element.sma60 = smainfo.sma60;
//     element.sma120 = smainfo.sma120;    
//     element.stdevpa = smainfo.stdevpa;
//     element.bb = {
//         stdevpa : smainfo.stdevpa,
//         middle : element.sma20,
//         top : element.sma20 + smainfo.stdevpa * 0.5,
//         bottom : element.sma20 - smainfo.stdevpa * 0.5,
//     }    
// }

// const CacuSMA=(chartdatas)=>
// {
//     chartdatas.forEach((element, index)=>{
//         CacuSMAOneday(chartdatas, index);
//     })
// }   

const IsSMAUP=(chartdatas, chartdatasidx, smaday)=>{
    // return true;
    const curelement = chartdatas[chartdatasidx-0];
    const befelement = chartdatas[chartdatasidx-1];

    if(!ValidSMAByNumber(curelement, [smaday]) || !ValidSMAByNumber(befelement, [smaday]))
        return false;

    const cursma = curelement[`sma${smaday}`];
    const befsma = befelement[`sma${smaday}`];
    
    const isArranged = 
        cursma > befsma;

    return isArranged;
}


module.exports = {
    IsSMAArrange, IsSMAUP, GetSMAGapPer,
    // CacuSMAOneday, CacuSMA, IsSMAReverseBuy, IsSMALastReverse, IsSMAarranged, IsSMAarraging,IsSMAlastReversefirstArrange,
    // IsSMALong, IsSMALong2, ProcessShort, ValidSMAByNumber, IsTestSMA, IsSMALong3
}