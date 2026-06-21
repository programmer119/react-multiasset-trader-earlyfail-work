const {defulatConfig, IsNaq, GetLocalDate} = require('./util');
const MORNING_07H = 7;
// KOREAN TRADING TIME
const KR_TIME={
    h07m20 : MORNING_07H * 60 + 0 + 20, //8 * 60 + 20,       // morning prepare
    h07m30 : MORNING_07H * 60 + 0 + 30, //8 * 60 + 30,       // morning start clear & addstocks
    h07m40 : MORNING_07H * 60 + 0 + 40, // 8 * 60 + 40,      // morning finish clear & addstocks
    h08m00 : MORNING_07H * 60 + 0 + 60, // can trade start nxt
    h09m00 : MORNING_07H * 60 + 0 + 60 + 60, // can trade start
    h15m30 : 15 * 60 + 30,  // can trade end
    almostCloseTime : 15 * 60 + 30 - 20,// 15 * 60 + 10,
    almostOpenTime : 9 * 60 + 5,// 15 * 60 + 10,
    h20m00 : 20 * 60 + 0, // can trade end nxt
    h20m10 : 20 * 60 + 10, // getaccount
    h20m20 : 20 * 60 + 20, // clonewalletsnapshot
    h20m30 : 20 * 60 + 30, // clearwallet
}

// AMERICAN TRADING TIME
const AM_TIME={
    h07m20 : MORNING_07H * 60 + 0 + 20,  // morning prepare
    h07m30 : MORNING_07H * 60 + 0 + 30,  // morning start clear & addstocks
    h07m40 : MORNING_07H * 60 + 0 + 40,  // morning finish clear & addstocks
    h08m00 : MORNING_07H * 60 + 0 + 60, // can trade start nxt
    h09m00 : 9 * 60 + 30,  // can trade start
    h15m30 : 16 * 60 + 0,  // can trade end
    almostCloseTime : 16 * 60 + 0 - 20,  
    almostOpenTime : 9 * 60 + 30 + 5,// 15 * 60 + 10, 
    h20m00 : 20 * 60 + 0, // can trade end nxt
    h20m10 : 20 * 60 + 10, // getaccount
    h20m20 : 20 * 60 + 20, // clonewalletsnapshot
    h20m30 : 20 * 60 + 30, // clearwallet
}

const localtime = IsNaq(defulatConfig.db_id) ? AM_TIME : KR_TIME;
const h07m20 = localtime.h07m20;
const h07m30 = localtime.h07m30;
const h07m40 = localtime.h07m40;
const h20m10 = localtime.h20m10;
const hNxtstart = localtime.h08m00;    // can trade start nxt
const hNxtfinish = localtime.h20m00;  // can trade end
const hRegularstart = localtime.h09m00;    // can trade start
const hRegularfinish = localtime.h15m30;

// 9시 5분 까지는 매도에 집중
const IsMorningShortCoreTime=()=>{
    const today = GetLocalDate(defulatConfig.db_id);        
    const hour = today.getHours();
    const minute = today.getMinutes();
    const curminute = hour * 60 + minute;
    return curminute <= (hRegularstart + 5);
}

const GetStartTime=()=>{
    return defulatConfig.isnxt ? hNxtstart : hRegularstart;
}
  
const GetFinishTime=()=>{
    return defulatConfig.isnxt ? hNxtfinish : hRegularfinish;
}

const validFetchtime=(curminute)=>{
    return (curminute >= GetStartTime() && curminute <= GetFinishTime());
}

const validRegularTime=(chartdatas, chartdatasidx)=>{
    
    const curelement = chartdatas[chartdatasidx];
    if(!curelement)
        return false;

    const curDate = curelement.date;
    const hour = curDate.getHours() * 60    
    const minute = curDate.getMinutes();

    return ((hour + minute) >= hRegularstart && (hour + minute) <= hRegularfinish);
}


const validTradetime=(chartdatas, chartdatasidx)=>{
    if(!defulatConfig.ismock)
        return true;
    
    return validRegularTime(chartdatas, chartdatasidx);
}


const GetAlmostCloseTime=(db_id)=>{
    if(IsNaq(db_id))
    {
        return AM_TIME.almostCloseTime;
    }
    else
    {
        return KR_TIME.almostCloseTime;
    }
}

const GetAlmostOpenTime=(db_id)=>{
    if(IsNaq(db_id))
    {
        return AM_TIME.almostOpenTime;
    }
    else
    {
        return KR_TIME.almostOpenTime;
    }
}

module.exports = {
    validTradetime, validFetchtime,
    KR_TIME, AM_TIME, MORNING_07H,
    GetAlmostCloseTime, GetAlmostOpenTime,
    GetStartTime, GetFinishTime, IsMorningShortCoreTime,
    // servertrade에서 스케줄링에 직접 사용
    h07m20, h07m30, h07m40, h20m10,
    hRegularfinish, hNxtfinish,
}