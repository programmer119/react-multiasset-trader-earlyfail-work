const express = require('express');
const cors = require('cors');
const app = express();
const schedule = require('node-schedule');
const bodyParser = require('body-parser');
const telegramapi = require(`./telegram`);
const axios = require('axios');
const db_serverinfo = require('./config/db_serverinfo');
const db_user = require('./config/db_user');
const {getReadySheetData, getValueSheetData, getLastSheetData} = require('./googlespreadsheet');
const pyutil = require('./pythonutil');
const { MORNING_07H, KR_TIME, AM_TIME } = require('./tradetimeutil');
const {GetStartMessage, GetUpdateMessage, GetCompleteMessage, GetDayName, Getfetchboylist,
    ip, defulatConfig, dbidtoname, dbidtoredisjson,
} = require('./util');
const { GetYMD } = require('./tradeutilcommon');
const {Issue_access_token, GetaccountGeneral, GetsnapshotaccountGeneral, GetIndexdatas,
    TopstocklistBA,LoadBADB, Opendaycheck
} = require('./serverpacket')
const config = require("./config")
const consts = require('./consts');
const globalval = require('./globalval');
// const tickercache = require('./ticker_cache');
const { StartTickerCache, GetTickerPrices } = require('./ticker_cache');
const port = defulatConfig.maintenanceport;
// const TelegramAPI = require('./telegram');
let reloadholidaystate = 0;
let resetcreonstate = 0;
let maintenancestate = 0;
let stocklistup_starttime;
let maintenancestate_naq = 0;
let maintenancestate_coin = 0;
app.use(bodyParser.json()); 
app.use(cors({
    origin: '*', // 모든 출처 허용 옵션. true 를 써도 된다.
}));
const botidMaintenance = '7190824539:AAGGoqcvcqBUnDmCX3__5kH_1I06pcRt5LY';  // 점검방 : 

// KOREAN LIVE
const h07 = MORNING_07H;
const min10 = 10;   // start prepare
const min22 = 22;   // start hantu token 
const min24 = 24;   // start reset creon
const min30 = 30;   // finish reset creon

const intervalminute = 1.0;

// TEST
// const h07 = 19;
// const min20 = 48;         // start prepare
// const min22 = min20+1;    // start hantu token 
// const min24 = min20+3;   // start reset creon
// const min30 = min20+4;   // finish reset creon
let g_networkerror = false;
let heartbeats = {};
//const tradeservers = {'KOR' : `http://localhost:${4100}`, 'NAQ' : `http://localhost:${4200}`};
const clienturlframe = `http://localhost:`
tradeservers = {}
const interval_tradeserver_heartbeat=(db_id)=>{
    // let log = `maintenanceserver HEARTBEAT ${GetCurrentTime()} marketopen:${marketopen} g_canTradeTime:${g_canTradeTime}`;
    //console.log(log);

    heartbeats[db_id] = false;
    axios.get(`${tradeservers[db_id]}/heartbeat`).then(res=>{
        //console.log('maintenanceserver TEST COMPLETE');
        // let log = `maintenanceserver HEARTBEAT ${GetCurrentTime()}`;
        //console.log(log);
        heartbeats[db_id] = true;      
    })
    .catch(error => {
        if (error.response) {
            // 서버가 응답했지만 상태 코드가 2xx가 아닐 때
            console.error('Error Response:', error.response.data);
        } else if (error.request) {
            // 서버는 응답하지 않았을 때
            console.error('No Response from Server:', error.request);
        } else {
            // 다른 에러 발생 시
            console.error('Error Message:', error.message);
        }
    });
}

const interval_oclock_heartbeat=()=>{
    // const nations = ['KOR', 'NAQ'];
    // for ( nation of nations )
    console.log(`interval_oclock_heartbeat ${JSON.stringify(tradeservers)}`)
    for (let db_id in tradeservers)
    {
        interval_tradeserver_heartbeat(db_id);
    }
    
    // heartbeat 상태를 모두 false로 만든 후 패킷 받을때까지 15초간 충분히 기다렸다가 받아둔 상태를 체크한다
    setTimeout(() => {
      g_networkerror = Object.values(heartbeats).includes(false);// (!flask_heartbeat || !maintenanceserver_heartbeat);
      if(g_networkerror)
      {
        let netlog = JSON.stringify(heartbeats);//Object.values(heartbeats)
        telegramapi.SendMessageErrorMSG('[SERVER SHUTDOWN]', netlog);        
      }
    }, 1000 * 15);    
}

let userwallets = 
{
    kor:[],
    naq:[]
}

const MakeUserWalletValues=()=>{
    userwallets.kor=[];
    userwallets.naq=[];
    query = 'SHOW TABLES'
    db_user((conn) => {
        conn.query(query, (err, data) => {
            conn.release();
            if(err)
                console.log(err);
            else if(data)
            {
                results = data.map(table => table['Tables_in_user'])
                results.forEach((result)=>{
                    if(result.includes('naq'))
                        userwallets['naq'].push(result);
                    else if(result.includes('kor'))
                        userwallets['kor'].push(result);
                })
                
            }
        })
    });    
}

const SetDBServerInfo=(where, querystatus)=>
{
    const query = `UPDATE maintenance SET status = '${querystatus}' WHERE NAME = '${where}'`;
    
    db_serverinfo((conn) => {
        conn.query(query, (err, data) => 
        {
            conn.release();
            if(err)
                console.log(err);
        })
    });
}

const StartMaintenanceCoin=(today, ticker)=>{
    maintenancestate_coin = 1;
    SetDBServerInfo('alltableupdatingcoin', 'none');

    stocklistup_starttime = (new Date()).getTime();
    let startlog = GetStartMessage('COIN', 'Maintenance');
    console.log(startlog);
    telegramapi.SendMessage(startlog, botidMaintenance);
    
    pyutil.coinminute_oldinfo_collect('all',(result)=>{
        console.log(`coinminute_oldinfo_collect ${JSON.stringify(result)}`);
    });

    setTimeout(() => {
        maintenancestate_coin = 0;
    }, 1000 * 60 * 10);    
}

const FinishMaintenanceCoin=()=>{
// finish maintenance alaram
    query = `SELECT status FROM maintenance WHERE NAME = 'alltableupdatingcoin'`
    
    db_serverinfo((conn) => {
        conn.query(query, (err, data) => {
            conn.release();
            if(!err) {
                if(!stocklistup_starttime)
                    stocklistup_starttime = new Date().getTime();

                statuslist = data[0].status.split('-');
                if(statuslist.length > 1)
                {
                    statuspercent = statuslist[1];

                    if(statuspercent === 'complete')
                    {
                        SetDBServerInfo('alltableupdatingcoin', 'updating-none_comp');
                        let startlog = GetStartMessage('COIN','Maintenance');
                        let completelog = GetCompleteMessage('COIN', 'Maintenance', stocklistup_starttime);
                        console.log(completelog);
                        telegramapi.EditMessageText(startlog, completelog, botidMaintenance);
                    }
                    else if(statuspercent !== 'none_comp')
                    {
                        let startlog = GetStartMessage('COIN','Maintenance');
                        let updatelog = GetUpdateMessage('COIN','Maintenance', `${statuspercent}%`, stocklistup_starttime);
                        console.log(updatelog);
                        telegramapi.EditMessageText(startlog, updatelog, botidMaintenance);
                    }
                }                    
            }
            else {
                console.log(`SELECT status db error : ${err}`);
            }
        })        
    });
}

const StartMaintenanceNaq=(dayname)=>{
    const nation = 'NAQ';        
    //maintenancestate_naq = 1;
    stocklistup_starttime = (new Date()).getTime();
    
    let startlog = GetStartMessage(`${nation}`,'Maintenance');
    console.log(startlog);
    telegramapi.SendMessage(startlog, botidMaintenance);
    SetDBServerInfo('alltableupdatingnaq', 'none');
    SetDBServerInfo('alltableupdatingnaqday', 'none');

    // clear_wallet('naq');
    pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'yahoo_nas_day_alltime', 'yahoo_nas_day_alltime', 'all', dayname, 0, 0, (result)=>{

    });    
}

const StartMaintenance=(dayname)=>{
    const nation = 'KOR';
    maintenancestate = 1;
    stocklistup_starttime = new Date().getTime();
    const alltabstr = `alltableupdating${dbidtoname(db_id)}`;

    let startlog = GetStartMessage(`${nation}`,'Maintenance');
    console.log(startlog);
    telegramapi.SendMessage(startlog, botidMaintenance);
    SetDBServerInfo(`${alltabstr}`, 'none');
    SetDBServerInfo('dailymaintenance', 'none');

    console.log('resetcreon');
    pyutil.resetcreon(db_id,()=>{
        setTimeout(() => {
            console.log('stock_oldinfo_collect_all 0');
            pyutil.stock_oldinfo_collect_all(db_id, dayname, (rt_cd)=>{console.log(`stock_oldinfo_collect_all 1. rt_cd:${rt_cd}`);});
            //pyutil.stock_oldinfo_collect('a000100',()=>{console.log('stock_oldinfo_collect 1');});
        // }, 1000 * 2); // 
        }, 1000 * 60 * 2);
    });

    // 70분뒤 resetcreon 가능 상태로 변경
    // setTimeout(() => {
    //     maintenancestate = 0;
    // }, 1000 * 60 * 70);    
}

let printcheat = true;
const CheatPrint=(cheatlog)=>{
    if(!printcheat)
        return;
    console.log(cheatlog);   
}

const FinishMaintenance=(dayname)=>{
    // const today = new Date();
    // const day = today.getDay()
    const nation = 'KOR';
    const alltabstr = `alltableupdating${dbidtoname(db_id)}`;
    
    const query = `SELECT status FROM maintenance WHERE NAME = '${alltabstr}'`
    CheatPrint(`FinishMaintenance0 ${dayname} ${query}`)
    db_serverinfo((conn) => {            
        conn.query(query, (err, data) => {
            conn.release();
            if(!err) {
                if(!stocklistup_starttime)
                    stocklistup_starttime = new Date().getTime();

                statuslist = data[0].status.split('-');

                CheatPrint(`FinishMaintenance1-ok ${statuslist.length}`);
                if(statuslist.length > 1)
                {
                    const statusgb = statuslist[0]
                    const statuspercent = statuslist[1];
                    CheatPrint(`FinishMaintenance1-ok-1 ${statuspercent}`);
                    if(statuspercent === 'complete_m')
                    {
                        SetDBServerInfo(`${alltabstr}`, 'updating-none_comp');
                        let startlog = GetStartMessage(`${nation}`,'Maintenance');
                        let completelog = GetCompleteMessage(`${nation}`, `${dayname} Maintenance`, stocklistup_starttime);
                        console.log(completelog);
                        telegramapi.EditMessageText(startlog, completelog, botidMaintenance);
                        maintenancestate = 2;

                        // make tomorrow ba
                        if(defulatConfig.usebreakoutstocklist)
                        {
                            Makebastocklist(new Date(),false);
                        }
                    }
                    else if(statuspercent !== 'none_comp')
                    // else if(maintenancestate<2)
                    {
                        let startlog = GetStartMessage(`${nation}`,'Maintenance');
                        let updatelog = GetUpdateMessage(`${nation}`,`${dayname} Maintenance`,`${statusgb}-${statuspercent}%`,stocklistup_starttime);
                        console.log(updatelog);
                        telegramapi.EditMessageText(startlog, updatelog, botidMaintenance);
                    }
                }                    
            }
            else {
                console.log(`SELECT status db error : ${err}`);
            }
        })          
    });           
}

// force 가 true인경우 강제 집행
const Makebastocklist=async(badate, force=false)=>{
    console.log('ready Makebastocklist');
    
    console.log(`Makebastocklist getReadySheetData start ${badate}`);
    await getReadySheetData();
    await getValueSheetData();
    // await getLastSheetData();
    console.log('Makebastocklist getReadySheetData end');

    console.log('Makebastocklist Opendaycheck start');
    const isopenday = await Opendaycheck(badate, db_id);
    if(!force && !isopenday)
        return;
    console.log('Makebastocklist Opendaycheck end');
    return new Promise((resolve) => {
        TopstocklistBA(badate, defulatConfig.db_id, 'make', (tickers, memo) => {
            console.log(`finish Makebastocklist ${badate}`);
            resolve(tickers); // Promise를 이 값으로 완료시킴
            
            globalval.excelvalues = '';
            globalval.sheets = null;
            globalval.sheetList = null;
        });
    });
}

const clear_wallet=(nation)=>{
    console.log(`start init_wallet ${nation}`);
    userwallets[nation].forEach((db_id)=>{
        console.log(`req init_wallet ${nation} ${db_id}`);
        pyutil.init_wallet(db_id, ()=>{
            console.log(`res init_wallet ${nation} ${db_id}`);
        })
    });
}
            
const update_daily_walletsnapshot=(nation)=>{
    console.log(`start update_daily_walletsnapshot ${nation}`);
    userwallets[nation].forEach((db_id)=>{
        console.log(`req update_daily_walletsnapshot ${nation} ${db_id}`);
        const curdb_id = db_id;
        pyutil.update_daily_walletsnapshot(curdb_id, (result)=>{
            console.log(`res update_daily_walletsnapshot ${nation} ${curdb_id} ${result.msg1}`);
        });
    });
} 

const db_id = defulatConfig.db_id;
const fetchboy = defulatConfig.fetchboy;
const ismock = defulatConfig.ismock;
const ticker = 'u001'
let g_wwwdayname; // 출력용

const InitJob=()=>{
    //// update_daily_walletsnapshot
    
    if(consts.IsFetchBoy(fetchboy))
    {
        const ruleinfos = [ 
        {tz:'Asia/Seoul', nation:'kor', copytime:KR_TIME.h20m20, cleartime:KR_TIME.h20m30},
        {tz:'US/Eastern', nation:'naq', copytime:AM_TIME.h20m20, cleartime:AM_TIME.h20m30},
        ];
        
        for (ruleinfo of ruleinfos)
        {
            const rnation = ruleinfo.nation;
            const rule = new schedule.RecurrenceRule();
            rule.hour = parseInt(ruleinfo.copytime/60);
            rule.minute = ruleinfo.copytime - (rule.hour * 60);
            rule.tz = ruleinfo.tz;
            const jobwalletsnapshot = schedule.scheduleJob(rule, function(){ 
                const currentDateInTz = new Date().toLocaleString('en-US', { timeZone: rule.tz });
                const curDay = new Date(currentDateInTz).getDay();
                const curDayName = GetDayName(curDay);
                const isHoliday = curDayName === 'sunday' || curDayName === 'saturday';
                const rulelog = `rule ${rnation} update_daily_walletsnapshot day:${curDayName} isHoliday:${isHoliday}`;
                console.log(rulelog);   
                telegramapi.SendMessage(rulelog, botidMaintenance);

                if(!isHoliday)
                {
                    update_daily_walletsnapshot(rnation);
                }
            });    

            const ruleclear = new schedule.RecurrenceRule();
            ruleclear.hour = parseInt(ruleinfo.cleartime/60);
            ruleclear.minute = ruleinfo.cleartime - (ruleclear.hour * 60);
            ruleclear.tz = ruleinfo.tz;
            const jobwalletclear = schedule.scheduleJob(ruleclear, function(){
                const currentDateInTz = new Date().toLocaleString('en-US', { timeZone: ruleclear.tz });
                const curDay = new Date(currentDateInTz).getDay();
                const curDayName = GetDayName(curDay);
                const isHoliday = curDayName === 'sunday' || curDayName === 'saturday';
                const rulelog = `rule ${rnation} walletclear day:${curDayName} isHoliday:${isHoliday}`;
                console.log(rulelog);
                telegramapi.SendMessage(rulelog, botidMaintenance);
                if(!isHoliday)
                {     
                    clear_wallet(rnation);
                }
            });    
        }
    }
    
    const job = schedule.scheduleJob('*/5 * * * *', interval_oclock_heartbeat);
}


app.post('/info/tickerlists', (req, res) => {
    const tickers = Array.isArray(req.body?.tickers) ? req.body.tickers : [];
  
    if (tickers.length === 0) {
      res.send({
        result: {},
        meta: {
          requested: 0,
          returned: 0,
          error: 'tickers is empty'
        }
      });
      return;
    }
  
    const result = GetTickerPrices(tickers);
    res.send(result);
});
  
  // GET으로도 테스트 가능하게 옵션 추가
app.get('/info/tickerlists', (req, res) => {
    const tickers = String(req.query.tickers ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  
    const result = GetTickerPrices(tickers);
    res.send(result);
});

app.listen(port, () => {    
    console.log(`stock maintenance server app listening at http://localhost:${port}`)    
    pyutil.ExecuteShell();
    MakeUserWalletValues();
    telegramapi.SetPrevMSG(db_id);
    StartTickerCache (dbidtoredisjson(db_id))
    //TestLogEdit();

    InitJob();
    const CallInterval=()=>{
        today = new Date();
        const hour = today.getHours();
        const min = today.getMinutes();
        const nation = 'NAQ';
        
        const day = today.getDay();
        const dayname = GetDayName(day);
        g_wwwdayname = dayname;
        const coinhour = 0;
        const maintenancehour = dayname==defulatConfig.hardmaintenanceday ? defulatConfig.maintenancehoursat : defulatConfig.maintenancehour; //16        
        const naqhour = dayname==defulatConfig.hardmaintenanceday ? defulatConfig.maintenancehournaqsat : defulatConfig.maintenancehournaq; // 19
        const naqmin = 0;

        const isfetchboy = consts.IsFetchBoy(fetchboy);
        ////////////////////////////////////////////////////////////////////////////////
        // MAINTENANCE
        ////////////////////////////////////////////////////////////////////////////////
        // if(fetchboy === 'fetchboy')
        // {
        // NAQ -----------------------------------
        if(hour >= naqhour && hour <= naqhour+2 && dayname !== defulatConfig.nomaintenanceday)
        {   
            if(hour === naqhour && maintenancestate_naq === 0)
            {
                if(min >= naqmin+0 && min < naqmin+59)
                {
                    maintenancestate_naq = 1;
                    if(isfetchboy)
                    {
                        StartMaintenanceNaq(dayname);
                    }

                    setTimeout(() => {
                        //start hantu token for KOR                        
                        if(fetchboy==='fetchboy')
                        {
                            // fetchboy + real_kor. 
                            const db_id_replace = db_id;//fetchboy + db_id.slice(db_id.indexOf('_'));
                            Issue_access_token(db_id_replace, false, ()=>{});
                        }
                        else{
                            Issue_access_token(db_id, ismock, ()=>{
                                console.log(`start hantu token`);
                            });
                        }
                    }, 1000 * 60 * 10);
                }
            } 
        }

        if(isfetchboy)
        {
            if(maintenancestate_naq === 1)
            {
                const query = `SELECT status FROM maintenance WHERE NAME = 'alltableupdatingnaq'`
                db_serverinfo((conn) => {
                    conn.query(query, (err, data) => {
                        conn.release();
                        if(!err) {
                            const statuslist = data[0].status.split('-');
                            const queryday = `SELECT status FROM maintenance WHERE NAME = 'alltableupdatingnaqday'`
                            conn.query(queryday, (errday, dataday) => {
                                if(!errday) {                            
                                    if(!stocklistup_starttime)
                                        stocklistup_starttime = new Date().getTime();

                                    const statuslistday = dataday[0].status.split('-');
                                    let statuspercentday = '_';
                                    let statuspercent = '_';
                                    if(statuslistday.length > 1)
                                    {
                                        statuspercentday = statuslistday[1].replace('updating', '');
                                        //console.log(`statuspercentday : ${statuspercentday}`);
                                    }
                                    if(statuslist.length > 1)
                                    {
                                        statuspercent = statuslist[1].replace('updating', '');
                                        //console.log(`statuspercent : ${statuspercent}`);
                                    }                    

                                    if(statuspercentday === 'complete') //  && statuspercent === 'complete'
                                    {
                                        SetDBServerInfo('alltableupdatingnaqday', 'updating-none_comp');
                                        let startlog = GetStartMessage(`${nation}`,'Maintenance');
                                        let completelog = GetCompleteMessage(`${nation}`, `${dayname} Maintenance(D)`, stocklistup_starttime);
                                        console.log(completelog);
                                        telegramapi.EditMessageText(startlog, completelog, botidMaintenance);
                                        pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'nasminutestock_oldinfo_collect', 'nasminutestock_oldinfo_collect', 'all', dayname, 0, 0, 0, (result)=>{
                                            console.log(`nasminutestock_oldinfo_collect ${dayname} ${JSON.stringify(result)}`);
                                        });
                                    }
                                    if(statuspercent === 'complete')
                                    {
                                        SetDBServerInfo('alltableupdatingnaq', 'updating-none_comp');
                                        let startlog = GetStartMessage(`${nation}`,'Maintenance');
                                        let completelog = GetCompleteMessage(`${nation}`, `${dayname} Maintenance(M)`, stocklistup_starttime);
                                        console.log(completelog);
                                        telegramapi.EditMessageText(startlog, completelog, botidMaintenance);
                                        maintenancestate_naq = 2;
                                    }
                                
                                    if(statuspercentday !== 'none_comp')
                                    {
                                        let startlog = GetStartMessage(`${nation}`,'Maintenance');
                                        let updatelog = GetUpdateMessage(`${nation}`,`${dayname} Maintenance`, `d-${statuspercentday}%`, stocklistup_starttime);
                                        console.log(updatelog);
                                        telegramapi.EditMessageText(startlog, updatelog, botidMaintenance);
                                    }
                                    else if (statuspercent !== 'none_comp')
                                    {
                                        let startlog = GetStartMessage(`${nation}`,'Maintenance');
                                        let updatelog = GetUpdateMessage(`${nation}`,`${dayname} Maintenance`, `m-${statuspercent}%`, stocklistup_starttime);
                                        console.log(updatelog);
                                        telegramapi.EditMessageText(startlog, updatelog, botidMaintenance);
                                    }
                                }
                                else {
                                    console.log(`SELECT status db errday : ${errday}`);
                                }
                            });
                        }
                        else {
                            console.log(`SELECT status db err : ${err}`);
                        }
                    })                
                });    
            }       
            // NAQ -----------------------------------
        }
        
        if(isfetchboy)
        {
            // COIN
            if(hour >= coinhour-1 && hour <= coinhour+2)
            {            
                if(hour === coinhour && min > 0 && min < 5 && maintenancestate_coin === 0)
                {   
                    StartMaintenanceCoin(today, ticker);
                }

                FinishMaintenanceCoin();               
            }        
            // COIN --------------------------------------

            // KOR 
            if(hour >= maintenancehour-1 && hour <= maintenancehour+2 && dayname !== defulatConfig.nomaintenanceday)
            {            
                if(hour === maintenancehour && min >= 0 && min < 55 && maintenancestate === 0)
                {                
                    // update_daily_walletsnapshot('kor');
                    StartMaintenance(dayname);
                }
            }
            if(maintenancestate === 1)
                FinishMaintenance(dayname);       
        }

        if(g_loglv>=5)
        {
            console.log(`${hour >= maintenancehour-1} ${hour <= maintenancehour+2} ${dayname !== defulatConfig.nomaintenanceday} ${hour === maintenancehour} ${min >= 0 && min < 55} ${maintenancestate === 0}`)
            console.log(`isfetchboy:${isfetchboy} maintenancestate:${maintenancestate} maintenancehour-1:${maintenancehour-1} hour:${hour} min:${min} maintenancehour:${maintenancehour} dayname:${dayname} nomaintenanceday:${defulatConfig.nomaintenanceday}`)
        }
        ////////////////////////////////////////////////////////////////////////////////
    
        const isprepare = (hour === h07 && min >= min10 && min < min22 && reloadholidaystate === 0);
        if(isprepare && dayname !== defulatConfig.nomaintenanceday)
        {
            resetcreonstate = 0;
            reloadholidaystate = 1;
            maintenancestate_naq = 0;
            maintenancestate = 0;            
        }
        // 장사준비
        if( dayname === 'sunday' || dayname === 'saturday')
        {
            printToday(today, dayname);
            if(dayname === 'sunday')
                reloadholidaystate = 0;
            return;
        }
        // 07:10 start prepare
        if(isprepare)
        {
            console.log(`prepare start prepare`);
            if(isfetchboy)
            {
                // KOR START PREPARE TIME
                // clear_wallet('kor')
                //update_daily_walletsnapshot('naq');

                axios.get(`http://${consts.flaskserver}/reloadholiday`).then(data=> {
                    const holidaylog = data.data;
                    console.log(holidaylog);
                    telegramapi.SendMessage(holidaylog, botidMaintenance);        
                });
            }
            setTimeout(() => {
                reloadholidaystate = 0;
            }, 1000 * 60 * 30);
        }        
        // 08:05 start hantu token for KOR
        else if(hour === h07 && min >= min22 && min < min24 && resetcreonstate === 0)
        {
            resetcreonstate = 1;
            if(isfetchboy)
            {
                const fetchboylist = Getfetchboylist();
                for(let i = 0; i < fetchboylist.length; ++i)
                {
                    const db_id_replace = fetchboylist[i];//fetchboy + db_id.slice(db_id.indexOf('_'));
                    Issue_access_token(db_id_replace, false, ()=>{});
                }
            }   
            else{
                Issue_access_token(db_id, ismock, ()=>{
                    console.log(`start hantu token`);
                });
            }
        }                
        // 08:20 start resetcreon
        else if(hour === h07 && min >= min24 && min < min30 && resetcreonstate === 1)
        {
            if(isfetchboy)
            {
                console.log(`req resetcreson ${fetchboy}`);
                pyutil.resetcreon(db_id,()=>{
                    resetcreonstate = 2;
                    console.log(`res resetcreson ${fetchboy}`);
                })
            }
            else
            {
                resetcreonstate = 2;
                console.log(`no need resetcreson ${fetchboy}`);
            }
        }
        else
        {
            printToday(today, dayname)   
        }
    }

    const printToday=(_today, dayname)=>{
        const formattedDate = new Intl.DateTimeFormat('ko-KR', {
            weekday: 'short', // 요일 추가 (short로 축약된 형태)
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }).format(_today);
          
          
        // 동부 표준시(EST)로 변환
        const easternTime = _today.toLocaleString('en-US', {
            timeZone: 'US/Eastern'
        });
        console.log(`${JSON.stringify(heartbeats)} KST:${formattedDate}, US/EST:${easternTime} D:${dayname} [${ip}]`)
    }

    // CallInterval();
    setInterval(()=> {
        CallInterval();
    }, 1000 * 60 * intervalminute)

    // pyutil.ExecuteShell();
})

const GetStatusLog=()=>{
    const log = 
    `<br>g_wwwdayname:${g_wwwdayname}
    <br>resetcreonstate:${resetcreonstate}
    <br>reloadholidaystate:${reloadholidaystate}
    <br>maintenancestate_naq:${maintenancestate_naq}
    <br>maintenancestate:${maintenancestate}`
    return log;
}

app.get('/breakout', async(req,res)=>{
    let date = new Date();
    if(req.query.ymd)
    {
        const dateStr = req.query.ymd; //ex "20220305";
        const formattedStr = dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        date = new Date(formattedStr);
    }
    
    const tickers = await Makebastocklist(date,true);
    res.send(`breakout ${tickers.length}`);
    // TopstocklistBA(new Date(), defulatConfig.db_id, 'make', (tickers, memo)=>{
    //     res.send(`breakout ${tickers.length} ${memo}`);
    // });
})

app.get('/loadbreakout', async(req,res)=>{
    await LoadBADB();
    res.send(`finish LoadBADB`);
    // TopstocklistBA('20260129', defulatConfig.db_id, 'make', (tickers, memo)=>{
    //     res.send(`breakout ${tickers.length} ${memo}`);
    // });
})


app.get('/snapshot', (req,res)=>{
    update_daily_walletsnapshot(req.query.nation);
    res.send(`snapshot ${req.query.nation}`);
})

app.get('/testnaq', (req,res)=>{
    // const ticker = 'all';//'abat'//,'abcl';
    // pyutil.nasminutestock_oldinfo_collect(ticker,(rt_cd)=>{
    //     console.log(`nasminutestock_oldinfo_collect ${ticker}. rt_cd:${rt_cd}`);
    //     res.send(`nasminutestock_oldinfo_collect ${ticker}. rt_cd:${rt_cd}`);
    // });
    // telegramapi.SendMessage(`Complete Maintenance NAQ [${ip}]`, true);
    pyutil.nasminutestock_oldinfo_collect('all',(rt_cd)=>{
        console.log(`Complete Maintenance NAQ. rt_cd:${rt_cd}`);
    });
})

app.get('/issue', (req,res)=>{
    // Issue_access_token(db_id, true, ()=>{
    //     res.send('Issue_access_token');
    //     if(fetchboy==='fetchboy')
    //     {
    //         const db_id_replace = fetchboy + db_id.slice(db_id.indexOf('_'));
    //         Issue_access_token(db_id_replace, false, ()=>{});
    //     }
    // });

    const fetchboylist = Getfetchboylist();
    for(let i = 0; i < fetchboylist.length; ++i)
    {
        const db_id_replace = fetchboylist[i];//fetchboy + db_id.slice(db_id.indexOf('_'));
        Issue_access_token(db_id_replace, false, ()=>{});
    }
    res.send('Issue_access_token');
})


app.get('/heartbeat', (req,res)=>{
    res.send(`heartbeat from ${req.query.db_id} ${req.query.port}`);
    if(!req.query.db_id || !req.query.port)
        return;

    if(!tradeservers[req.query.db_id])
    {
        const registedserverurl = `${clienturlframe}${req.query.port}`;
        tradeservers[req.query.db_id] = registedserverurl;
        console.log(`REGISTED ${req.query.db_id} ${registedserverurl}`);
    }
})

app.get('/inituserwallets', (req,res)=>{
    let result = MakeUserWalletValues();
    res.send(result);
})

app.get('/starttest', (req,res)=>{
    
        let startlog = GetStartMessage('TEST','Maintenance');
        telegramapi.SendMessage(startlog, botidMaintenance);
        res.send('starttest');
})

///////////////////////////// CHEAT ///////////////////////////////////////////////////
let g_loglv = 1; // 0~5 0 = nolog, 5 = alllog, 6 = testlog
const SetLogLV=(loglv)=>{
  g_loglv = loglv;
}

app.get('/cheat/loglv', (req,res)=>{
    loglv = req.query.lv;
    SetLogLV(loglv);
    const log = `/cheat/loglv g_loglv : ${loglv}`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/status', (req,res)=>{
    const log = GetStatusLog();
    console.log (log);
    res.send(log);
})

app.get('/cheat/printcheat', (req,res)=>{
    const tempprintcheat = !printcheat;
    const log = `printcheat = ${printcheat} to ${tempprintcheat}`;

    printcheat = tempprintcheat;

    console.log (log);
    res.send(log);
})


app.get('/info/indexdatalists', (req,res)=>{
    GetIndexdatas(req.query.db_id, req.query.ticker, req.query.startdate, req.query.enddate).then((resultdata)=>{
        // console.log(resultdata);
        res.send(resultdata);
    })
})    

app.get('/info/snapshotaccountlists', (req,res)=>{
    GetsnapshotaccountGeneral(req.query.db_id, req.query.startdate).then((resultdata)=>{
        // console.log(resultdata);
        res.send(resultdata);
    })
})

app.get('/info/accountlists', (req,res)=>{
    GetaccountGeneral().then((resultdata)=>{
        console.log(resultdata);
        res.send(resultdata);
    })
})

app.get('/info/accountrefresh', (req,res)=>{
    return new Promise((resolve, reject)=>pyutil.getaccount(req.query.db_id, (result)=>{ 
        if(result.msg1.includes('expiredperiod'))
        {        
            let usemok = true;
            if(req.query.db_id.includes('real'))
                usemok = false;
    
            Issue_access_token(req.query.db_id, usemok, ()=>{
                GetaccountGeneral().then((resultdata)=>{
                    // console.log(resultdata[req.query.db_id]);
                    res.send(resultdata[req.query.db_id]);
                    resolve();
                })
            });
        }            
        else
        {
            GetaccountGeneral().then((resultdata)=>{
                // console.log(resultdata[req.query.db_id]);
                res.send(resultdata[req.query.db_id]);
                resolve();
            })
        }
    }))
})

// app.get('/info/accountsummary', (req,res)=>{
//     GetaccountGeneral(req.query.refresh).then((resultdata)=>{
//         console.log(resultdata);
//         const log = 'accountsummary';
//         console.log (log);
//         res.send(log);
//     })
// })

// app.get('/info/accountdetail', (req,res)=>{
//     GetaccountGeneral(req.query.db_id, req.query.refresh, (resultdata)=>{
//         console.log(resultdata);

//         const log = 'accountdetail';
//         console.log (log);
//         res.send(log);
//     });
// })

// let finishinterval;
app.get('/startmaintenance', (req,res)=>{
    const dayname = req.query.dayname ? req.query.dayname : g_wwwdayname; //startmaintenance
    if(req.query.nation === 'kor')
        StartMaintenance(dayname);
    if(req.query.nation === 'naq')
        StartMaintenanceNaq(dayname);

    const log = GetStatusLog(); 
    console.log(log)
    res.send(log);
})


