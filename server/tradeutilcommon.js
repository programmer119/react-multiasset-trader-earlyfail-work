const {defulatConfig,
} = require('./util');

const globalval = require('./globalval');
// const { IsLongStyle } = require('./tradeutil');
const GetYMD=(date)=>{
    if(!date)
        return date;

    if (typeof date === 'string') {
        // ISO 형식(YYYY-MM-DD...)인 경우 앞의 10자리에서 하이픈만 제거
        // 예: "2026-02-03T05:36:31.000Z" -> "2026-02-03" -> "20260203"
        return date.substring(0, 10).replace(/-/g, '');
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, 0); // 0부터 시작하므로 +1 필요
    const day = date.getDate().toString().padStart(2, 0);

    return `${year}${month}${day}`

}

const GetLastDateTime = (account, ticker)=>
{
    const stock = account[ticker];
    if(stock === undefined)
        return 0;
    // let buytime = stock.datetime;
    let buytime = stock.buytime;
    if(!defulatConfig.autosimulation && !buytime)
        buytime = stock.datetime;
    return GetYMD(buytime);
}

const IsBuyDayIsToday=(account, ticker, chartdatasTemp, curChartIdx)=>{
    
    const buyday = GetLastDateTime(account, ticker);
    if(!buyday)
        return false;

    const buydayYMD = buyday;//GetYMD(buydate);
    const curelement = chartdatasTemp[curChartIdx];
    const todayYMD = GetYMD(curelement.date);
    
    if(todayYMD != buydayYMD)
        return false;

    return true;
}

const IsBuyDayIsOverday=(account, ticker, chartdatasTemp, curChartIdx)=>{
    
    const buyday = GetLastDateTime(account, ticker);
    if(!buyday)
        return false;

    // const buydayYMD = buyday;//GetYMD(buydate);
    // const curelement = chartdatasTemp[curChartIdx];
    // const todayYMD = GetYMD(curelement.date);
    
    // if(todayYMD != buydayYMD)
    //     return false;

    const passedday = GetPassedDayFromBought(chartdatasTemp, curChartIdx, buyday);
    if(passedday < defulatConfig.rsimacddownseloverday)
        return false;

    return true;
}

const IsShortStyle=(longshort)=>{
    if(GetTradeStyle(longshort) === "SHORT")
        return true;

    return false;
}

const IsLongStyle=(longshort)=>{
    if(GetTradeStyle(longshort) === "LONG")
        return true;

    return false;
}

const GetTradeStyle=(longshort)=>{
    if(!longshort || longshort==="")
        return "NONE";
    // if(longshort.includes("FAKE"))
    //     return "NONE"

    longshort = longshort.toUpperCase();
    if(longshort.includes("LONG"))
        return "LONG";
    else if(longshort.includes("SHORT"))
        return "SHORT";

    return "NONE";
}

function calculateDaysElapsedFromDateObjects(pastDateObj, currentDateObj) {
    // 1. 시간 오차 및 DST 문제를 방지하기 위해 날짜 객체의 시간을 00:00:00으로 초기화합니다.
    // 원본 객체를 변경하지 않기 위해 복사본을 만듭니다.
    
    // 지난 날짜를 복사하고 시간을 자정(00:00:00)으로 설정
    const pastDate = new Date(pastDateObj.getFullYear(), pastDateObj.getMonth(), pastDateObj.getDate());

    // 현재 날짜를 복사하고 시간을 자정(00:00:00)으로 설정
    const currentDate = new Date(currentDateObj.getFullYear(), currentDateObj.getMonth(), currentDateObj.getDate());
    
    // 2. 두 날짜 객체의 밀리초(ms) 차이를 계산
    const diffTime = currentDate.getTime() - pastDate.getTime();

    // 3. 밀리초 차이를 일(Day) 단위로 변환 후 소수점 버림
    const millisecondsInDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.floor(diffTime / millisecondsInDay);

    return diffDays;
}

// function calculateDayCountElapsedFromDateObjects(tradestockdic, ticker) {
//     // 1. 시간 오차 및 DST 문제를 방지하기 위해 날짜 객체의 시간을 00:00:00으로 초기화합니다.
//     // 원본 객체를 변경하지 않기 위해 복사본을 만듭니다.
    
//     const chartdatas = tradestockdic[ticker].chartdatas;
//     const curchartdataidx = tradestockdic[ticker].curchartdataidx;
//     let daycount = 0;
//     for (let i  = chartdatas.length-1; i >= 0; --i)
//     {
//         ++daycount;
//         if(IsLongStyle(chartdatas[curchartdataidx].macdlong))
//             break;
//     }
//     return daycount;
// }

const GetPassedDayFromBought=(chartdatas, chartdatasidx, actdate)=>{
    let passedday = 0;
    for (let i = chartdatasidx; i >= 0; --i) 
    {
        if(actdate == GetYMD(chartdatas[i].date))
            return passedday;

        ++passedday;
        // const macdlongshort = chartdatas[i].macdlongshort;
        // if(GetTradeStyle(macdlongshort) == "NONE")
        // {
        //     ++passedday;
        // }
        // else if(GetTradeStyle(macdlongshort) == "SHORT")
        // {
        //     return 0;
        // }
        // else if(GetTradeStyle(macdlongshort) == "LONG")
        // {
        //     ++passedday;
        //     return passedday;
        // }
    }

    return passedday;
}


const GetHighcloseFromBoughtDay=(chartdatas, chartdatasidx, actdate)=>{
    let passedday = 0;
    let highclose = 0;
    for (let i = chartdatasidx; i >= 0; --i) 
    {
        highclose = Math.max(highclose, chartdatas[i].high);

        if(actdate == GetYMD(chartdatas[i].date))
        {  
            break;
        }
        else
        {

        }
    }

    return highclose;
}

const Highest3=(slicedata)=>{
    // return Math.max(...slicedata);
    return slicedata.map(o => o.close).reduce((max, curr) => max < curr ? curr : max );
}

const MoveAverage = (arrs) => {
    let sum = 0;
    arrs.forEach((arr)=>
    {
        sum += Number(arr);
    });
    return sum / arrs.length;
}


const CalculateEMA = (data, period) => {
    if (data.length < period) {
        console.error(`데이터(${data.length}개)가 기간(${period})보다 짧아 EMA를 계산할 수 없습니다.`);
        return [];
    }

    // 1. 평활 상수 (Smoothing Factor, k) 계산: k = 2 / (N + 1)
    const k = 2 / (period + 1);
    
    // EMA 결과 배열
    const emas = [];
    
    // 2. 초기 EMA 값 설정: 첫 period 기간의 단순 이동 평균(SMA)을 초기값으로 사용
    // EMA 계산은 index (period - 1) 시점부터 시작됨
    const initialData = data.slice(0, period);
    
    // SMA 계산 (Sum of initialData / period)
    const initialSMA = initialData.reduce((sum, value) => sum + value, 0) / period;
    
    // 첫 번째 EMA 값으로 SMA를 추가 (첫 번째 결과값)
    emas.push(initialSMA);

    // 3. 이후 EMA 값 순차적으로 계산 (i는 period, 즉 data 배열의 period번째 index부터 시작)
    for (let i = period; i < data.length; i++) {
        const currentPrice = data[i];
        
        // 이전 시점의 EMA (emas 배열의 가장 최근 값)
        const previousEMA = emas[emas.length - 1]; 

        // EMA 공식 적용: EMA_t = (V_t * k) + (EMA_t-1 * (1 - k))
        const currentEMA = (currentPrice * k) + (previousEMA * (1 - k));
        
        emas.push(currentEMA);
    }

    return emas[emas.length - 1];;
};

const GetCloses=(sliceDatas)=>
{
    return sliceDatas.reduce(function(accum,cur){accum.push(cur.close);return accum},[])
}


const Getslices=(datas, count, excludecount) => {
    // 1. 제외할 요소가 있는지 확인 (excludecount > 0)
    if (excludecount > 0) {
        // 배열 끝에서 excludecount만큼을 제외한 곳까지 추출
        const end = datas.length - excludecount;

        // 추출 시작 지점: (제외된 끝 지점) - (가져올 개수)
        const start = end - count;

        // 시작 인덱스가 0보다 작으면 0으로 설정하여 유효성 확보
        // (요청한 count가 남아있는 요소 개수보다 많을 때 대비)
        return datas.slice(Math.max(0, start), end);
    }

    // 2. 제외할 요소가 없는 경우 (excludecount = 0 또는 falsy)
    // 원래의 동작: 배열의 가장 마지막 count개의 요소를 반환
    return datas.slice(datas.length - count);
}


const IsETF = (stockName) => {
    const ETF_ETN_BRANDS_UPPERCASE = [
        "KODEX", 
        "TIGER", 
        "KIWOOM",
        "TIMEFOLIO",
        "PLUS",
        "KINDEX", 
        "ACE", 
        "KBSTAR", 
        "ARIRANG", 
        "SOL", 
        "KOSEF", 
        "HANARO", 
        "DAISHIN", // Daishin -> DAISHIN
        "챔피언", 
        "회사채",
        "에셋플러스",
        "특수채",
        "채권",
        // "파워",
        "TREX",
        "하나UBS", 
        "BNK", 
        "RISE", 
        "교보악사", 
        "IBK", 
        "흥국", 
        "WOORI", // Woori -> WOORI
        "스팩"
    ];

    // 1. 입력된 종목명을 대문자로 변환하여 검색의 통일성을 확보합니다.
    const nameUpper = stockName.toUpperCase(); 

    if(nameUpper == '')
        return true;
    // 2. ETF_BRANDS 리스트를 순회하며 종목명에 브랜드가 포함되어 있는지 확인합니다.
    //    하나라도 포함되면 즉시 true를 반환합니다.
    return ETF_ETN_BRANDS_UPPERCASE.some(brand => nameUpper.includes(brand.toUpperCase()));
};
const IsPrimary = (ticker) => {
    // 1. 입력된 종목명을 대문자로 변환하여 검색의 통일성을 확보합니다.
    
    if(ticker == '')
        return true;
    // 2. ETF_BRANDS 리스트를 순회하며 종목명에 브랜드가 포함되어 있는지 확인합니다.
    //    하나라도 포함되면 즉시 true를 반환합니다.
    return ticker[ticker.length-1] == 5 || ticker[ticker.length-1] == 7 || ticker[ticker.length-1] == 'k';
};

const IsEtcStock = (ticker) => {
    return !/^\d+$/.test(ticker.slice(1));
}

const FilterSpecialTickers = (datas) => {
    if(defulatConfig.tradeboy != 'tradeboy' || (!defulatConfig.filtertickersdivden && !defulatConfig.filtertickersetf && !defulatConfig.filtertickersetc))
        return datas;

    const filteredtickers = datas.filter(data=>    
        (!defulatConfig.filtertickersdivden || !IsPrimary(data.ticker)) &&
        (!defulatConfig.filtertickersetf    || !IsETF(data.name)) &&
        (!defulatConfig.filtertickersetc    || !IsEtcStock(data.ticker)))
    .sort((a, b) => b.marketcap - a.marketcap);
    
    if(defulatConfig.topstocklistmix)
    {
        return filteredtickers.slice(0, defulatConfig.topstocklistcount*2);
    }

    // KOSPI와 KOSDAQ을 각각 필터링 후 n개씩 자르기
    const kospihalf = filteredtickers.filter(d => !d.rankstr.includes('KOSDAQ')).slice(0, defulatConfig.topstocklistcount);
    const kosdaqhalf = filteredtickers.filter(d => d.rankstr.includes('KOSDAQ')).slice(0, defulatConfig.topstocklistcount);

    // 합쳐서 140개 리턴
    return [...kospihalf, ...kosdaqhalf];
    // return filteredtickers;
}

const Hasuplimit=(closes)=>{
    if(!globalval.excelvalues || !globalval.excelvalues.UPLIMIT)
        return true;
    // 9일전종가 >= 10일전종가 * 1.28 AND
    // ... AND
    // ... AND
    // 오늘종가 > 어제종가 * 1.28

    for(let i = closes.length-1; i > 0; --i)
    {
        // current
        const current = closes[i];
        // before
        const before = closes[i-1];

        // if(current >= before * 1+(defulatConfig.uplimitper/100))    // XXX BA HALL 조금만 올라도 사버림
        // if(current >= before * (1+(defulatConfig.uplimitper/100))) // 상한가가까워야 삼
        //     return true;
        if(IsRecheadUpLimit(before, current, defulatConfig.dnlimitper))
            return true;
    }
    return false;
}

const IsRecheadUpLimit=(before, current, uplimit=1000)=>{
    return (
        (current >= before * (1+(defulatConfig.uplimitper/100))) && 
        (current < before * (1+(uplimit/100))));
}

const IsRecheadLimit=(before, current, uplimit=1000)=>{
    return (
        (current >= before * (1+(defulatConfig.reachedlimit/100))) && 
        (current < before * (1+(uplimit/100))));
}
const GetChangePer=(bef, cur)=>{
    return bef===0 ? 0 : Math.ceil((cur/bef-1)*10000)/100;
}

const GetChangePerLog=(changedper)=>{
    const logper = changedper > 0 ? `+${changedper}` : changedper;    
    return logper;
}


const volumefilter = (tradestock, days, multicondition, timedetail = true) => {
    const starttimestr = '0900';
    const endtimestr = '1530';
    const chartdatas = tradestock.chartdatas;
    const chartindex = tradestock.curchartdataidx;
    const curelement = chartdatas[chartindex];

    if (!curelement) return false;

    const curDate = curelement.date;
    const [startHour, startMinute] = [Number(starttimestr.substring(0, 2)), Number(starttimestr.substring(2, 4))];
    const [endHour, endMinute] = [Number(endtimestr.substring(0, 2)), Number(endtimestr.substring(2, 4))];

    const totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    const elapsedMinutes = (curDate.getHours() * 60 + curDate.getMinutes()) - (startHour * 60 + startMinute);

    if (elapsedMinutes <= 0) return false;

    const slice = chartdatas.slice(chartindex - days, chartindex);
    if (slice.length < days) return false;

    const avgDailyVolume = slice.reduce((sum, el) => sum + el.volume, 0) / slice.length;

    const timedetailrate = timedetail ? (elapsedMinutes / totalMinutes) : 1;
    //return curelement.volume > avgDailyVolume * timedetailrate * multicondition;
    return curelement.volume > avgDailyVolume;
};

const volumefilter2 = (vols, lastidx, tomorrowvalue, days, multicondition) => {
    return true;
    const chartdatas = vols;
    const chartindex = lastidx;
    // const curelement = chartdatas[chartindex];

    // if (!curelement) return false;

    const slice = chartdatas.slice(chartindex - days + 1, chartindex + 1);
    if (slice.length < days) return false;

    const avgDailyVolume = slice.reduce((sum, el) => sum + el.value, 0) / slice.length;
    
    return tomorrowvalue > avgDailyVolume * multicondition;
};


module.exports = {GetYMD, calculateDaysElapsedFromDateObjects, MoveAverage, Highest3, GetCloses, CalculateEMA, Getslices,
    IsETF, IsPrimary, IsEtcStock, Hasuplimit, IsLongStyle, IsShortStyle, GetTradeStyle,
    GetPassedDayFromBought, IsRecheadUpLimit, IsRecheadLimit, GetHighcloseFromBoughtDay, volumefilter, volumefilter2,
    IsBuyDayIsToday, IsBuyDayIsOverday, GetLastDateTime, GetChangePer, GetChangePerLog, FilterSpecialTickers};