const sizeof = require('object-sizeof');
const axios = require('axios');
const schedule = require('node-schedule');
// const { resolve } = require('path');
//const inquirer = require('inquirer');
const inquirer = require('inquirer');
const readline = require('readline');
const redisutil = require('./redisutil')
const consts = require('./consts');
const telegramapi = require(`./telegram`);
const {IsNaq, dbidtonation, dbidtoredisjson, GetLocalDate, GetOpenDayFormat, GetAllLocalDateStr, GetLocalDateStr, GetPassedTime, GetMarketname,
  GetStartMessage, GetUpdateMessage, GetCompleteMessage,
  ip,
  GetDayName, defulatConfig, fetchdelay, IsIndexTicker,
} = require('./util');
const {Getaccount, Fetch_price, Oldstocks, Get_my_complete, 
  Topstocklist, LoadBADB, TopstocklistBA, CheckStocksDate, Gettradestocklist, ShowTradeLog, Issue_access_token} = require('./serverpacket')
const {RealTrade, GetEndTwoDays, GetEndTwoCloses, GetStockAmount, Cacus, ProcessCoolTime, GetCloneAccount, GetCashAmount, 
  GetAllStockCapitalValue, ListToTickerDic, 
  DeleteTestUpdateDic,
  real, stockcompletedelaySec,
  GetConfig} = require('./tradeutil');
const {IsRecheadUpLimit} = require('./tradeutilcommon');
const {
  validFetchtime,
  GetStartTime,
  h07m20, h07m30, h20m10,
  hRegularfinish, hNxtfinish,
  IsMorningShortCoreTime,
} = require('./tradetimeutil');
const { init_wallet, getaccount } = require('./pythonutil');
const { func } = require('prop-types');
const {getLastSheetData, getReadySheetData, getValueSheetData} = require('./googlespreadsheet');
const globalval = require('./globalval');
const stock_defaultinfos = {
    // cointlist:{gb:'d', ticker:'xrp', market: 'coinlist'},
    stocklist:{gb:'d', ticker:'a000300', market: 'stocklist'},
    stocklistdayall:{gb:'d', ticker:'a000300', market: 'stocklist'},
    nasstocklist:{gb:'d', ticker:'ARCC', market: 'nasstocklist'},
    minute_nasstocklist:{gb:'d', ticker:'ARCC', market: 'minute_nasstocklist'},
    // japanstocklist:{gb:'d', ticker:'t4689', market: 'japanstocklist'}
  }

const defaultstock = stock_defaultinfos.stocklistdayall;

// TEST TIME
testDate = new Date();
testDate.getHours()
let teststarttime;
let teststarttime2;


// const startpreparemaintenance = 16 * 60 + 0 + 0;    // start prepare daily maintenance status
// const finishpreparemaintenance = 16 * 60 + 5 + 0;  // finish prepare daily maintenance status
// const startmaintenance = 16 * 60 + 6 + 0;          // start daily maintenance
// const finishmaintenance = 16 * 60 + 10 + 0;         // finish daily matenance

//const flaskserverurl = "http://localhost:5000/";  
const maintenanceserver = `http://localhost:${4500}`
const flaskserverurl = `http://${consts.flaskserver}/`;  
const globalCoolDelay = 500;
const globalCoolMax = 1000;
const fetchErrCoolMax = 1000 * 60;
const fetchErrCoolDelay = 500;
let g_globalCool = 0;
let g_fetchErrCool = 0;
let g_opentradeday = '';
let g_morningupdating = false;
let g_morningautoadding = 0;
let g_beforeoclockhour;
let flask_heartbeat = false;
let g_intervalval = 0;
//let clientserver_heartbeat = true;
let maintenanceserver_heartbeat = false;
let promptintervaldelay = 1000;
let stocklistup_starttime;
let g_networkerror = false;
let initwallet = false;
// const fetch_price_timeout = 5000;
const cooltimeMax = 1000 * 60 * 5; // 5 minute.
const cooltimecheckdelay = 5000;

let g_canTradeDay = false;  // 토,일, 공휴일 아닌 영업일
let g_canTradeTime = false; // 영업시간 + 영업일
let g_stocknames = [];
let g_markets = [];
let g_lastcloses = [];
let g_tradecooltimes = {};
let g_alltableupdating = 'none';
let g_forcemaintenance = 0;
const secondintervaldelayMax = 1000;

let realTradeListsCount = 0;
let realTradeLists = [];
let g_tradestocklist =[];
let g_fetchpriceCalls = [];
let g_dayname = '';

const immutrealTradeLists = [];
const gamestatusdelay = 10000;
// const processpacketbyonetime = 50;
let g_loglv = 1; // 0~5 0 = nolog, 5 = alllog, 6 = testlog
const SetLogLV=(loglv)=>{
  g_loglv = loglv;
}
//let apiserver = useState(`http://localhost:${process.env.REACT_APP_API_SERVER_PORT}`); 
let apiserver; 
let alleventtypes = [];
let eventsspecial = {};
let fetchready = false;
let fetchstatus = 0;
let account={};
const setaccount=(_account)=>{
    const oldaccount = account;
    account = _account;
    Object.entries(oldaccount).forEach(element=>{
      const ticker = element[0];
      if(ticker !== "a0" && account[ticker])
      {
        account[ticker].todayselcnt = element[1].todayselcnt;
        account[ticker].todaybuycnt = element[1].todaybuycnt;
      }
    })
    const cashamounts = GetCashAmount(account);
    console.log(`setaccount C:${cashamounts}`);
}
let autoaddstock;
const setautoaddstock=(_autoaddstock)=>{
    autoaddstock = _autoaddstock;
    AutoaddstockuseEffect()
}
let marketstate;
const setmarketstate=(_marketstate)=>{
    marketstate = _marketstate;
    // MarketstateuseEffect();
}
let marketopen;
const setmarketopen=(_marketopen)=>{
    marketopen = _marketopen;
}
let maintenance = false;
// const setmaintenance=(_maintenance)=>{
//     maintenance = _maintenance;
// }
let loworderUpdateIndex = consts.highorderCount;
const setloworderUpdateIndex=(_loworderUpdateIndex)=>{
    loworderUpdateIndex = _loworderUpdateIndex;
}
let ticker;//defaultstock.ticker;
// const setticker=async(_ticker)=>{    
//     await TickeruseEffect(_ticker);
// }
let chartdatas;
const setchartdatas=(_chartdatas)=>{
    chartdatas = _chartdatas;
}  
let minchartdatas=null;
const setminchartdatas=(_minchartdatas)=>{
    minchartdatas = _minchartdatas;
}
let minutecloseTrade=false;
const setminutecloseTrade=(_minutecloseTrade)=>{
    minutecloseTrade = _minutecloseTrade;
}
let multiminutetrade=0; 
const setmultiminutetrade=(_multiminutetrade)=>{
    multiminutetrade = _multiminutetrade;
}
let multialldaytrade=0; 
const setmultialldaytrade=(_multialldaytrade)=>{
    multialldaytrade = _multialldaytrade;
}
let market=defaultstock.market;  
const setmarket=(_market)=>{
    market = _market;
}
let gb=defaultstock.gb;
const setgb=(_gb)=>{
    gb = _gb;
}
let startdate='';
const setstartdate=(_startdate)=>{
    startdate = _startdate;
}
let enddate='';
const setenddate=(_enddate)=>{
    enddate = _enddate;
}
let servicetype='LIVE'; // DEV, LIVE  
const setservicetype=(_servicetype)=>{
    servicetype = _servicetype;
}

let db_id = '';
let port = 0;
const IsLive = () =>{
    return consts.IsKorLive(Number(port)) || consts.IsNaqLive(Number(port)) || consts.IsTestLive(Number(port)); // live거나 live 테스트
}  

const PrintMemory=(today, ...args)=>{
  if (g_loglv<6)
    return;
  const memoryUsage = process.memoryUsage();
  console.log(`Memory Usage: ${today}`);
  console.log(`RSS (Resident Set Size): ${memoryUsage.rss / (1024 * 1024)} MB`); // 프로세스가 사용하는 전체 메모리
  console.log(`Heap Total: ${memoryUsage.heapTotal / (1024 * 1024)} MB`); // 힙 메모리의 총 크기
  console.log(`Heap Used: ${memoryUsage.heapUsed / (1024 * 1024)} MB`); // 현재 사용 중인 힙 메모리
  console.log(`External: ${memoryUsage.external / (1024 * 1024)} MB`); // C++ 객체에 의해 사용하는 메모리
  
  args.forEach((arg,idx)=>{
    const size = sizeof(arg);
    console.log(`arg${idx}: ${size / (1024 * 1024)} MB`);
  })
  
}

const AutoAdd=()=>{    
    console.log(`AutoAdd ${db_id}`)
    let opendayformat = GetOpenDayFormat(defulatConfig.db_id);
    let today = opendayformat.replaceAll('-','');;
    const nation = dbidtonation(db_id)

    if(IsLive())
    {
      stocklistup_starttime = (new Date()).getTime();
      const startmsg = GetStartMessage(nation, 'ListUp');
      console.log(`${startmsg} ${GetAllLocalDateStr()}`)
      telegramapi.SendMessage(startmsg);
    }

    const stockaccounts = Object.entries(account).reduce(function(accum,current){ if (current[0] !== "a0") accum.push(`${current[0].toLowerCase()}`); return accum},[])
    globalval.accounttickerlist = stockaccounts;
    CheckStocksDate(db_id, today, opendayformat, stockaccounts, (resultmsg)=>{{
        console.log(resultmsg);
        const checkstokswait = 1000; // 마지막 종목 업데이트 요청 후 5초정도 충분히 기다렸다가 완료될쯤 다음 로직 실행한다
        console.log(`[SHOW-0]start TopstockList wait 1sec ${new Date().getMinutes()}:${new Date().getSeconds()}`)
        setTimeout(() => 
        {
          Topstocklist(today, db_id, async (sendTickers, seestockstr)=>{
            const toplists = sendTickers.reduce(function(accum,current){ accum.push(`${current.toLowerCase()}`); return accum},[]);
            g_tradestocklist = [];
            globalval.serverfetchtickerlist = stockaccounts;
            realTradeLists = stockaccounts;//Object.entries(account).reduce(function(accum,current){ if (current[0] !== "a0") accum.push(`${current[0]}`); return accum},[])
            if(defulatConfig.usetopstocklist)
            {
              realTradeLists = realTradeLists.concat(toplists);
            }
            if(defulatConfig.usepersonstocklist)      
            {
                realTradeLists = realTradeLists.concat(globalval.persontickerlist);
            }
            if(defulatConfig.usebreakoutstocklist)
            {
              realTradeLists = realTradeLists.concat(globalval.breakouttickerlist);
            }

            /////////////////
            if(!defulatConfig.stockkinds || defulatConfig.stockkinds.includes('top'))
            {
              globalval.serverfetchtickerlist = globalval.serverfetchtickerlist.concat(globalval.toptickerlist);
            }
            if(defulatConfig.stockkinds.includes('person'))
            {
              globalval.serverfetchtickerlist = globalval.serverfetchtickerlist.concat(globalval.persontickerlist);
            }
            if(defulatConfig.stockkinds.includes('breakout'))
            {
              globalval.serverfetchtickerlist = globalval.serverfetchtickerlist.concat(globalval.breakouttickerlist);
            }
            globalval.serverfetchtickerlist = Array.from(new Set(globalval.serverfetchtickerlist.map((item) => item)));
            //////////////////

            realTradeLists = Array.from(new Set(realTradeLists.map((item) => item)));
            realTradeLists.reverse();      
            realTradeListsCount = realTradeLists.length;
            console.log(`Complete TopstockList ${seestockstr}`)
            console.log(`[SHOW-1]start autoadd wait 1sec ${new Date().getMinutes()}:${new Date().getSeconds()}`)
            
            setTimeout(() => {
              console.log(`[SHOW-2]start autoadd start ${new Date().getMinutes()}:${new Date().getSeconds()}`)
              setautoaddstock(1);  
            }, 1000);
          })
        }, checkstokswait);      
      }
    })
}

let tryfetchaccumsec = 0; 
const interval_oclock_1minute=()=>{
  if(!IsLive()) return;
  
  const canfetchprice = consts.IsTestLive(Number(port)) || (!g_morningupdating && !g_networkerror && g_canTradeTime && marketopen && (g_fetchErrCool <= 0));
  if(!canfetchprice)
    return;
  const istradeboy = tradeboy==='tradeboy';
  if(istradeboy)
    return;
  if(tryfetchaccumsec > 90) // networkerror와 겹치지않게한다
  {
    const netlog = `Force Call fetchcallback tryfetchaccumsec:${tryfetchaccumsec}`;
    console.log(netlog);
    // telegramapi.Send('[FETCH LOGIC PAUSED]', netlog);   
    fetchcallback();
  }
}

const interval_oclock_heartbeat=()=>{
    if(!IsLive()) return;

    const currentdate = GetLocalDate(db_id);
    const hour = currentdate.getHours();
    const alarmhours = [2, 5, 8, 11, 14, 17, 20, 23]    

    interval_flask_heartbeat();
    interval_maintenanceserver_heartbeat();

    // heartbeat 상태를 모두 false로 만든 후 패킷 받을때까지 10초간 충분히 기다렸다가 받아둔 상태를 체크한다
    setTimeout(() => {
      g_networkerror = (!flask_heartbeat || !maintenanceserver_heartbeat);
      if(g_networkerror)
      {
        const nation = dbidtonation(db_id);
        let netlog = `${db_id} flask_heartbeat:${flask_heartbeat} maintenanceserver_heartbeat:${maintenanceserver_heartbeat}`;        
        telegramapi.SendMessageErrorMSG('[SERVER SHUTDOWN]', netlog);        
      }
    }, 1000 * 15);

    if(hour === g_beforeoclockhour) 
        return;

    if(!alarmhours.includes(hour))
        return;

    g_beforeoclockhour = hour;

    setTimeout(() => {
        let log = `${GetCurrentTime()} marketopen:${marketopen} g_canTradeTime:${g_canTradeTime}`;
        let netlog = `flaskserver:${flask_heartbeat} maintenanceserver:${maintenanceserver_heartbeat}`;
        telegramapi.SendMessage(`[HEARTBEAT] ${log} ${netlog}`);
    }, 1000 * 10);        
}

const interval_flask_heartbeat=()=>{
    flask_heartbeat = false;
    const opendayformat = GetOpenDayFormat(defulatConfig.db_id);
    const nation = dbidtonation(db_id);
    axios.get(`${flaskserverurl}checkopenday?date=${opendayformat}&nation=${nation}`).then(data=> {
        const checkopenday = data.data;
        //console.log(`[flask heart beat] opentradeDay : ${checkopenday}`);
        flask_heartbeat = true;

        if(g_opentradeday !== checkopenday)
        {
          g_opentradeday = checkopenday;
          console.log(`OpenDay : ${g_opentradeday}`);
        }
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

const interval_maintenanceserver_heartbeat=()=>{
    let log = `maintenanceserver HEARTBEAT ${GetCurrentTime()} marketopen:${marketopen} g_canTradeTime:${g_canTradeTime}`;
    //console.log(log);

    maintenanceserver_heartbeat = false;
    axios.get(`${maintenanceserver}/heartbeat?db_id=${db_id}&port=${port}`).then(res=>{
        //console.log('maintenanceserver TEST COMPLETE');
        let log = `maintenanceserver HEARTBEAT ${GetCurrentTime()}`;
        //console.log(log);
        maintenanceserver_heartbeat = true;      
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

const PrintTradingLogAndAccount=async()=>{
  const _chatid = defulatConfig.ismock ? consts.paperchatid : consts.realchatid;

  todaydate = new Date();
  const r = await ShowTradeLog(db_id, todaydate);
  console.log(r);
  telegramapi.SendMessage(r, '', _chatid);

  const acclog = `${LogTotalAccount()}${FilteredLogAccount()}`;
  telegramapi.SendMessage(acclog, '', _chatid);
  console.log(acclog);
}

const CreateGameStatusJob=()=>{          
  const delayupdateminute =
    consts.IsMainFetchBoy(defulatConfig.port, defulatConfig.fetchboy) ? 0:
    consts.IsMainFetchBoy(defulatConfig.port, defulatConfig.fetchboy) ? 25 :
    28; 
    // tradeboy==='tradeboy' ? 30 : 0;

  const MorningPrepare1=()=>{
    if(IsLive() && g_canTradeDay)
    {
      console.log(`${GetCurrentTime()} [MORNING-0] prepare ${marketstate}`);
      g_morningautoadding = 0;        
      fetchready = false;
      setloworderUpdateIndex(consts.highorderCount);
      setmarketstate(0);
      redisutil.Initredis(dbidtoredisjson(db_id));
      interval_flask_heartbeat(); // 오늘 openday인지 알아온다
    }
  }
        
  // 07:30 main fetchserver
  // 07:55 sub fetchserver
  // 07:58 trader
  const MorningPrepare2=()=>{
    if(IsLive() && g_canTradeDay)
    { 
      console.log(`${GetCurrentTime()} [MORNING-1] start clear & addstocks ${marketstate}`);       
      initwallet = false;        
      g_morningautoadding = 1;
      
      GetSetAccount(()=>{
        console.log(`XXX fetchboy:${fetchboy=='fetchboy'} IsNaq:${IsNaq(db_id)} port:${defulatConfig.port} fetchboy:${defulatConfig.fetchboy} IsMainFetchBoy:${consts.IsMainFetchBoy(defulatConfig.port, defulatConfig.fetchboy)} IsSubFetchBoy:${consts.IsSubFetchBoy(defulatConfig.port, defulatConfig.fetchboy)}`);
        if(fetchboy=='fetchboy' && (IsNaq(db_id) || consts.IsMainFetchBoy(defulatConfig.port, defulatConfig.fetchboy))) // 패치보이일때 미국이거나 mainfetchboy만 장 시작전 추가점검 진행.
        {  
          AutoAdd();
        }else 
        {
          // tradeboy거나 서브(느린) fetchboy는 메인에서 받아온다
          
          globalval.clientfetchtickerlist = [];
          globalval.persontickerlist = [];
          globalval.breakouttickerlist = [];
          globalval.excelvalues = '';
          globalval.sheets = null;
          globalval.sheetList = null;
          g_tradestocklist = [];
          GetSetTradeStockList();
        }
      })
    }
  }
  
  // 15시 50분~16시 사이에 장 정리 해준다
  const MorningPrepare3=()=>{
    if(IsLive() && g_canTradeDay)
    {        
      if(initwallet)
      {
        console.log(`${GetCurrentTime()} clear system sync initwallet : ${initwallet} marketstate ${marketstate}`);          
        GetSetAccount();
        initwallet = false;       
        g_canTradeTime = false;
        fetchready = false;
        setloworderUpdateIndex(consts.highorderCount);
        g_tradestocklist.forEach(tradestock=>{
          tradestock.getpricecount = 0;
          tradestock.firstgetprice = 0;
          tradestock.firstbuytriedclose = 0;
          tradestock.breakoutsafetyshortlv = 0;
          tradestock.odno = null;
          tradestock.faildiscount = null;
          tradestock.failreasonS = null;
        })
        g_tradestocklist = [];
        
        redisutil.Initredis(dbidtoredisjson(db_id));
      }
    }      
  }

  const SaveWallet=()=>{
    const istradeboy = tradeboy==='tradeboy';
    if(IsLive() && g_canTradeDay && istradeboy)
    {
      Getaccount(db_id);
      log = `[SAVE WALLET] ${db_id} ${GetCurrentTime()}`;
      console.log(log);
      const _chatid = defulatConfig.ismock ? consts.paperchatid : consts.realchatid;
      telegramapi.SendMessage(log, '', _chatid);
    }
  }

  const FinishTrade=async()=>{
    const istradeboy = tradeboy==='tradeboy';
    if(IsLive() && g_canTradeDay && istradeboy)
      await PrintTradingLogAndAccount();
        
    globalval.accounttickerlist = [];
    globalval.personstocklist = [];
    globalval.persontickerlist = [];
    globalval.breakouttickerlist = [];
    globalval.successpersonstocklist = [];
    globalval.toptickerlist = [];
    globalval.serverfetchtickerlist = [];
    globalval.persontickerlist = [];
    globalval.excelvalues = '';
    globalval.sheets = null;
    globalval.sheetList = null;
    g_tradestocklist = [];
  }

  const RegularFinishTrade=async()=>{
    const istradeboy = tradeboy==='tradeboy';
    if(IsLive() && g_canTradeDay && istradeboy)
      await PrintTradingLogAndAccount();
  }

  const ruleinfos = [
    {'time':h07m20, 'callback':MorningPrepare1},
    {'time':h07m30+delayupdateminute, 'callback':MorningPrepare2},
    {'time':h20m10, 'callback':SaveWallet},
    {'time':hRegularfinish, 'callback':RegularFinishTrade},
    {'time':hNxtfinish, 'callback':FinishTrade},
    {'time':hNxtfinish+20, 'callback':MorningPrepare3},   
  ]

  // 8시 5분전 서브패처 리셋
  // 8시 2분전 트레이더 리셋
  
  ruleinfos.forEach(ruleinfo=>{
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(ruleinfo.time/60);
    rule.minute = ruleinfo.time - (rule.hour * 60);
    rule.tz = IsNaq(db_id) ? 'US/Eastern': 'Asia/Seoul';        
    
    const gamestatusjob = schedule.scheduleJob(rule, function(){          
      ruleinfo.callback();
    });
  })
 }

 const GetSetTradeStockList=async()=>{
  console.log(`GetSetTradeStockList 1`); // DELETE TEST
  const r = await Gettradestocklist(db_id);
  if(r===null)
    return;
  console.log(`GetSetTradeStockList 2 ${r.data.length}`);// DELETE TEST
  //////////////////////////////////////////////////////////////////////
  // usepersonstocklist 인경우 account종목, 엑셀관리 종목만 뽑아온다
  // 아닌 경우 account종목, topstocklist 종목만 뽑아온다.  
  //if(consts.IsSubFetchBoy(defulatConfig.port, defulatConfig.fetchboy))
  //{
    r.data.forEach((stockinfo,index)=>{
      stockinfo.isfetchticker=true;
      stockinfo.order=index+1;
    });
  //}

  console.log(`GetSetTradeStockList 3`);
  const accountlst = await Getaccount(db_id);
  let tmptradelist = Object.entries(accountlst).reduce(function(accum,current){ 
    const ticker = current[0].toLowerCase();
    if(ticker != 'a0')
    {
      accum.push(`${ticker}`); 
    
      if(!r.data.find(item=>item.ticker == ticker))
      {
        const errorlog = `${defulatConfig.db_id} didn't receive ${current[1].name}(${ticker}) from server!!! can't trade this stock!!!`;
        console.error(errorlog);
        // telegramapi.SendMessageErrorMSG('[ERROR]', errorlog);
      }
    }
    return accum;
  },[]);
  globalval.accounttickerlist = tmptradelist;

  // let tmptradelist = accountlst;
  // r.data.forEach((stockinfo,index)=>{
  //   stockinfo.isfetchticker=true;
  //   stockinfo.order=index+1;
  // });
  
  console.log(`GetSetTradeStockList 4`);
  const getToplistAsync = (today, db_id, Awaitfunc) => {
    return new Promise((resolve, reject) => {
      Awaitfunc(today, db_id, (sendTickers, seestockstr) => {
          const toplists = sendTickers.reduce(function(accum,current){ accum.push(`${current.toLowerCase()}`); return accum},[]);  
          resolve(toplists); // 필요한 데이터만 resolve
        });
        // *주의: Topstocklist에서 reject가 발생할 여지가 있다면 처리 로직 추가 필요
    });
  };
  console.log(`GetSetTradeStockList 5`);
  let opendayformat = GetOpenDayFormat(defulatConfig.db_id);
  let today = opendayformat.replaceAll('-','');

  // base topstocklist
  if(!defulatConfig.stockkinds || defulatConfig.stockkinds.includes('top'))
  {
    const topstocklist = await getToplistAsync(today, db_id, Topstocklist);
    tmptradelist = tmptradelist.concat(topstocklist);  
  }
  console.log(`GetSetTradeStockList 6`);
  // google stocklist
  if(defulatConfig.stockkinds.includes('person'))
  {
    if(!globalval.persontickerlist || !globalval.persontickerlist.length)
    {
      await getReadySheetData();
      await getValueSheetData();
      await getLastSheetData();
    }
    tmptradelist = tmptradelist.concat(globalval.persontickerlist);  
  }
  console.log(`GetSetTradeStockList 7`);
  // breakout yesterday stocklist
  if(defulatConfig.stockkinds.includes('breakout'))
  {
    if(!globalval.breakouttickerlist || !globalval.breakouttickerlist.length)
    {
      await getReadySheetData();
      await getValueSheetData();
      await LoadBADB('make');
      // await getToplistAsync(today, db_id, LoadBADB);
    }
    console.log(`GetSetTradeStockList.breakouttest1 ${tmptradelist.length} to ${globalval.breakouttickerlist.length}`);  
    tmptradelist = tmptradelist.concat(globalval.breakouttickerlist);
    
    // db에서 직전 topstocklist 가져온다   
  }

  console.log(`GetSetTradeStockList.breakouttest2 ${defulatConfig.stockkinds}`);  
  
  
  // 중복 제거
  tmptradelist = Array.from(new Set(tmptradelist.map((item) => item)));
  
  // 1. listA를 Set으로 변환하여 검색 속도를 높입니다.
  const setA = new Set(tmptradelist);

  // 2. listB를 순회하면서 setA에 존재하는 요소만 필터링합니다.
  const intersection = r.data.filter(element => setA.has(element.ticker));
  tmptradelist = intersection;
  g_tradestocklist = tmptradelist;

  g_tradestocklist.forEach(tradestock=>{
    tradestock.getpricecount = 0;
    tradestock.firstgetprice = 0;
    tradestock.firstbuytriedclose = 0;
    tradestock.breakoutsafetyshortlv = 0;
    tradestock.odno = null;
    tradestock.faildiscount = null;
    tradestock.failreasonS = null;
    tradestock.chartdatas.forEach(chartdata=>{
      chartdata.date = new Date(chartdata.date);
    })
  })
  
  if(consts.IsSubFetchBoy(defulatConfig.port, defulatConfig.fetchboy))
  {
    if(fetchdb === 'redis' && fetchboy === 'fetchboy')
      MakefetchpriceCalls(1);
  }
}

async function GetSetAccount(Callback){
    initwallet = true;
    const r = await Getaccount(db_id);
    let newdate = GetLocalDate(db_id);
    
    const isAllOdnoNull = g_tradestocklist.every(item => item.odno == null);
    console.log(`GetSetAccount isAllOdnoNull:${isAllOdnoNull} ${newdate}\r\n${JSON.stringify(r)}`)

    if(isAllOdnoNull)
      setaccount(r);
    else
    {
      telegramapi.SendMessageErrorMSG('[WARNING GetSetAccount]', `isAllOdnoNull : ${isAllOdnoNull}`);
    }
    
    if(Callback)
      Callback()
}

function ResetCooltime(coolticker, failtime = 0)
{
  // 매매 요청 응답 받은 후 성공이면 해당 주식 5분간 매매 시도 안함
  if(coolticker)
  {
    if(failtime === 0)
      g_tradecooltimes[coolticker] = cooltimeMax;
    else
      g_tradecooltimes[coolticker] = failtime;
    //console.log(`${coolticker} cool start ${cooltimeMax}`)

    //ResetODNO(coolticker, odno);
  }  
  // 매매 시도 직후 globalcooltime 가동, 모든 주식 1초간 거래 시도 안함
  else
  {
    g_globalCool = globalCoolMax;
    //console.log(`golbal cool start ${globalCoolMax}`)
  }
}

testval = 0
let canrealtrade = false;
// 여기로 들어오는 open, high, low는 당일기준 시가 최고 최저 이다
const CallBackTrade=(tradestock, close, open, high, low, volume,x1,x2,caful,warn)=>{
  tradestock.latestclose = close;//g_lastcloses[tradestock.ticker];
  tradestock.chartdatas[tradestock.chartdatas.length-1].close = close;
  tradestock.chartdatas[tradestock.chartdatas.length-1].open = open;
  tradestock.chartdatas[tradestock.chartdatas.length-1].high = high;
  tradestock.chartdatas[tradestock.chartdatas.length-1].low = low;
  tradestock.chartdatas[tradestock.chartdatas.length-1].volume = volume;
  tradestock.chartdatas[tradestock.chartdatas.length-1].caful = caful;
  tradestock.chartdatas[tradestock.chartdatas.length-1].warn = warn;
  tradestock.chartdatas[tradestock.chartdatas.length-1].date = GetLocalDate(db_id)
  tradestock.curchartdataidx = tradestock.chartdatas.length-1;     
  Cacus(tradestock.chartdatas);
  if(g_loglv>=5)
    console.log(`tval-s : ${tradestock.order} ${tradestock.ticker} ${tradestock.name} ${tradestock.latestclose} ${GetEndTwoDays(tradestock)}`);
  //if(!fetchready && g_tradestocklist[g_tradestocklist.length-1].order === tradestock.order)
  // if(!fetchready && g_tradestocklist.every(element=>element.latestclose))
  
  if (!fetchready && g_tradestocklist.every(e => !/^\d+$/.test(e.ticker.slice(1)) || IsIndexTicker(e.ticker) || e.latestclose)) 
    fetchready = true;

  canrealtrade = consts.IsTestLive(Number(port)) || (marketopen && g_canTradeTime && initwallet && fetchready)
  if(canrealtrade && g_globalCool <= 0)
  {     
    const tradestockdic = ListToTickerDic(g_tradestocklist);
    canrealtrade = true;
    const isPlayingCool = IsTickerCool(tradestock.ticker);
    RealTrade(false, apiserver, isPlayingCool, tradestock.chartdatas.length - 1, tradestock, account, tradestockdic, db_id, '', null, ResetCooltime, setaccount);        
  }
}

function MakefetchpriceCalls(callno){
    const canfetchprice = consts.IsTestLive(Number(port)) || (!g_morningupdating && !g_networkerror && g_canTradeTime && marketopen && (g_fetchErrCool <= 0));
    
    if(g_loglv>=10)
    {
      console.log(`MakefetchpriceCalls start no:${callno} canfetchprice:${canfetchprice} g_fetchpriceCalls:${g_fetchpriceCalls.length} clientfetchtickerlist:${globalval.clientfetchtickerlist.length}`)
      console.log(`${LogStatus(true)}`);
    }
    if(!canfetchprice)
    {
      console.log (`can not! fetchprice ${LogStatus(true)}`)

      // 5번 ( 장오픈 ) 으로 들어온경우 콜백까지호출. 
      if(callno != 5)
      {
        console.log(`MakefetchpriceCalls return1 callno.${callno} ${canfetchprice}`);
        return;

      }
    }

    // 버퍼 너무 많이 쌓이지않게 컨트롤
    if(g_fetchpriceCalls.length > 500)
    {
      g_fetchpriceCalls = [];
      console.log('buffer is overflow 500 count. clear');
    }

    // focus out => focus on 되면서 누적된걸 한꺼번에 더 쌓으려는걸 막는다
    // if(g_fetchpriceCalls.length > 100)
    //   return;
    // 버퍼 모두 비우고 추가한다
    if(g_fetchpriceCalls.length > 0 || fetchstatus !== 0) 
    {
      console.log(`MakefetchpriceCalls return2 callno.${callno} ${g_fetchpriceCalls.length} ${fetchstatus}`);
      return;
    }
    const issubfetchboy = consts.IsSubFetchBoy(defulatConfig.port, defulatConfig.fetchboy);
    if(g_tradestocklist.length === 0)
    {
      if(issubfetchboy && (globalval.clientfetchtickerlist.length == 0))
        GetSetTradeStockList();

      console.log(`MakefetchpriceCalls return3 callno.${callno} ${g_tradestocklist.length}`);
      return;
    }

    // subfetchboy 는 장초반 매도가 중요하다. 장초반 ( 8시부터 9시5분까지 ) 매수없이 빠르게 보유종목 매도만 한다.
    const ismorningshortcoretime = issubfetchboy && IsMorningShortCoreTime();
    let lastpushed = 0;
    let validfetchcnt = 0;
    g_tradestocklist.forEach((tradestock)=>{
      if(tradestock.isfetchticker)
        ++validfetchcnt;
      const canfetch = !ismorningshortcoretime || Object.entries(account).find(element=>element[0]===tradestock.ticker && element[1].amount > 0);
      if(stock_defaultinfos.stocklist.ticker !== tradestock.ticker && tradestock.isfetchticker && canfetch)
      {
        // wallet 포함 상위 60개는 무조건 push.
        // 하위 200개는 돌아가며 10개씩 처리.
        if(
          // (tradestock.order <= consts.highorderCount) || 
          // (tradestock.order >= loworderUpdateIndex && (tradestock.order < (loworderUpdateIndex + defulatConfig.loworderprocessCount))))
          (tradestock.order >= loworderUpdateIndex && (g_fetchpriceCalls.length < defulatConfig.loworderprocessCount)))
        {
          g_fetchpriceCalls.push({
            tradestock:tradestock,
            CallBack:CallBackTrade,
          })
          lastpushed = tradestock.order;
          if(g_loglv>=5)
            console.log(`tval-q : O ${tradestock.order} ${tradestock.ticker} ${tradestock.name} ${tradestock.latestclose} ${GetEndTwoDays(tradestock)}`);
        }
        else{
          if(g_loglv>=10)
            console.log(`tval-q : X ${tradestock.order} ${tradestock.ticker} ${tradestock.name} ${tradestock.latestclose} ${GetEndTwoDays(tradestock)} lo:${loworderUpdateIndex} clo:${defulatConfig.loworderprocessCount} `);
        }
      }
    })
    if(g_loglv>=5)
        console.log(`tval-q LENGTH : ${g_fetchpriceCalls.length} / ${validfetchcnt}`);
    
    
    // let firststock = g_fetchpriceCalls && g_fetchpriceCalls[0] ? g_fetchpriceCalls[0].tradestock : null;
    // let laststock = g_fetchpriceCalls && g_fetchpriceCalls[g_fetchpriceCalls.length-1] ? g_fetchpriceCalls[g_fetchpriceCalls.length-1].tradestock : null;
    // let firststockinfo = `${GetEndTwoDays(firststock)} ${GetEndTwoCloses(firststock)}`;
    // let laststockinfo = `${GetEndTwoDays(laststock)} ${GetEndTwoCloses(laststock)}`;
    // console.log(`O ${GetAllLocalDateStr()} ${canrealtrade?`O-${g_globalCool}s`:`X-${g_globalCool}s`} P:${port} [${(firststock.order+1).toString().padStart(3, '0')}]${firststock.ticker}:${firststockinfo}~[${(laststock.order+1).toString().padStart(3, '0')}]${laststock.ticker}:${laststockinfo} ${LogStatus()}`);
    
    let temploworderUpdateIndex = 0;
    const lastorder = g_tradestocklist[g_tradestocklist.length-1];
    if(lastpushed >= lastorder) // 이번 턴에서 마지막으로 추가한 order가 관리종목중 마지막 항목이라면, 다음부턴 0에서 시작하고 아니면 +1 한다.
    {
      temploworderUpdateIndex = consts.highorderCount;
    }
    else{
      temploworderUpdateIndex = lastpushed+1;
    }
    // if(temploworderUpdateIndex > g_tradestocklist.length)
    // {
    //   temploworderUpdateIndex = consts.highorderCount;
    // }      
    setloworderUpdateIndex(temploworderUpdateIndex);

    if (fetchdb === 'redis' && fetchboy === 'fetchboy')
    {
      fetchcallback();
    }
}

const LogStatus=(isdetail)=>{
  if (isdetail)
    return `<br>F[morningupdating:${g_morningupdating} networkerror:${g_networkerror}] 
  T[marketopen:${marketopen} canTradeTime:${g_canTradeTime} initwallet:${initwallet} fetchready:${fetchready}] 
  [fetchErrCool:${g_fetchErrCool} intervalval:${g_intervalval} fetchstatus:${fetchstatus}]`
  else
    return `F[${g_morningupdating} ${g_networkerror}] T[${marketopen} ${g_canTradeTime} ${initwallet} ${fetchready}] EC:${g_fetchErrCool} INTV:${g_intervalval} FS:${fetchstatus}]`
}

const LogDefines=()=>{
  return JSON.stringify(defulatConfig);
}

const LogTotalAccount=()=>{
  const cashamounts = GetCashAmount(account);
  const stockscapital = GetAllStockCapitalValue(account, ListToTickerDic(g_tradestocklist));
  const substr = `${cashamounts+stockscapital}=C:${cashamounts}+S:${stockscapital}`;
  return `${substr}\n`;
}

const FilteredLogAccount=()=>{
    const stockdic = ListToTickerDic(g_tradestocklist);
    // 1. 객체의 키(ticker)와 값(종목 정보 객체)을 [ticker, {..}] 형태의 배열로 변환
    const data = account;
    let entries = Object.entries(data);
    entries = entries.filter(entry=>entry[0] != 'a0');
    // 2. 각 항목에서 ticker와 name을 추출하여 "ticker: name" 형태의 문자열로 변환
    const tickerNameList = entries.map(([ticker, item]) => {
        const stockinfo = stockdic[ticker];  
        const curprice = stockinfo ? stockinfo.latestclose : 0;
        const buyprice = item ? Number(item.averagebuyprice) : 0;
        const amount = item ? Number(item.amount) : 0;
        const name = (stockinfo && item) ? item.name : `${item ? item.name : 'NOITEM'}(${ticker}) HAS NO ACCOUNT!!`
       let blackrate = (((curprice - buyprice) / buyprice) * 100).toFixed(1);
       const blacklatestr = blackrate>0 ? `+${blackrate}`: blackrate;
       return `${ticker} (${name}) ${curprice}X${amount}=${curprice*amount} ${blacklatestr}%`;
    });

    return tickerNameList.join('\n');
}

const LogAccount=()=>{
  // const cashamounts = GetCashAmount(account);
  // const stockscapital = GetAllStockCapitalValue(account, ListToTickerDic(g_tradestocklist));
  // const substr = `${cashamounts+stockscapital}=C:${cashamounts}+S:${stockscapital}`
  return `${JSON.stringify(account)}`
}

const LogStockList=()=>{
  loglist = g_tradestocklist.reduce((accum, curr)=>{
    const isfetchticker = curr.isfetchticker;
    const foundacc = Object.entries(account).find(element=>element[0]===curr.ticker && element[1].amount > 0);
    let foundaccstr = foundacc ? `[A]${foundacc[1].amount}` : '';
    foundaccstr = isfetchticker ?  `[F]${foundaccstr}` : foundaccstr;
    accum.push ( `${GetEndTwoDays(curr)} ${curr.latestclose} ${curr.ticker} ${curr.name} ${curr.order} ${foundaccstr}` )
    return accum;
  },[])
  
  const joinedstr = loglist.join(`<br>`);
  return `LEN:${g_tradestocklist.length}<br>` + joinedstr;
}

const RawStockList=(stockkinds)=>{
  let filtertickerlist = globalval.accounttickerlist;
  if(g_loglv>=10)
  {
    console.log('accounttickerlist');
    console.log(filtertickerlist.map(filterticker=>filterticker.ticker));
  }

  if(!stockkinds)
  {
    filtertickerlist = filtertickerlist.concat(globalval.toptickerlist);
  }
  else
  {
    if(stockkinds.includes('top'))
    {
      filtertickerlist = filtertickerlist.concat(globalval.toptickerlist);
    }
    if(stockkinds.includes('person'))
    {
      filtertickerlist = filtertickerlist.concat(globalval.persontickerlist);
    }
    if(stockkinds.includes('breakout'))
    {
      filtertickerlist = filtertickerlist.concat(globalval.breakouttickerlist);
    }
  }
  filtertickerlist = Array.from(new Set(filtertickerlist.map((item) => item)));

  return g_tradestocklist.filter(item => filtertickerlist.includes(item.ticker)).map(item=>{return item;})
  // return g_tradestocklist;
}

const fetchcallback=()=>{
  const FinallyCall=()=>{
    ///// OLD VERSION
    if(fetchdb !== 'redis' && fetchboy !== 'fetchboy')
    {
        // 매매
        callbacks.forEach((callback, index)=>{
          const lateststock = lateststocks.find(laststock=>laststock.code === tradestocks[index].ticker || laststock.code.toUpperCase() === tradestocks[index].ticker)
          if(lateststock)
          {
            callback(tradestocks[index], lateststock.close, lateststock.open, lateststock.high, lateststock.low, lateststock.value);                    
          }
          else
          {
            console.log('fetcherror!!!!');
          }
        })
    }
    ///////////////////

    ///// NEW VERSION
    fetchstatus = 0;
    tryfetchaccumsec = 0;

    if (fetchdb == 'redis' && fetchboy === 'fetchboy')
    {
      MakefetchpriceCalls(2);
    }
    ///////////////////
  }

  if(fetchstatus !== 0)
  {
      console.log(`fetchcallback return ${fetchstatus}`);
      return;
  }
    
  if(g_fetchpriceCalls.length > 0)
  {
    const fetchpriceCalls = g_fetchpriceCalls.splice(0,defulatConfig.loworderprocessCount);
    const tickers = fetchpriceCalls.reduce(function(accum,cur){accum.push(cur.tradestock.ticker);return accum},[]);
    const markets = fetchpriceCalls.reduce(function(accum,cur){accum.push(cur.tradestock.market);return accum},[]);
    const tradestocks = fetchpriceCalls.reduce(function(accum,cur){accum.push(cur.tradestock);return accum},[]);
    const callbacks = fetchpriceCalls.reduce(function(accum,cur){accum.push(cur.CallBack);return accum},[]);
    fetchstatus = 1;
    fetch_price(tickers, markets, (lateststocks)=>{
      //const filteredStocks = lateststocks.map(({ code, close }) => ({ code, close }));
      // redisutil.SetStockPrices(dbidtonation(db_id), filteredStocks);
      FinallyCall();
    })
  }
  else
  {
    FinallyCall();
  }
}

const MarketTrade=async()=>{
  if( !(consts.IsTestLive(Number(port)) || (g_canTradeTime && marketopen && !g_morningupdating && !g_networkerror)) )
    return;

  const r = await redisutil.GetStockPrices(dbidtoredisjson(db_id)); 
  if(Object.keys(r).length === 0)
    return;

  if(g_tradestocklist.length === 0 )
  {
    if(globalval.clientfetchtickerlist.length == 0)
      await GetSetTradeStockList();

    if(g_tradestocklist.length === 0)   
      return;
  }
    
  const datalen = (Object.entries(r)).length;
  if(datalen === 0)
    return;
  Object.entries(r).forEach((element,index)=>{
    // o h l c accumval accumvol ratevol

    // const latestclose = parseFloat(element[1]);
    const key = element[0]; 
    const vals = JSON.parse(element[1]);
    const [o,h,l,c,vol,x1,x2,caful,warn] = vals;
    // const h = parseFloat(vals[1]);
    // const l = parseFloat(vals[2]);
    // const c = parseFloat(vals[3]);
    // const vol = parseFloat(vals[5]);
    const tradestock = g_tradestocklist.find(trstock=>trstock.ticker === key)
    if(tradestock)
    {
      const beforeelement = tradestock.chartdatas[tradestock.curchartdataidx-1];
      const reacheduplimit = defulatConfig.usebreakouttrade && tradestock.chartdatas && beforeelement && IsRecheadUpLimit(beforeelement.close, c);
      if(tradestock.latestclose !== c || reacheduplimit) // 갱신이 필요한 경우에만 갱신 (1.이전값과 다름, 2.브아의 경우 28프로 이상이면 같더라도 계속 시도)
        CallBackTrade(tradestock, c, o, h, l, vol,x1,x2,caful,warn);
    }
    // if(datalen-1 === index)
    //   console.log('hello');
  })

  
  // g_fetchpriceCalls.forEach((callback, index)=>{
  //   const lateststock = lateststocks.find(laststock=>laststock.code === tradestocks[index].ticker || laststock.code.toUpperCase() === tradestocks[index].ticker)
  //   if(lateststock)
  //   {
  //     callback(tradestocks[index], lateststock.close, lateststock.open, lateststock.high, lateststock.low, lateststock.value);                    
  //   }
  //   else
  //   {
  //     console.log('fetcherror!!!!');
  //   }
  // })
  
  // callbacks.forEach((callback, index)=>{
  //   const lateststock = lateststocks.find(laststock=>laststock.code === tradestocks[index].ticker || laststock.code.toUpperCase() === tradestocks[index].ticker)
  //   if(lateststock)
  //   {
  //     callback(tradestocks[index], lateststock.close, lateststock.open, lateststock.high, lateststock.low, lateststock.value);                    
  //   }
  //   else
  //   {
  //     console.log('fetcherror!!!!');
  //   }
  // })
}

const tradeboy = defulatConfig.tradeboy; 
const fetchdb = defulatConfig.fetchdb;
const fetchboy = defulatConfig.fetchboy;
const ismock = defulatConfig.ismock;
const tradedelay={
  // big:ismock ? 20000:20000, 
  small:ismock ? fetchdelay: fetchdelay};

const ExecuteTrade=async(debugport, debug_db_id, debug_self_trade)=>{
    port = debugport;
    db_id = debug_db_id;

    const SetLocalise=()=>{
      
      setmarket(GetMarketname(db_id, 'm'));
    }
    const StartTrade=()=>{

        setstartdate('2014-01-01');
        interval_flask_heartbeat(); // 오늘 openday인지 알아온다
        SetLocalise();
        telegramapi.SetPrevMSG(db_id);
        
        console.log(`StartTrade ${consts.IsTestLive(Number(port))} ${IsLive()}`)
        if(IsLive())
        {
          redisutil.Initredis(dbidtoredisjson(db_id));
        
          GetSetAccount(()=>{
            if(consts.IsTestLive(Number(port)) || IsLive())
            {
              console.log(`XXX fetchboy:${fetchboy=='fetchboy'} IsNaq:${IsNaq(db_id)} port:${defulatConfig.port} fetchboy:${defulatConfig.fetchboy} IsMainFetchBoy:${consts.IsMainFetchBoy(defulatConfig.port, defulatConfig.fetchboy)} IsSubFetchBoy:${consts.IsSubFetchBoy(defulatConfig.port, defulatConfig.fetchboy)}`);
              if(fetchboy=='fetchboy' && (IsNaq(db_id) || consts.IsMainFetchBoy(defulatConfig.port, defulatConfig.fetchboy))) // 패치보이일때 미국이거나 mainfetchboy만 장 시작전 추가점검 진행.
              {  
                AutoAdd();
              }else
              {
                GetSetTradeStockList();
              }
            }       
          })
        }

        setInterval(() => {
          UpdateCanTradeTime();
          ++g_intervalval;

          ++tryfetchaccumsec;  
          if(g_loglv >= 2)
          {
            console.log(`tryfetchaccumsec:${tryfetchaccumsec}`); 
          }
        }, 1000);

        // fetchprice 에러 발생시 1분동안 재요청 안하기 위한 로직
        setInterval(()=>{
          if(g_fetchErrCool > 0)
          {
            if(g_fetchErrCool % 5 * 1000 === 0)
              console.log(`can't fetchprice because error durring ${g_fetchErrCool/1000}s`);

            g_fetchErrCool -= fetchErrCoolDelay;
            if(g_fetchErrCool <= 0)
            {
                console.log('restart fetchprice Call MakefetchpriceCalls');
                MakefetchpriceCalls(3);
                fetchstatus = 0;  
            }

          }
          else if(g_fetchErrCool < 0)
          {
              g_fetchErrCool = 0;
          }    
        }, fetchErrCoolDelay)      
        
        // setInterval(()=>{
        //   if(!PlayingListup())
        //   {
        //       interval_game_status();
        //   }
        // }, gamestatusdelay) 
        
          
        let xlogcount = 0;
        const xlogdelay = 60;
        const fetchlistdelay = xlogdelay *  1000;
        setInterval(()=>{
          if(PlayingListup())
            return;
          const currentdate = GetLocalDate(db_id);
          const hour = currentdate.getHours();
          const minute = currentdate.getMinutes();
          const curminute = hour * 60 + minute;
          
          // xlogcount += fetchlistdelay;
          const valid = consts.IsTestLive(Number(port)) || (g_canTradeTime && marketopen && !g_morningupdating && !g_networkerror);
          
          if(consts.IsTestLive(Number(port)) || (g_canTradeTime && marketopen && !g_morningupdating && !g_networkerror))
          { 
            if (fetchdb !== 'redis')          
              MakefetchpriceCalls(4);
          }
          if(IsLive()) 
            console.log(`${valid?'O':'X'} ${GetAllLocalDateStr()} ${curminute} ${LogStatus()} P:${port} ${g_dayname} ${g_intervalval}`)
        }, fetchlistdelay);
        

        // if(!ismock)
        if(IsLive())
        {
          // 5분에 한번씩 heartbeat
          const job5min = schedule.scheduleJob('*/5 * * * *', interval_oclock_heartbeat);     
          const job1min = schedule.scheduleJob('*/1 * * * *', interval_oclock_1minute);               
          // 툴 켜지면 로그 출력
          console.log(`Live Trader Start Message`);

          // 9시에 마켓 시작 처리
          const rule = new schedule.RecurrenceRule();
          const runtime = GetStartTime();
          rule.hour = parseInt(runtime/60);
          rule.minute = runtime - (rule.hour * 60) + (IsNaq(db_id) ? 30 : 0);
          rule.tz = IsNaq(db_id) ? 'US/Eastern': 'Asia/Seoul';        
          const jobOpenMarketGetAccount = schedule.scheduleJob(rule, function(){          
            GetSetAccount(()=>{
              const nation = dbidtonation(db_id);          
              const openmarketlog = `${nation} trader start!`
              const getsetaccountlog = `MARKET START TIME GetSetAccount complete ${openmarketlog} ${GetAllLocalDateStr()}`;
              console.log(getsetaccountlog)
              telegramapi.SendMessage(getsetaccountlog);

              if(fetchdb === 'redis' && fetchboy === 'fetchboy')
              {
                UpdateCanTradeTime();
                MakefetchpriceCalls(5);
              }
            })
            
          });
        }

        console.log('CreateGameStatusJob 툴 켜질때 한번 실행')
        CreateGameStatusJob();

        const get_complete=async()=>{
          for (let tradestock of g_tradestocklist)
          {
            const odno = tradestock.odno;
            const ticker = tradestock.ticker;
            const name = tradestock.name;
            if(!tradestock.chartdatas || !odno || odno === 'reqbuy' || odno === 'reqsel')
              continue;

            const sell_buy_dvsn = tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort.includes('SHORT') ? '01' : '02';     
            const macdlongshort = tradestock.chartdatas[tradestock.chartdatas.length-1].macdlongshort;         
            await new Promise((resolve) => 
              Get_my_complete(db_id, odno, sell_buy_dvsn, macdlongshort, (result)=>{
                  if(result.rt_cd === '0') // rmn_qty
                  {
                      tradestock.tot_ccld_qty = result.tot_ccld_qty;
                      if(result.ord_qty === result.tot_ccld_qty && result.rmn_qty === '0')
                      {
                          let copyaccount = GetCloneAccount('complete', account, ticker, name, result.sll_buy_dvsn_cd, result.avg_prvs, result.ord_qty, result.tot_ccld_amt, '');
                          const cashamounts = GetCashAmount(copyaccount);
                          const stockscapital = GetAllStockCapitalValue(copyaccount, ListToTickerDic(g_tradestocklist));
                          tradestock.odno = null;
                          tradestock.faildiscount = null;
                          tradestock.failreasonS = null;
                          let addlog = '';//'서버 정보로 계좌리셋. because 체결완료 후 체결중인 종목 없음';
                          
                          setaccount(copyaccount);
                          
                          const log = `${name}(${ticker}) ${result.sll_buy_dvsn_cd==='01'?'SHORT':'LONG'} 체결완료 \r\n${result.tot_ccld_amt}=${result.avg_prvs}x${result.ord_qty} \r\n${(stockscapital+cashamounts).toFixed(2)}=S.${stockscapital.toFixed(2)}+C.${cashamounts.toFixed(2)} \r\n${addlog}`;
                          console.log(log, GetLocalDateStr(db_id,'SSS'));
                          telegramapi.SendMessageSellBuy(log, '');
                      }
                  }
                  resolve(1);
              })
            )
          }
        }

        if (fetchdb !== 'redis')
        {
          // 실시간 가격 갱신
          setInterval(() => {
            fetchcallback();
          }, tradedelay.small);
        }
        ///////////////////////////////
        // 매매 관련 start, interval
        ///////////////////////////////
        if (fetchdb === 'redis' && tradeboy === 'tradeboy')
        {
          setInterval(async() => {
            if(PlayingListup())
              return;
            
            const validodnotime = (consts.IsTestLive(Number(port)) || (g_canTradeTime && marketopen && !g_morningupdating && !g_networkerror))
            if (!validodnotime)
              return;

            MarketTrade();
          }, 1000);
        }
        
        if(tradeboy === 'tradeboy')
        {
          // 체결 확인
          setInterval(() => {
            if(PlayingListup())
              return;
            const validodnotime = (consts.IsTestLive(Number(port)) || (g_canTradeTime && marketopen && !g_morningupdating && !g_networkerror))
            if (!validodnotime)
              return;

            get_complete();
          }, stockcompletedelaySec * 1000);

          setInterval(() => {
            if(PlayingListup())
              return;
            const validodnotime = (consts.IsTestLive(Number(port)) || (g_canTradeTime && marketopen && !g_morningupdating && !g_networkerror))
            if (!validodnotime)
              return;
            
            const isAllOdnoNull = g_tradestocklist.every(item => item.odno == null);
            if(!isAllOdnoNull)
              return;

            const today = GetLocalDate(db_id);        
            const hour = today.getHours();
            const minute = today.getMinutes();
            const curminute = hour * 60 + minute;
            if(curminute < GetStartTime() + 30) // 장 시작 30분후부터 발동
              return;

            GetSetAccount();
          }, 1000 * 60 * 5);  // 5분에 한번 계좌 리셋
            
          // 전종목 전역 매매 쿨타임
          setInterval(()=>{
            if(g_globalCool > 0)
            {
                g_globalCool -= globalCoolDelay;
            }
            else if(g_globalCool < 0)
            {
                g_globalCool = 0;
            }    
          }, globalCoolDelay)        

          // ticker 마다 매매쿨타임
          setInterval(()=>{
            ProcessCoolTime(db_id, account, g_tradestocklist, g_tradecooltimes, cooltimecheckdelay, setaccount, ResetCooltime);
          }, cooltimecheckdelay)
        }
    }

    //console.log('ExecuteTrade 0=>' + 'debugport:'+port, 'db_id:'+db_id);
    if(debug_self_trade==='SELF')
    {
        //console.log('ExecuteTrade 1=>' + 'debugport:'+port, 'db_id:'+db_id);
        return new Promise((resolve, reject)=>{            
          
          //console.log('ExecuteTrade 2=>' + 'debugport:'+port, 'db_id:'+db_id);  
            apiserver = `http://localhost:${port}`;
            console.log(`apiserver: ${apiserver}`);
            StartTrade();
            resolve(debugport);
        }) 
    }
    else
    {
        return new Promise((resolve, reject)=>{            
            apiserver = `http://localhost:${port}`;
            console.log(`apiserver: ${apiserver}`);
            resolve(debugport);
        })         
    }
}

const PlayingListup=()=>
{
    return (autoaddstock !== 0 && realTradeLists.length > 0);
}

// const GetOpenDayFormat=()=>{
//     const today = GetLocalDate(db_id);
//     const opendayformat = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,0)}-${today.getDate().toString().padStart(2,0)}`;  
//     return opendayformat;
// }

const UpdateCanTradeTime=()=>{
    if(globalval.everytimefetch)
    {
      g_canTradeTime = true;
      setmarketopen(true);
      return g_canTradeTime;
    }

    const today = GetLocalDate(db_id);        
    const day = today.getDay();
    const hour = today.getHours();
    const minute = today.getMinutes();
    const curminute = hour * 60 + minute;
    const cantradeTime = validFetchtime(curminute);
    
    g_dayname = GetDayName(day);
    const isholiday = g_dayname === 'sunday' || g_dayname === 'saturday';
    g_canTradeDay = g_opentradeday === 'True' && (!IsLive() || !isholiday)
    
    if(!cantradeTime)
    {
      g_canTradeTime = false;      
      return false;  
    }
    setmarketopen(validFetchtime(curminute));

    g_canTradeTime = g_canTradeDay;
    return g_canTradeTime;
}

// function SetrealTradeLists(alltickers)
// {  
//   realTradeLists = alltickers;
//   realtradeCounts = realTradeLists.length;
// }

const Updateg_tradestocklist=(_ticker,_chartsdatas)=>{
  console.log(`Updateg_tradestocklist 1 ${GetEndTwoDays({chartdatas:_chartsdatas})} ${_ticker} ${g_tradestocklist.length}`);
  
  if(!_chartsdatas)
    return;
  // const chartdata = chartdatas[0];
  const tradestockidx = g_tradestocklist.findIndex(tradestock=>tradestock.ticker === _ticker)
  if(tradestockidx>0)
  {
    g_tradestocklist[tradestockidx] = {
      name:g_stocknames[_ticker],
      market:g_markets[_ticker], 
      ticker:_ticker,
      chartdatas:_chartsdatas,
      minchartdatas:minchartdatas,
      order:g_tradestocklist[tradestockidx].order,
      latestclose: _chartsdatas[_chartsdatas.length-1].close,
    };
    //   setupdateview(!updateview);
  }
    
  if(tradestockidx>0)
    console.log(`Updateg_tradestocklist 2-1 ${GetEndTwoDays(g_tradestocklist[tradestockidx])} ${tradestockidx}`);
  else
    console.log(`Updateg_tradestocklist 2-2 ${tradestockidx}`);
}

  // seconds update logic
const TickeruseEffect=async(_ticker)=>{
      
      if(!_ticker)
      {
        console.log(`1-2-Error ticker is ${_ticker}`);      
        console.error(`${_ticker} req datas undefined`);
        return; 
      }

      const oldstocktimeout = 5000;
          
      //axios.get(`${apiserver}/oldstocks?ticker=${ticker}&market=${market}&gb=${gb}&startdate=${startdate}&enddate=${enddate}&servicetype=${servicetype}&maintenance=${maintenance}`, {oldstocktimeout}).then(res => {
      const nation = dbidtonation(db_id);
      const today = GetLocalDate(db_id);
      const todayformat = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,0)}${today.getDate().toString().padStart(2,0)}`;
      const opendayformat = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,0)}-${today.getDate().toString().padStart(2,0)}`;            
      
      return new Promise((resolve, reject) => {
        Oldstocks(db_id, _ticker, market, gb, IsLive()?'LIVE':'DEV', maintenance, todayformat, opendayformat, (res) => {
          // if(res.ticker !== ticker)
          // {
          //   console.log(`${res.ticker} ${ticker} is not same`)
          //   resolve(-1)
          // }
  
          if(!res || res.errno)
          {
              // 실패 처리할 로직
              const err = 'error';
              const errLog = `${_ticker} ${err}`;
              console.error(errLog);
              if(IsLive())
                  telegramapi.SendMessageErrorMSG('[ERROR StockListUp]', errLog);
              resolve(-1)
          }
          const datas = res.products;        
          ticker = res.ticker;
          g_stocknames[res.ticker] = res.stockname;
          g_markets[res.ticker] = res.market;
  
          if(datas === undefined)
          {
              console.error(` ${res.ticker} req datas undefined1`);
              resolve(-1)
              return;  
          }
          let tempchartdatas = [];
          
          let startdatefilter = startdate === "" ? new Date("1900-01-01 00:00:00") : new Date(`${startdate} 00:00:00`);
          let enddatefilter = enddate === "" ? new Date("2040-01-01 00:00:00") : new Date(`${enddate} 23:59:59`);
  
          datas.map((element)=>{
              // console.log( element.datetime );
              let dataDateTime = new Date(element.datetime);
  
              if(startdatefilter < dataDateTime && enddatefilter > dataDateTime)
              {
                tempchartdatas.push({
                    // 'date' : element.datetime,
                    'date': dataDateTime,
                    'open' : element.open,
                    'high' : element.high,
                    'low' : element.low,
                    'close' : element.close,
                    'volume' : element.value,
                    'dividends' : element.dividends,
                    'splits' : element.splits,
                    'macd' : null,
                    'macdlongshort' : element.macdlongshort,
                })
              }          
          })  
          // if(res.ticker === 'ADBE')
          //   console.log(`${res.ticker} ${tempchartdatas.length}`);

          setchartdatas(tempchartdatas);
          Updateg_tradestocklist(res.ticker, tempchartdatas);
  
          if(autoaddstock !== 0)
          {
              if(IsLive())
              {            
                  const startmsg = GetStartMessage(nation, 'ListUp');
                  const endtwodays = GetEndTwoDays({chartdatas:chartdatas});
                  const updatemsg = GetUpdateMessage(nation, 'ListUp', `${Math.floor(Math.min((autoaddstock / realTradeListsCount), 1) * 100).toString().padStart(3, " ")}% ${g_markets[res.ticker]} ${g_stocknames[res.ticker].padEnd(5, " ")}(${res.ticker.padEnd(5, " ")}) ${endtwodays}`, stocklistup_starttime);
                  console.log(`TickeruseEffect ${updatemsg} ${GetAllLocalDateStr()}`)
                  telegramapi.EditMessageText(startmsg, updatemsg);
              }
              setautoaddstock(autoaddstock+1);
          }
              
          
          if(multiminutetrade !== 0)
          {
              setminutecloseTrade(true);
          }          
          // EVENT INFO
          let divslist = [];
          let splitslist = [];
          datas.map((element)=>{
              if(element.dividends !== 0)
              {
              divslist.push(
              {
                  'date' : GetLocalDate(db_id, element.datetime),
                  'index' : divslist.length,
              });
              }
  
              if(element.splits !== 0)
              {
              splitslist.push(
              {
                  'date' : GetLocalDate(db_id, element.datetime),
                  'index' : splitslist.length,
              });
              
              }
          })  
          eventsspecial['dividends'] = divslist;
          eventsspecial['splits'] = splitslist;
  
          // console.log('setchartdatas');
          resolve(res.ticker);
        }, false, true, startdate)
      })
        
        

      // return new Promise((resolve, reject) => Oldstocks(db_id, ticker, market, gb, IsLive()?'LIVE':'DEV', maintenance, todayformat, opendayformat, (res) => {
      //   if(res.ticker !== ticker)
      //   {
      //     console.log(`${res.ticker} ${ticker} is not same`)
      //   }

      //   if(!res || res.errno)
      //   {
      //       // 실패 처리할 로직
      //       const err = 'error';
      //       const errLog = `${ticker} ${err}`;
      //       console.error(errLog);
      //       if(IsLive())
      //           telegramapi.SendMessageErrorMSG('[ERROR StockListUp]', errLog);
      //       resolve(-1)
      //   }
      //   const datas = res.products;        
      //   g_stocknames[ticker] = res.stockname;

      //   if(datas === undefined)
      //   {
      //       console.error(` ${ticker} req datas undefined1`);
      //       resolve(-1)
      //       return;  
      //   }
      //   let tempchartdatas = [];
        
      //   let startdatefilter = startdate === "" ? new Date("1900-01-01 00:00:00") : new Date(`${startdate} 00:00:00`);
      //   let enddatefilter = enddate === "" ? new Date("2040-01-01 00:00:00") : new Date(`${enddate} 23:59:59`);

      //   datas.map((element)=>{
      //       // console.log( element.datetime );
      //       let dataDateTime = new Date(element.datetime);

      //       if(startdatefilter < dataDateTime && enddatefilter > dataDateTime)
      //       {
      //         tempchartdatas.push({
      //             // 'date' : element.datetime,
      //             'date': dataDateTime,
      //             'open' : element.open,
      //             'high' : element.high,
      //             'low' : element.low,
      //             'close' : element.close,
      //             'volume' : element.value,
      //             'dividends' : element.dividends,
      //             'splits' : element.splits,
      //             'macd' : null,
      //             'macdlongshort' : element.macdlongshort,
      //         })
      //       }          
      //   })  
      //   setchartdatas(tempchartdatas);
      //   Updateg_tradestocklist(ticker, tempchartdatas);

      //   if(autoaddstock !== 0)
      //   {
      //       if(IsLive())
      //       {            
      //           const startmsg = GetStartMessage(nation, 'ListUp');
      //           const updatemsg = GetUpdateMessage(nation, 'ListUp', `${Math.floor(Math.min((autoaddstock / realTradeListsCount), 1) * 100)}% ${g_stocknames[ticker]}(${ticker})`, stocklistup_starttime);
      //           console.log(`${updatemsg} ${GetAllLocalDateStr()}`)
      //           telegramapi.EditMessageText(startmsg, updatemsg);
      //       }
      //       setautoaddstock(autoaddstock+1);
      //   }
            
      
      //   if(multiminutetrade !== 0)
      //   {
      //       setminutecloseTrade(true);
      //   }          
      //   // EVENT INFO
      //   let divslist = [];
      //   let splitslist = [];
      //   datas.map((element)=>{
      //       if(element.dividends !== 0)
      //       {
      //       divslist.push(
      //       {
      //           'date' : GetLocalDate(db_id, element.datetime),
      //           'index' : divslist.length,
      //       });
      //       }

      //       if(element.splits !== 0)
      //       {
      //       splitslist.push(
      //       {
      //           'date' : GetLocalDate(db_id, element.datetime),
      //           'index' : splitslist.length,
      //       });
            
      //       }
      //   })  
      //   eventsspecial['dividends'] = divslist;
      //   eventsspecial['splits'] = splitslist;

      //   // console.log('setchartdatas');
      //   resolve(ticker);
      // }, false, true, startdate));
      console.log('');
    // ReqTimeOut(this);
}

// const MarketstateuseEffect=async()=>{
//     console.log(`marketstate 0-0 : ${marketstate}`);
    
//     if(!marketstate)
//       return;

//     console.log(`marketstate 0-1 : ${marketstate}`);    
    // await CallMain();

    // async function CallMain()
    // {
    //     const opendayformat = GetOpenDayFormat();
    //     const nation = dbidtonation(db_id);
    //     return new Promise ((resolve, reject)=> axios.get(`${flaskserverurl}getbeforeopenday?date=${opendayformat}&nation=${nation}`).then(data=> {
    //         let needdate = data.data.split(' ')[0];
    //         // needdate = needdate.replaceAll('-','');
    //         console.log('needdate : ' + needdate);
    //         g_morningupdating = true;
    //         UpdateStockLists(needdate);
    //         resolve();
    //       }));
    // }
    // // console.log('test');

    // async function CallAxios(tradestock){
    //   //return new Promise((resolve, reject) => axios.get(`${apiserver}/oldstocks?ticker=${tradestock.ticker}&market=${'stocklist'}&gb=${'d'}&startdate=${startdate}&enddate=${enddate}&servicetype=${servicetype}&maintenance=${maintenance}`).then(res => {

    //   const today = GetLocalDate(db_id);
    //   const todayformat = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,0)}${today.getDate().toString().padStart(2,0)}`;
    //   const opendayformat = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,0)}-${today.getDate().toString().padStart(2,0)}`;                    
    //   return new Promise((resolve, reject) => Oldstocks(db_id, tradestock.ticker, GetMarketname(db_id, 'm'), 'd', IsLive()?'LIVE':'DEV', maintenance, todayformat, opendayformat, (res) => {          
    //       const datas = res.products;        
    //       // console.log('stockname1 ' + res.data.stockname);
    //       // setstockname(res.data.stockname)
  
    //       if(datas === undefined)
    //       {            
    //         console.log(` ${ticker} req datas undefined2`);
    //         return;  
    //       }
    //       let tempchartdatas = [];
          
    //       let startdatefilter = startdate === "" ? new Date("1900-01-01 00:00:00") : GetLocalDate(db_id, `${startdate} 00:00:00`);
    //       let enddatefilter = enddate === "" ? new Date("2040-01-01 00:00:00") : GetLocalDate(db_id, `${enddate} 23:59:59`);
  
    //       datas.map((element)=>{
    //         // console.log( element.datetime );
    //         let dataDateTime = GetLocalDate(db_id, element.datetime);
  
    //         if(startdatefilter < dataDateTime && enddatefilter > dataDateTime)
    //         {
    //           tempchartdatas.push({
    //             // 'date' : element.datetime,
    //             'date': dataDateTime,
    //             'open' : element.open,
    //             'high' : element.high,
    //             'low' : element.low,
    //             'close' : element.close,
    //             'volume' : element.value,
    //             'dividends' : element.dividends,
    //             'splits' : element.splits,
    //             'macd' : null,
    //             'macdlongshort' : element.macdlongshort,
    //           })
    //         }
    //       })
    //       console.log('1-4_1 ' + `RQ:${tradestock.ticker} RS:${res.ticker} ${res.stockname} ${GetEndTwoDays(tradestock)}`);
    //       Updateg_tradestocklist(res.ticker, tempchartdatas);          
    //       resolve();
    //   }, false, true, startdate));    
    // }

    // async function UpdateStockLists(needdate){
    //   g_tradestocklist.reduce((accumulator, tradestock) => {
    //     return accumulator
    //         .then(() => CallAxios(tradestock))
    //         .catch((error) => {
    //             console.error(`작업 실패: ${error}`);
    //             throw error;
    //         });
    //   }, Promise.resolve())
    //   .then(async() => {
    //       console.log(`[MORNING-3] UpdateStockLists Finished! ${GetCurrentTime()}`);          
    //       g_morningupdating = false;
    //   })
    //   .catch((error) => {
    //       console.error(`중단된 작업: ${error}`);
    //   });
    // }
// }

const AutoaddstockuseEffect=async()=>{
    console.log(`AutoaddstockuseEffect Start-1 ${autoaddstock} ${ticker}`);

    if(autoaddstock === 0)
      return;

    if(realTradeLists.length === 0)
    {
      setautoaddstock(0);
      let newdate = GetLocalDate(db_id);
      console.log(`end autoadd ${newdate}`)
      return;
    }

    const popcount = realTradeLists.length;
    if(popcount === 0)
    {      
      return;    
    }      

    let realTradeTicker;
    for (let i = 0; i < popcount; ++i)
    {
      if(realTradeLists.includes(ticker))
      {
        realTradeLists = realTradeLists.filter((realTrade)=>realTrade !== ticker);
      }
      
      const temprealTradeTicker = realTradeLists.pop();
      if(g_tradestocklist.find(tradestock=>tradestock.ticker === temprealTradeTicker))
        continue;
      realTradeTicker = temprealTradeTicker;
      //setticker(realTradeTicker)
      break;
    }

    if(realTradeTicker)
      await TickeruseEffect(realTradeTicker);

    console.log(`AutoaddstockuseEffect Start-5 ${autoaddstock} ${ticker} ${popcount}`);

    if(!g_tradestocklist.find(tradestock=>tradestock.ticker === ticker))
    {
      if(ticker)
      {
        const tmeptradestock = {
          name:g_stocknames[ticker], 
          market:g_markets[ticker],
          ticker:ticker,        
          // chartdatas:g_chartdatalist[ticker],
          chartdatas:chartdatas,
          minchartdatas:minchartdatas,
          order:g_tradestocklist.length,
          latestclose: chartdatas[chartdatas.length-1].close,
          marekt:chartdatas[chartdatas.length-1].market,
          isfetchticker:globalval.serverfetchtickerlist.includes(ticker)
        }

        g_tradestocklist.push(tmeptradestock);

        console.log(`AutoaddstockuseEffect Push-1 
          ${GetAllLocalDateStr()} 
          ${tmeptradestock.name}(${tmeptradestock.ticker})
        L:${g_tradestocklist.length}
        T:${GetEndTwoDays(tmeptradestock)}
        G:${GetEndTwoDays(g_tradestocklist.find(gtradestock=>gtradestock.ticker === ticker))}
        `)
      }

      if(realTradeLists.length === 0)
      {
        if(g_morningautoadding == 1)
        {
          g_morningautoadding = 2;
          console.log(`${GetCurrentTime()} [MORNING-2] autoadding finished, setmarketstate ${marketstate} to 1: `);
          setmarketstate(1);          
        }
        if(IsLive())
        {            
          setTimeout(() => {
            const nation = dbidtonation(db_id);
            const startmsg = GetStartMessage(nation, 'ListUp');
            const completemsg = GetCompleteMessage(nation, 'ListUp', stocklistup_starttime);
            telegramapi.EditMessageText(startmsg, completemsg);  
            
          }, 5000);
          realTradeListsCount = 0;
          
          if(fetchdb === 'redis' && fetchboy === 'fetchboy')
            MakefetchpriceCalls(6);
        }
      }
      
    }

}


const GetCurrentTime=()=>{
    // const currentdate = GetLocalDate(db_id);
    // const hour = currentdate.getHours();
    // const minute = currentdate.getMinutes();    
    // return `${hour} : ${minute}`;
    return GetAllLocalDateStr();
}  

function fetch_price(tickers, markets, Callsetlatestclose){
    if(globalval.pausefetch)
    {
      fetchstatus = 0;
      if(g_fetchErrCool==0)
      {
        console.log(`pausefetch ${globalval.pausefetch}`);
        g_fetchErrCool = fetchErrCoolMax;
        
        Callsetlatestclose(null);
      }
      return;
    }  
    else
    {
    // teststarttime2 = (new Date()).getTime();
      Fetch_price(db_id, tickers, markets, (res2)=>{
          if(res2 === undefined || res2.rt_cd === undefined || res2.rt_cd === "0")
          {              
              
          }  
          else
          {
              console.log(`${res2.rt_cd} ${res2.msg1}`);
          
              if(parseInt(res2.rt_cd) > 10)
                g_fetchErrCool = 1000 * 5;
              else
                g_fetchErrCool = fetchErrCoolMax;
              // [S] kis fetch_price_list error :  [PYTHONERROR]rt_cd:1,msg1:기간이 만료된 token 입니다.
              if(res2.msg1.includes('token') || res2.msg1.includes('기간'))
              {
                  Issue_access_token(db_id, false, ()=>{});
              }   
          }

          Callsetlatestclose(res2 && res2.datas?res2.datas:null);
      })
   }
}

const BuyTest=(ticker, amount, db_id)=>{  
  real.market_buy_order(apiserver, g_tradestocklist, db_id, ticker, '', 0, amount, 1000, 10000, account, setaccount, ResetCooltime, 'testbuy');
}

const SelyTest=(ticker, amount, db_id)=>{  
  real.market_sell_order(apiserver, g_tradestocklist, db_id, ticker, '', 0, amount, 1000, 10000, account, setaccount, ResetCooltime, 'testsel', 0, '');
}

const SelAll=(db_id)=>{  
  setmarketopen(false);
  Object.entries(account).forEach((element,index)=>{
    if(element[0] !== "a0")
    {      
      setTimeout(() => {
        console.log(`market_sell_order`)
        real.market_sell_order(apiserver, g_tradestocklist, db_id, element[0], element[1].name, 0, element[1].amount, Number(element[1].averagebuyprice), 10000, account, setaccount, ResetCooltime, 'testsel', 0, '');  
      }, 800 * index);
    }
  })
  
}

const IsTickerCool=(ticker)=>{
  return g_tradecooltimes[ticker] ? g_tradecooltimes[ticker] > 0 : false
}

module.exports = {
    ExecuteTrade, BuyTest, SelyTest, SelAll, GetSetAccount, PrintTradingLogAndAccount,
    LogStatus, LogDefines, LogStockList, RawStockList, LogTotalAccount, FilteredLogAccount, LogAccount, SetLogLV, PrintMemory
}
