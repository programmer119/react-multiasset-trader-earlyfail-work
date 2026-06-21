const express = require('express')
const cors = require('cors');
const app = express()
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// const XLSX = require('xlsx');
const exec = require('child_process').exec;
const axios = require('axios');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const { func } = require('prop-types');
const { resolve } = require('path');
const { stringify } = require('querystring');
const consts = require('./consts');
const {GetYMD, GetPassedDayFromBought, MoveAverage, 
    GetLastDateTime,IsETF,
    IsLongStyle, IsShortStyle, GetTradeStyle, GetChangePer, GetChangePerLog} = require('./tradeutilcommon');
const globalval = require('./globalval');
const {getReadySheetData, getLastSheetData, getValueSheetData} = require('./googlespreadsheet');
const clone = require('rfdc')();
const {SaveTradeLogFolderToDb} = require('./testlogtodb')
// const db = require('./config/db_stock_kr')

// const db_stocklist = require('./config/db_stocklist')
// const db_stocklistdayall = require('./config/db_stocklistdayall')
// const db_nasstocklist = require('./config/db_nasstocklist')
// const db_minute_nasstocklist = require('./config/db_minute_nasstocklist')
// const db_japanstocklist = require('./config/db_japanstocklist')
// const db_eventfactor = require('./config/db_eventfactor')
// const db_dailyfilterstocks = require('./config/db_dailyfilterstocks')

const db_user = require('./config/db_user')
const db_serverinfo = require('./config/db_serverinfo')
const db_walletsnapshot = require('./config/db_walletsnapshot')
const telegramapi = require(`./telegram`)
const pyutil = require('./pythonutil')
const config = require("./config")
const {GetConfig, Cacus, RealTrade, ListToTickerDic, TsetThen, RealTradeSortedStocks, SellAllStocks,
    port, real, SetInjurance, GetInjurance, GetCashAmount, CaculateAllStockCapitalValue,
    Sum} = require('./tradeutil')
const {ExecuteTrade, BuyTest, SelyTest, SelAll, 
    GetAccountStr, GetStockListStr, LogStatus, LogDefines, LogStockList, RawStockList, LogTotalAccount, FilteredLogAccount, LogAccount, GetSetAccount,
    SetLogLV,PrintMemory, PrintTradingLogAndAccount,
    
} = require('./servertrade')
const {Getaccount, Market_sell_order, Market_buy_order, Fetch_price, Topstocklist, TopstocklistBA,
    Oldstocks, MarketChange, Get_my_complete, CheckStocksDate, 
    LoadStockTableList, LoadAllTickers, LoadTickerNames, ShowTradeLog, Opendaycheck, SetRedisPlural, ValidRights, FilterNotices,
} = require('./serverpacket')
const dbpassword = require('./config/dbpassword');
const assetBuyGate = require('./assetBuyGate');
const {GetMemcachedDataMulti} = require('./memcacheutil');

const {IsNaq, dbidtonation, GetMarket, GetMarketname, 
    ip, defulatConfig, GetInitMoney, AddSimulationLog, GetIndexTicker, IsOneStockSimulation, GetSimulationLogFileTitle} = require('./util');

const { type } = require('os');
// const spawn = require('child_process').spawn;

let g_tradestocklist =[];
const UseOldMemcached=()=>defulatConfig.usememcached;
// let db;
const simrapstarttime = new Date();
const simrapstartrap = `${GetYMD(simrapstarttime)} ${String(simrapstarttime.getHours()).padStart(2, '0')}:${String(simrapstarttime.getMinutes()).padStart(2, '0')}:${String(simrapstarttime.getSeconds()).padStart(2, '0')}`;
let simrapendrap = '';
let simdays = 0;

// 처리되지 않은 Promise 거부를 잡아냅니다 (지금 겪고 계신 에러)
process.on('unhandledRejection', (reason, promise) => {
    console.error('------- [Unhandled Rejection] -------');
    console.error('Reason:', reason); // 여기서 상세 에러(URL, Response 등) 확인 가능
    console.error('-------------------------------------');
    // 프로세스를 죽이지 않고 로그만 남깁니다.
});

// 일반적인 예외 발생 시 죽지 않게 설정
process.on('uncaughtException', (err) => {
    console.error('------- [Uncaught Exception] -------');
    console.error(err);
    console.error('-------------------------------------');
});


curindex = 0

// app.use((req, res) => {
//     res.setHeader("Access-Control-Allow-Origin", "*"); // 모든 도메인 허용
//     res.end();
//     // res.header("Access-Control-Allow-Origin", "http://localhost:3010"); // 특정 도메인 허용
// });

app.use(bodyParser.json()); 
app.use(cors({
    origin: '*', // 모든 출처 허용 옵션. true 를 써도 된다.
}));

const stocklistInfo = {
    month03: 18 * 3 * 6 * 60,
    year01 : 18 * 12 * 6 * 60
}

// stocklistdayall day
const stocklistdayallInfo = {
    week01: 5,
    month01: 18,
    month03: 18 * 3,
    year01 : 18 * 12,
    year03 : 18 * 12 * 3,
    year05 : 18 * 12 * 5,
    year10: 18 * 12 * 10,
}

app.get('/checkstocksdate', (req,res) => {
    today = new Date();
    todayformat = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,0)}${today.getDate().toString().padStart(2,0)}`;
    opendayformat = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,0)}-${today.getDate().toString().padStart(2,0)}`;    
    
    CheckStocksDate(req.query.db_id, todayformat, opendayformat, req.query.realTradeLists, (senddata)=>{
        res.send(senddata);
    });
})

app.get('/oldstocks', (req,res) => {        
    today = new Date();
    todayformat = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,0)}${today.getDate().toString().padStart(2,0)}`;
    opendayformat = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,0)}-${today.getDate().toString().padStart(2,0)}`;    

    // console.log(`stockends :${new Date().getSeconds()}`)
    
    Oldstocks(req.query.db_id, req.query.ticker, req.query.market, req.query.gb, req.query.servicetype, req.query.maintenance, todayformat, opendayformat, (senddata)=>{
        // console.log(`stockende :${new Date().getMinutes()}:${new Date().getSeconds()}`)
        res.send(senddata);
    }, false, req.query.reqindexdata, req.query.startdate);
})

app.get('/marketchange', (req,res) => {   
    MarketChange( req.query.market )
    res.send({});
})

// app.get('/curstock', (req,res) => {   
//     db.query(`SELECT * FROM ${req.query.ticker}`, (err, data) => {
//         if(!err) {
//             console.log('req : ' + curindex);
//             res.send({ products : data.slice(curindex, curindex+1)});
//             ++curindex;
//         }
//         else {
//             res.send(err);
//         }
//     })
// })

// app.get('/select_data_latest', (req,res) => {

//     sql = `SELECT * FROM ${req.query.ticker} ORDER BY datetime DESC LIMIT 1`
//     db.query(sql, (err, data) => {
//         if(!err) {
//             // console.log('req : ' + data);
//             res.send(data);
//         }
//         else {
//             res.send(err);
//         }
//     })    
// })

app.get('/market_buy_order', (req,res) => {
    const loghead = 'REAL-BUY';
    const log = 'buytest';       
    telegramapi.SendMessageSellBuy(loghead, log);
    return;

    Market_buy_order('', req.query.db_id, req.query.ticker, req.query.count, req.query.macdlongshort, (result)=>{
        res.send(result);
    })
})

app.get('/market_sell_order', (req,res) => {  
    const loghead = 'REAL-SELL';
    const log = 'seltest';       
    telegramapi.SendMessageSellBuy(loghead, log);
    return;

    Market_sell_order('', req.query.db_id, req.query.ticker, req.query.count, req.query.macdlongshort, (result)=>{
        res.send(result);
    })
})

app.get('/fetch_price', (req,res) => {   
    let tickers = JSON.parse(req.query.tickers)           
    Fetch_price(req.query.db_id, tickers, (resdata)=>{
        res.send(resdata);
    })    
})

app.put('/maintenance', async(req,res) => {   

    async function CallPromise(updatesql)
    {
        return new Promise((resolve, reject) => 
            db_serverinfo((conn) => {
                conn.query(updatesql, (err4, data) => {
                    conn.release();
                    resolve();
                })
            })
        )
    }
    
    if(req.body.status === 'moktrade')
    {
        querystatus = 'moktrade';
        csvserverdata = JSON.parse(req.body.csvserverdata)
        
        await Promise.all(
            csvserverdata.map(async(serverdata)=>{
                ticker = serverdata[0]
                resultmoney = serverdata[2]

                updatesql = `UPDATE filterstocks SET resultmoney = ${resultmoney} WHERE CODE = '${ticker}'`;
                const r = await CallPromise(updatesql)
                return r;
            })
        );

        console.log('moktrade complete end')
        telegramapi.SendMessage(`Maintenance [${req.body.status}] isMaintenanceTime:${req.body.isMaintenanceTime}`);        
        res.send('moktrade complete');
    }
})

// daily maintenence
app.get('/maintenance', (req,res) => {    
    console.log(`maintenance ${req.query.status}`);

    const SendMessage=(querystatus)=>
    {
        telegramapi.SendMessage(`Maintenance [${req.query.status}] isMaintenanceTime:${req.query.isMaintenanceTime}`);
        query = `UPDATE maintenance SET status = '${querystatus}' WHERE NAME = 'dailymaintenance'`;
        
        db_serverinfo((conn) => {
            conn.query(query, (err, data) => {
                conn.release();
                if(!err) 
                {   
                    res.send({status:querystatus});
                }
                else {
                    res.send(err);
                }
            })
        });
    }

    // python .\stock_oldinfo_collect.pyw reconnect
    
    if(req.query.status === "check")
    {
        query = "SELECT status FROM maintenance WHERE name='dailymaintenance'";

        db_serverinfo((conn) => {
            conn.query(query, (err, data) => {
                conn.release();
                if(!err) 
                {   
                    res.send({status:data[0].status});
                }
                else {
                    res.send(err);
                }
            })
        });
        
    }
    else if(req.query.status === "none")
    {   
        db_id = req.query.db_id;
        db_user((connu) => {
            connu.query(`UPDATE ${req.query.db_id} SET todayaction = 'none'`, (err, data) => {
                connu.release();
                telegramapi.SendMessage(`Maintenance PREPARING isMaintenanceTime:${req.query.isMaintenanceTime} db_id:${req.query.db_id} err:${err}`);
                query = `UPDATE maintenance SET status = '${req.query.status}' WHERE NAME = 'dailymaintenance'`;
                
                db_serverinfo((conn) => {
                    conn.query(query, (err, data) => {
                        conn.release();
                        if(!err) 
                        {   
                            res.send({status:req.query.status});
                        }
                        else {
                            res.send(err);
                        }
                    })
                });  
            })
        });
    }
    else
    {
        querystatus = 'none';
        if(req.query.status === "start")
        {
            SendMessage('start');
        }            
        else if(req.query.status === "stock_oldinfo_collect_all")
        {
            if(req.query.isMaintenanceTime === 'true')
                pyutil.stock_oldinfo_collect_all(db_id, '',()=>{SendMessage('stock_oldinfo_collect_all')});
        }
        else if(req.query.status === 'market_capitalization')
        {   
            pyutil.stock_oldinfo_collect_market_capitalization(()=>{
                SendMessage('market_capitalization')
            });
        }
        else if(req.query.status === 'finish')
        {            
            SendMessage('none');
        }        
    }
})

app.get('/showalltickers', (req,res)=>{
    showtickerinfos = []
    showfilteredtickerinfos = []
    console.log('showalltickers');
    query = "SHOW TABLES"        

    const marketfncm = GetMarket(req.query.db_id, 'm');
    const marketfncd = GetMarket(req.query.db_id, 'd');
    marketfncm((connm) => {
        connm.query(query, (err, data) => {            
            if(!err) 
            {
                tickerinfos = data.reduce(function(accum, cur) 
                {   
                    ticker = IsNaq(req.query.db_id) ? cur.Tables_in_minute_nasstocklist.toUpperCase() : cur.Tables_in_stocklist.toUpperCase();                
                    accum.push({ticker:ticker});
                    return accum; 
                }, [])
                marketfncd((connd)=>{  
                    connd.query(query, (err2, data2) => {
                        if(!err)
                        {
                            connd.release();
                            tickerinfosdaily = data2.reduce(function(accum, cur)
                            {
                                ticker = IsNaq(req.query.db_id) ? cur.Tables_in_nasstocklist.toUpperCase() : cur.Tables_in_stocklistdayall.toUpperCase();                                        
                                accum.push({ticker:ticker});
                                return accum;
                            }, [])
                            
                            showtickerinfos = tickerinfos.reduce(function(accum, cur){
                                if(tickerinfosdaily.find(element=>(element.ticker === cur.ticker)))
                                    accum.push(cur);
                                return accum;
                            },[])

                            showtickerinfos.forEach((tickerinfo,tickerindex)=>{
                                connm.query(`SELECT COUNT(*) as cnt FROM ${tickerinfo.ticker.toLowerCase()}`, (err2, data2) => 
                                {
                                    connm.release();
                                        // filter over 1 year.
                                    if(!err2 && data2[0].cnt > stocklistInfo.year01)
                                    {
                                        showfilteredtickerinfos.push(tickerinfo)
                                    }

                                    console.log(tickerindex);
                                    if(showtickerinfos.length-1 === tickerindex)
                                    {                                
                                        res.send(showfilteredtickerinfos);
                                    }
                                })
                            })
                        }            
                        else {
                            connd.release();
                            res.send(err2);
                        }
                    })   
                })         
            }
            else {
                connm.release();
                res.send(err);
            }
        })
    });
})

// app.get('/filtertickers', async(req,res)=>{    
//     console.log('filtertickers');
//     telegramapi.SendMessage(`Maintenance filtertickers start`);
//     // stocklist minute
//     showtickerinfos = []    
//     resultTickers = [];
//     tickers = [];
//     today = req.query.today;

//     const getavg = (numbers) => {
//         if (numbers.length === 0) return 0;
//         const sum = numbers.reduce((acc, current) => acc + current);
//         return Number(sum / numbers.length).toFixed(2);
//     };

//     const gethigh = (numbers) => {
//         const max = numbers.reduce((a, b) => Math.max(a, b), -Infinity);
//         return max;
//     };      

//     const sortArr = (numbers) => {
//         numbers.sort(function(a,b){
//             return a-b;
//         })
//     }

//     const getMiddle=(datas, count)=>{        
//         let avgs = [];
//         for(let i = 0; i < count; ++i)
//         {
//             datalength = datas.length/count;
//             avgs.push(getavg( datas.slice(datalength * i, datalength * (i + 1)) ));
//         }
//         sortArr(avgs);
//         const countmiddle = Math.round(count/2);
//         return Number(avgs[countmiddle]).toFixed(2);
//     }
    
//     const Insertdailyfilterstocks=(tickerinfo, today, Callback)=>{
//         // 공동저장소에도 넣어준다
//         let tablename = `d${today}`;
//         createsql = `CREATE TABLE IF NOT EXISTS ${tablename} (
//         code VARCHAR(256) DEFAULT '', 
//         name VARCHAR(256) COLLATE utf8_bin DEFAULT '', 
//         year50closeaverage double DEFAULT 0,
//         year40closeaverage double DEFAULT 0,
//         year30closeaverage double DEFAULT 0,
//         year20closeaverage double DEFAULT 0, 
//         year10closeaverage double DEFAULT 0, 
//         year05closeaverage double DEFAULT 0, 
//         year01closeaverage double DEFAULT 0, 
//         month03closeaverage double DEFAULT 0, 
//         month01closeaverage double DEFAULT 0, 
//         highprice double DEFAULT 0, 
//         lastprice double DEFAULT 0, 
//         maketAmt BIGINT DEFAULT 0, 
//         resultmoney INT DEFAULT 0, 
//         sector1closeaverage double DEFAULT 0, 
//         sector2closeaverage double DEFAULT 0, 
//         sector3closeaverage double DEFAULT 0, 
//         sector4closeaverage double DEFAULT 0, 
//         sector5closeaverage double DEFAULT 0, 
//         filtertype VARCHAR(50) DEFAULT '',
//         PRIMARY KEY(CODE))`;

       
//         db_dailyfilterstocks.query(createsql, (errc, datac) => {
//             if(!errc)
//             {                  
//                 tablename = `d${today}`;
//                 existsdatasql = `select EXISTS (select * from ${tablename} WHERE code='${tickerinfo.ticker}') as success`    
                                                                  
//                 db_dailyfilterstocks.query(existsdatasql, (err5, data5) => {
//                     insertsql = `INSERT INTO ${tablename} (code, name, year50closeaverage, year40closeaverage, year30closeaverage, year20closeaverage, year10closeaverage, year05closeaverage, year01closeaverage, month03closeaverage, month01closeaverage, highprice, lastprice, maketAmt, resultmoney, sector1closeaverage, sector2closeaverage, sector3closeaverage, sector4closeaverage, sector5closeaverage, filtertype) VALUES('${tickerinfo.ticker}', '${tickerinfo.name}', ${tickerinfo.year50closeaverage}, ${tickerinfo.year40closeaverage}, ${tickerinfo.year30closeaverage}, ${tickerinfo.year20closeaverage}, ${tickerinfo.year10closeaverage}, ${tickerinfo.year05closeaverage}, ${tickerinfo.year01closeaverage}, ${tickerinfo.month03closeaverage}, ${tickerinfo.month01closeaverage}, ${tickerinfo.highprice}, ${tickerinfo.lastprice}, ${0}, ${0}, ${tickerinfo.sector1closeaverage}, ${tickerinfo.sector2closeaverage}, ${tickerinfo.sector3closeaverage}, ${tickerinfo.sector4closeaverage}, ${tickerinfo.sector5closeaverage}, '${tickerinfo.filtertype}')`;
//                     updatesql = `UPDATE ${tablename} SET month01closeaverage = ${tickerinfo.month01closeaverage}, month03closeaverage = ${tickerinfo.month03closeaverage}, year01closeaverage = ${tickerinfo.year01closeaverage}, year05closeaverage = ${tickerinfo.year05closeaverage}, year10closeaverage = ${tickerinfo.year10closeaverage}, year20closeaverage = ${tickerinfo.year20closeaverage}, year30closeaverage = ${tickerinfo.year30closeaverage}, year40closeaverage = ${tickerinfo.year40closeaverage}, year50closeaverage = ${tickerinfo.year50closeaverage}, highprice = ${tickerinfo.highprice}, lastprice = ${tickerinfo.lastprice}, sector1closeaverage = ${tickerinfo.sector1closeaverage}, sector2closeaverage = ${tickerinfo.sector2closeaverage}, sector3closeaverage = ${tickerinfo.sector3closeaverage}, sector4closeaverage = ${tickerinfo.sector4closeaverage}, sector5closeaverage = ${tickerinfo.sector5closeaverage}, filtertype='${tickerinfo.filtertype}' WHERE CODE = '${tickerinfo.ticker}'`;                                                

//                     if(!err5)
//                     {
//                         if(data5[0].success > 0)
//                         {
//                             db_dailyfilterstocks.query(updatesql, (err6, data6) => {
//                                 // resolve(tickerinfo.ticker);  
//                                 if(!err6)                                  
//                                 {
//                                     Callback(tickerinfo.ticker);    
//                                 }
//                                 else
//                                 {
//                                     resolve(-1)
//                                 }
//                             })
//                         }                                        
//                         else
//                         {
//                             db_dailyfilterstocks.query(insertsql, (err6, data6) => {
//                                 // resolve(tickerinfo.ticker);      
//                                 if(!err6)                                  
//                                 {
//                                     Callback();    
//                                 }
//                                 else
//                                 {
//                                     resolve(-1)
//                                 }                                                                   
//                             })
//                         }                        
//                     }    
//                     else
//                     {
//                         resolve(-1)
//                     }                                
//                 });
//             }
//             else
//                resolve(-1)
//         });        
        
//     }

//     let upwardrightcount = 0;
//     let upwardrecentlycount = 0;
//     let nonecount = 0;
//     async function CallPromise(tickerinfo)
//     {
//         return new Promise((resolve, reject) => db_stocklist.query(`SELECT COUNT(*) as cnt FROM ${tickerinfo.ticker} WHERE date <= ${today}`, (err2, data2) =>
//         {
//             const hasStocksAs3month = data2[0].cnt > stocklistInfo.month03;
//             // filter over 1 year.
//             //if(!err2 && data2[0].cnt > stocklistInfo.year01)
//             if(!err2 && hasStocksAs3month)
//             {
//                 db_stocklistdayall.query(`SELECT * FROM ${tickerinfo.ticker} WHERE date <= ${today} ORDER BY DATE DESC LIMIT ${stocklistdayallInfo.year03}`, (err, data) => 
//                 {
//                     if(!err && data && data.length > stocklistdayallInfo.year01)
//                     {
//                         datacloses = data.reduce(function(accum, cur)
//                         {
//                             accum.push(cur.close);
//                             return accum;
//                         }, []);


//                         tickerinfo.name = data[0].name;
//                         tickerinfo.highprice = gethigh(datacloses);
//                         tickerinfo.lastprice = datacloses[datacloses.length-1];                        
//                         tickerinfo.year50closeaverage   = 0;
//                         tickerinfo.year40closeaverage   = 0;
//                         tickerinfo.year30closeaverage   = 0;
//                         tickerinfo.year20closeaverage   = 0;
//                         tickerinfo.year10closeaverage   = 0;
//                         tickerinfo.year05closeaverage   = 0;
//                         tickerinfo.year01closeaverage   = 0;
//                         tickerinfo.month03closeaverage  = 0;
//                         tickerinfo.month01closeaverage  = 0;                              
//                         datacount = datacloses.length;

//                         let upwardrecently = true;
//                         // 반 쪼갠다
//                         let sectorcount = 5;
//                         const count5 = 6;
//                         let pivot = 0.5;

//                         for(let num = 1; num <= sectorcount; ++num)
//                         {
//                             let olds = datacloses.slice(datacount*pivot,datacount*pivot*2); 
//                             let recs = datacloses.slice(datacount*0,datacount*pivot);
//                             tickerinfo[`left${num}`]   = getMiddle(olds, count5);
//                             tickerinfo[`right${num}`]   = getMiddle(recs, count5);     
//                             pivot = pivot / 2;
//                         }

//                         for(let num = 1; num <= sectorcount; ++num)
//                         {
//                             if(Number(tickerinfo[`right${num}`]) < Number(tickerinfo[`left${num}`]))
//                             {
//                                 upwardrecently = false;
//                                 break;
//                             }
//                         }
                        
//                         sectorcount = 5;
//                         onesectorlength = datacount / sectorcount;
//                         let upwardright = true;

//                         for(let num = 0; num < sectorcount; ++num)
//                             tickerinfo[`sector${num+1}closeaverage`] = getavg(datacloses.slice(onesectorlength * num, onesectorlength * (num + 1)));
//                         for(let num = 1; num < sectorcount; ++num)
//                         {
//                             if(Number(tickerinfo[`sector${num}closeaverage`]) < Number(tickerinfo[`sector${num+1}closeaverage`]))
//                             {
//                                 upwardright = false;
//                                 break;
//                             }
//                         }                            

//                         if(upwardright)
//                         {
//                             tickerinfo.filtertype = 'upwardright'
//                             ++upwardrightcount;
//                         } 
//                         else if(upwardrecently) {
//                             tickerinfo.filtertype = 'upwardrecently'
//                             ++upwardrecentlycount;                            
//                         }
//                         else {
//                             tickerinfo.filtertype = 'none'
//                             ++nonecount;
//                         }

//                         const CallInsertDailyfilterstocks=(tickerinfo, today)=>{
//                             Insertdailyfilterstocks(tickerinfo, today, (ticker)=>{
//                                 resolve(ticker);
//                             })                                        
//                         }

//                         if(req.query.onlydailyfilterstocks)
//                             CallInsertDailyfilterstocks(tickerinfo, today);
//                         else
//                         {
//                             let tablename = "filterstocks";
//                             existsdatasql = `select EXISTS (select * from ${tablename} WHERE code='${tickerinfo.ticker}') as success`                        
//                             db_serverinfo((conn) => {
                                
//                                 conn.query(existsdatasql, (err3, data) => 
//                                 {     
//                                     insertsql = `INSERT INTO ${tablename} (code, name, year50closeaverage, year40closeaverage, year30closeaverage, year20closeaverage, year10closeaverage, year05closeaverage, year01closeaverage, month03closeaverage, month01closeaverage, highprice, lastprice, maketAmt, resultmoney, sector1closeaverage, sector2closeaverage, sector3closeaverage, sector4closeaverage, sector5closeaverage, filtertype) VALUES('${tickerinfo.ticker}', '${tickerinfo.name}', ${tickerinfo.year50closeaverage}, ${tickerinfo.year40closeaverage}, ${tickerinfo.year30closeaverage}, ${tickerinfo.year20closeaverage}, ${tickerinfo.year10closeaverage}, ${tickerinfo.year05closeaverage}, ${tickerinfo.year01closeaverage}, ${tickerinfo.month03closeaverage}, ${tickerinfo.month01closeaverage}, ${tickerinfo.highprice}, ${tickerinfo.lastprice}, ${0}, ${0}, ${tickerinfo.sector1closeaverage}, ${tickerinfo.sector2closeaverage}, ${tickerinfo.sector3closeaverage}, ${tickerinfo.sector4closeaverage}, ${tickerinfo.sector5closeaverage}, '${tickerinfo.filtertype}')`;
//                                     updatesql = `UPDATE ${tablename} SET month01closeaverage = ${tickerinfo.month01closeaverage}, month03closeaverage = ${tickerinfo.month03closeaverage}, year01closeaverage = ${tickerinfo.year01closeaverage}, year05closeaverage = ${tickerinfo.year05closeaverage}, year10closeaverage = ${tickerinfo.year10closeaverage}, year20closeaverage = ${tickerinfo.year20closeaverage}, year30closeaverage = ${tickerinfo.year30closeaverage}, year40closeaverage = ${tickerinfo.year40closeaverage}, year50closeaverage = ${tickerinfo.year50closeaverage}, highprice = ${tickerinfo.highprice}, lastprice = ${tickerinfo.lastprice}, sector1closeaverage = ${tickerinfo.sector1closeaverage}, sector2closeaverage = ${tickerinfo.sector2closeaverage}, sector3closeaverage = ${tickerinfo.sector3closeaverage}, sector4closeaverage = ${tickerinfo.sector4closeaverage}, sector5closeaverage = ${tickerinfo.sector5closeaverage}, filtertype='${tickerinfo.filtertype}' WHERE CODE = '${tickerinfo.ticker}'`;                            
                                    
//                                     if(!err3)
//                                     {
//                                         if(data[0].success > 0)
//                                         {
//                                             conn.query(updatesql, (err4, data) => {
//                                                 conn.release();                                            
//                                                 CallInsertDailyfilterstocks(tickerinfo, today);
//                                                 //resolve(tickerinfo.ticker);
//                                             })
//                                         }
//                                         else
//                                         {
//                                             conn.query(insertsql, (err4, data) => {
//                                                 conn.release();
//                                                 CallInsertDailyfilterstocks(tickerinfo, today);
//                                                 //resolve(tickerinfo.ticker);
//                                             })
//                                         }
//                                     }
//                                     else
//                                     {
//                                         conn.release();
//                                         resolve(-1);
//                                     }
//                                 })
//                             });
//                         }
//                     }else{
//                         resolve(-1);
//                     }
//                 })
//             }          
//             else
//             {
//                 resolve(-1);
//             }
//         }))
//     }

//     async function CallTruncate()
//     {
//         return new Promise((resolve, reject) =>
//             db_serverinfo((conn) => {
//                 conn.query(`TRUNCATE TABLE filterstocks`, (err, data) => 
//                 {   
//                     conn.release();    
//                     if(!err && data)
//                     {
//                         resolve();
                        
//                     }else{
//                         resolve();
//                     }
//                 })
//             })
            
//         )
//     }

//     async function ShowTickers()
//     {
//         query = "SHOW TABLES"        
//         return new Promise((resolve, reject) => db_stocklist.query(query, (err, data) => 
//         {       
//             if(!err) 
//             {
//                 tickerinfos = data.reduce(function(accum, cur) 
//                 {  
//                     ticker = cur.Tables_in_stocklist.toLowerCase();  
//                     accum.push({ticker:ticker});
//                     return accum;                
//                 }, [])
                
//                 db_stocklistdayall.query(query, (err2, data2) => {            
//                     if(!err) 
//                     {
//                         tickerinfosdaily = data2.reduce(function(accum, cur) 
//                         {  
//                             ticker = cur.Tables_in_stocklistdayall.toLowerCase();                
//                             accum.push({ticker:ticker});
//                             return accum;                
//                         }, [])

//                         showtickerinfos = tickerinfos.reduce(function(accum, cur){
//                             if(tickerinfosdaily.find(element=>(element.ticker === cur.ticker)))
//                                 accum.push(cur);
//                             return accum;
//                         },[])
                    
//                         resolve();
//                     }            
//                     else {
//                         resolve();
//                     }
//                 })
//             }
//             else {
//                 res.send(err);
//             }
//         }))
//     }
    
//     await ShowTickers();

//     // if(!req.query.onlydailyfilterstocks)
//     //     await CallTruncate();

//     await Promise.all(
//         showtickerinfos.map(async(ticker,index)=>{
//             const r = await CallPromise(ticker);
//             console.log(index, showtickerinfos.length);
//             if(r !== -1)
//                 resultTickers.push(r);
//             return r;
//         })
//     );

//     // 삭제 할 필요가 없음.
//     // sendTickers = []
//     // if(!req.query.onlydailyfilterstocks)
//     // {
//     //     await Promise.all(
//     //         resultTickers.map(async(resultTicker,index)=>{
//     //             const r = await CallDelete(resultTicker);
//     //             console.log(index, showtickerinfos.length);
//     //             if(r !== -1)
//     //                 sendTickers.push(r);
//     //             return r;
//     //         })      
//     //     );  
//     // }
        
//     telegramapi.SendMessage(`Maintenance filtertickers end. length :${resultTickers.length} upwardrightcount:${upwardrightcount} upwardrecentlycount:${upwardrecentlycount} nonecount:${nonecount}`);
//     res.send(resultTickers)
// })

app.get('/dbtickers', async(req,res)=>{
    
    results1 = [];
    tickers = [];

    async function CallPromise()
    {
        return new Promise((resolve, reject) => 
            db_serverinfo((conn) => {
                conn.query(`SELECT * FROM filterstocks`, (err, data) => 
                {       
                    conn.release();
                    if(!err && data)
                    {
                        data.forEach(element => {
                            if(element.filtertype === 'upwardright')
                            {
                                tickers.push({code:element.code, maketAmt:element.maketAmt});
                            }
                            else if(element.filtertype === 'upwardrecently')
                            {
                                tickers.push({code:element.code, maketAmt:element.maketAmt});
                            }                        
                        });
                        resolve(tickers);       
                        
                    }else{
                        resolve(-1);
                    }
                })
            })
        )
    }
    
    await CallPromise();
    res.send(tickers)    
})
let testvals = {}
let senddatalist = [];
const perfTrace = [];

const PushPerfTrace=(type, today, data)=>{
    perfTrace.push({
        at:new Date().toISOString(),
        type,
        today,
        ...data,
    });
    if(perfTrace.length > 300)
        perfTrace.shift();
}

const PrepareSimulationChartMeta=(chartdatas)=>{
    if(!chartdatas || chartdatas._simMetaPrepared)
        return;

    let baseIdx = -1;
    chartdatas.forEach((chartdata, idx)=>{
        chartdata.date = chartdata.datetime;
        chartdata.trademark = false;
        chartdata.trademarkrsi = false;
        chartdata.oneMonthRate = null;

        const monthAgo = new Date(chartdata.datetime);
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        while(baseIdx + 1 < idx && chartdatas[baseIdx + 1].datetime <= monthAgo)
            ++baseIdx;

        chartdata.oneMonthBaseClose = baseIdx >= 0 ? chartdatas[baseIdx].close : null;
    })

    chartdatas._simMetaPrepared = true;
}

const PrepareSimulationSmaBase=(chartdatas, index)=>{
    const chartdata = chartdatas[index];
    if(!chartdata)
        return;

    const base = {};
    [5, 10, 20, 60, 120].forEach((days)=>{
        const startIndex = index - days + 1;
        const valid = startIndex >= 0;
        base[`valid${days}`] = valid;
        base[`sum${days}`] = 0;

        if(valid)
        {
            for(let i = startIndex; i < index; ++i)
                base[`sum${days}`] += Number(chartdatas[i].close);
        }
    })

    base.squareSum20 = 0;
    if(base.valid20)
    {
        const startIndex = index - 20 + 1;
        for(let i = startIndex; i < index; ++i)
            base.squareSum20 += Math.pow(parseFloat(chartdatas[i].close), 2);
    }

    chartdata._simSmaBase = base;
}

const GetCompactMinuteClose=(minchartdatas, index)=>{
    const value = minchartdatas[index];
    if(value == null || value !== value)
        return null;
    return value;
}

const GetCompactMinuteValue=(minchartvalues, index)=>{
    if(!minchartvalues)
        return 0;

    const value = minchartvalues[index];
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

const ERROR_MINUTE_CLOSE_CHANGE_LIMIT_PERCENT = 40;
const ToNormalMinuteClose=(value)=>{
    if(value == null || value === '')
        return null;

    const close = Number(value);
    return Number.isFinite(close) && close > 0 ? close : null;
}

const GetRecentNormalMinuteClose=(tradestock)=>{
    const normalClose = ToNormalMinuteClose(tradestock._lastNormalMinuteClose);
    if(normalClose != null)
        return normalClose;

    const latestClose = ToNormalMinuteClose(tradestock.latestclose);
    if(latestClose != null)
        return latestClose;

    const curchartdata = tradestock.chartdatas ? tradestock.chartdatas[tradestock.curchartdataidx] : null;
    return curchartdata ? ToNormalMinuteClose(curchartdata.close) : null;
}

const AddErrorMinuteCloseLog=(tradestock, today, ctime, minuteClose, normalClose, reason, changeRate)=>{
    if(!defulatConfig.useconsolelog)
        return;

    const logKey = `${today}${ctime}${tradestock.ticker}${reason}`;
    if(tradestock._lastErrorMinuteCloseLogKey === logKey)
        return;

    tradestock._lastErrorMinuteCloseLogKey = logKey;
    const rateText = changeRate != null ? ` rate:${changeRate.toFixed(2)}%` : '';
    AddSimulationLog(`[ERROR_MINUTE_CLOSE] ${today} ${ctime} ${tradestock.ticker} 오류분봉으로인한 이전값 처리 ${minuteClose}=>${normalClose} ${reason}${rateText}`);
}

const ResolveMinuteClose=(tradestock, minuteClose, today, ctime)=>{
    const close = ToNormalMinuteClose(minuteClose);

    if(!defulatConfig.useerrorminuteclosefilter)
        return close;

    const normalClose = ToNormalMinuteClose(tradestock._lastNormalMinuteClose);
    if(close == null)
        return null;

    if(normalClose != null)
    {
        const changeRate = Math.abs((close / normalClose - 1) * 100);
        if(changeRate >= ERROR_MINUTE_CLOSE_CHANGE_LIMIT_PERCENT)
        {
            AddErrorMinuteCloseLog(tradestock, today, ctime, close, normalClose, 'jump', changeRate);
            return normalClose;
        }
    }

    tradestock._lastNormalMinuteClose = close;
    return close;
}

const GetFirstCompactMinuteClose=(minchartdatas)=>{
    for(let i = 0; i < minchartdatas.length; ++i)
    {
        const close = GetCompactMinuteClose(minchartdatas, i);
        if(close != null)
            return close;
    }
    return null;
}

const GetFirstNormalMinuteClose=(tradestock)=>{
    if(!tradestock || !tradestock.minchartdatas)
        return null;

    // if(tradestock.simMinuteCompact)
    //     return GetFirstCompactMinuteClose(tradestock.minchartdatas);

    // const firstMinuteData = tradestock.minchartdatas.find(item=>item && ToNormalMinuteClose(item.close) != null);
    // return firstMinuteData ? ToNormalMinuteClose(firstMinuteData.close) : null;
    for(let i = 0; i < tradestock.minchartdatas.length; ++i)
    {
        const mindata = tradestock.minchartdatas[i];
        if(mindata && mindata.close)
            return mindata.close;
    }
    return null;
}

const DB_MINUTE_CACHE_START_MINUTE = 9 * 60;
const DB_MINUTE_CACHE_MAX_MINUTES = 7 * 60;
const DB_MINUTE_UNION_CHUNK_SIZE = 30;
const DB_MINUTE_UNION_CONCURRENCY = 8;
const DB_MINUTE_SINGLE_CONCURRENCY = 64;
const DB_MINUTE_MULTI_CHUNK_SIZE = 45;
const DB_MINUTE_MULTI_CONCURRENCY = 4;
const MINUTE_CACHE_URL = process.env.MINUTE_CACHE_URL ? String(process.env.MINUTE_CACHE_URL).replace(/\/+$/, '') : '';
const MINUTE_CACHE_SUPERVISOR_URL = process.env.MINUTE_CACHE_SUPERVISOR_URL ? String(process.env.MINUTE_CACHE_SUPERVISOR_URL).replace(/\/+$/, '') : '';
const MINUTE_CACHE_TOKEN = process.env.MINUTE_CACHE_TOKEN || '';
const MINUTE_CACHE_BOOTSTRAP_SECRET = process.env.MINUTE_CACHE_BOOTSTRAP_SECRET || '';
const MINUTE_CACHE_DISABLE_BOOTSTRAP = process.env.MINUTE_CACHE_DISABLE_BOOTSTRAP === 'true';
let minuteCacheBootstrapPromise = null;
let minuteCacheSupervisorStartPromise = null;
const dbMinuteCloseCache = {
    lastDate:'',
    loadedTickers:0,
    loadingTickers:0,
    loadedRows:0,
    loadedPoints:0,
    elapsedMs:0,
    dayStartMs:0,
    totalMs:0,
    mode:'',
    chunks:0,
    maxChunkMs:0,
    recentChunks:[],
};

const GetMemoryText=()=>{
    const memory = process.memoryUsage();
    return `heap:${Math.round(memory.heapUsed / 1024 / 1024)}MB rss:${Math.round(memory.rss / 1024 / 1024)}MB`;
}

const MinuteTimeToIndex=(time)=>{
    const timestr = String(time).padStart(4, '0');
    const hour = Number(timestr.slice(0, 2));
    const minute = Number(timestr.slice(2, 4));
    if(!Number.isFinite(hour) || !Number.isFinite(minute))
        return -1;

    const index = hour * 60 + minute - DB_MINUTE_CACHE_START_MINUTE;
    return index >= 0 && index < DB_MINUTE_CACHE_MAX_MINUTES ? index : -1;
}

const CompactMinuteRows=(rows)=>{
    const minutes = new Float32Array(DB_MINUTE_CACHE_MAX_MINUTES);
    const values = new Float64Array(DB_MINUTE_CACHE_MAX_MINUTES);
    minutes.fill(NaN);
    let points = 0;

    rows.forEach(row=>{
        const index = MinuteTimeToIndex(row.time);
        if(index < 0)
            return;

        if(row.close != null && row.close !== '')
        {
            minutes[index] = Number(row.close);
            values[index] = Number(row.value || 0);
            ++points;
        }
    })

    return {minutes, values, points};
}

const LoadDbMinuteCloseOneDay=(db_id, ticker, todayformat)=>{
    const loadStart = Date.now();
    ++dbMinuteCloseCache.loadingTickers;
    return new Promise((resolve)=>{
        const marketfnc = GetMarket(db_id, 'm');
        marketfnc((conn)=>{
            const sql = 'SELECT time,close,value FROM ?? WHERE code=? AND date=? AND time>? AND time<?';
            const tickerstr = String(ticker).toLowerCase();
            conn.query(sql, [ticker, tickerstr, String(todayformat), '0900', '1600'], (err, rows)=>{
                conn.release();
                --dbMinuteCloseCache.loadingTickers;

                if(err || !rows || rows.length <= 0)
                {
                    resolve(null);
                    return;
                }

                ++dbMinuteCloseCache.loadedTickers;
                dbMinuteCloseCache.loadedRows += rows.length;
                const compact = CompactMinuteRows(rows);
                dbMinuteCloseCache.loadedPoints += compact.points;
                dbMinuteCloseCache.elapsedMs += Date.now() - loadStart;

                resolve({
                    products:compact.minutes,
                    values:compact.values,
                    ticker:ticker,
                    stockname:'',
                    simMinuteCompact:true,
                    simMinuteValueCompact:true,
                });
            })
        })
    });
}

const GetDbCachedMinuteCloseData=async(db_id, ticker, todayformat)=>{
    return LoadDbMinuteCloseOneDay(db_id, ticker, todayformat);
}

const DecodeMinuteCacheFloat32=(encoded)=>{
    if(!encoded)
        return null;

    const buffer = Buffer.from(encoded, 'base64');
    if(buffer.length <= 0 || buffer.length % 4 !== 0)
        return null;

    const view = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    return new Float32Array(view);
}

const DecodeMinuteCacheUint16=(encoded)=>{
    if(!encoded)
        return null;

    const buffer = Buffer.from(encoded, 'base64');
    if(buffer.length <= 0 || buffer.length % 2 !== 0)
        return null;

    const view = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    return new Uint16Array(view);
}

const DecodeMinuteCacheUint32=(encoded)=>{
    if(!encoded)
        return null;

    const buffer = Buffer.from(encoded, 'base64');
    if(buffer.length <= 0 || buffer.length % 4 !== 0)
        return null;

    const view = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    return new Uint32Array(view);
}

const DecodeMinuteCacheFloat64=(encoded)=>{
    if(!encoded)
        return null;

    const buffer = Buffer.from(encoded, 'base64');
    if(buffer.length <= 0 || buffer.length % 8 !== 0)
        return null;

    const view = new Float64Array(buffer.buffer, buffer.byteOffset, buffer.length / 8);
    return new Float64Array(view);
}

const NeedMinuteValueForSimulation=()=>{
    return true;
}

const RestoreMinuteCacheSparseV2=(item, debugInfo = null)=>{
    const fail = (reason) => {
        if(debugInfo)
            debugInfo.reason = reason;
        return null;
    };
    if(!item || item.version !== 2 || item.layout !== 'sparse-columnar')
        return fail('bad-layout');

    const idx = DecodeMinuteCacheUint16(item.idx);
    const close = DecodeMinuteCacheUint32(item.close);
    const needValue = NeedMinuteValueForSimulation();
    const value = needValue ? DecodeMinuteCacheFloat64(item.value) : null;
    if(!idx || !close || idx.length !== close.length || (needValue && (!value || idx.length !== value.length)))
        return fail(`bad-columns idx:${idx ? idx.length : 'null'} close:${close ? close.length : 'null'} value:${value ? value.length : 'null'} needValue:${needValue}`);

    const minutes = new Float32Array(DB_MINUTE_CACHE_MAX_MINUTES);
    const values = needValue ? new Float64Array(DB_MINUTE_CACHE_MAX_MINUTES) : null;
    minutes.fill(NaN);

    for(let i = 0; i < idx.length; ++i)
    {
        const index = idx[i];
        if(index >= 0 && index < DB_MINUTE_CACHE_MAX_MINUTES)
        {
            minutes[index] = close[i];
            if(values)
                values[index] = value[i];
        }
    }

    return {
        products:minutes,
        values:values,
        ticker:String(item.ticker || '').toLowerCase(),
        stockname:'',
        simMinuteCompact:true,
        simMinuteValueCompact:!!values,
    };
}

const MakeMinuteCacheHeaders=()=>{
    return MINUTE_CACHE_TOKEN ? {'x-minute-cache-token':MINUTE_CACHE_TOKEN} : {};
}

const EncryptMinuteCachePayload=(data)=>{
    if(!MINUTE_CACHE_BOOTSTRAP_SECRET)
        return null;

    const key = crypto.createHash('sha256').update(String(MINUTE_CACHE_BOOTSTRAP_SECRET)).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(data), 'utf8'),
        cipher.final()
    ]);

    return {
        iv:iv.toString('base64'),
        tag:cipher.getAuthTag().toString('base64'),
        data:encrypted.toString('base64'),
    };
}

const StartMinuteCacheViaSupervisor=async()=>{
    if(!MINUTE_CACHE_SUPERVISOR_URL)
        return false;

    if(minuteCacheSupervisorStartPromise)
        return minuteCacheSupervisorStartPromise;

    minuteCacheSupervisorStartPromise = (async()=>{
        try
        {
            const res = await axios.post(`${MINUTE_CACHE_SUPERVISOR_URL}/start-cache`, null, {
                headers:MakeMinuteCacheHeaders(),
                timeout:Number(process.env.MINUTE_CACHE_TIMEOUT_MS || 30000),
            });
            const ok = !!(res.data && res.data.ok);
            AddSimulationLog(`[MINUTE_CACHE_SUPERVISOR_START] ok:${ok}`);
            return ok;
        }
        catch(err)
        {
            AddSimulationLog(`[MINUTE_CACHE_SUPERVISOR_START_ERR] ${err.message}`);
            return false;
        }
        finally
        {
            minuteCacheSupervisorStartPromise = null;
        }
    })();

    return minuteCacheSupervisorStartPromise;
}

const BootstrapMinuteCacheServer=async()=>{
    if(!MINUTE_CACHE_URL)
        return false;

    if(minuteCacheBootstrapPromise)
        return minuteCacheBootstrapPromise;

    minuteCacheBootstrapPromise = (async()=>{
        try
        {
            const health = await axios.get(`${MINUTE_CACHE_URL}/health`, {
                timeout:Number(process.env.MINUTE_CACHE_TIMEOUT_MS || 30000),
            });
            if(health.data && health.data.ok && health.data.dbReady)
            {
                AddSimulationLog(`[MINUTE_CACHE_BOOTSTRAP] already-ready`);
                return true;
            }
        }
        catch(err)
        {
            AddSimulationLog(`[MINUTE_CACHE_HEALTH_ERR] ${err.message}`);
        }

        if(!MINUTE_CACHE_BOOTSTRAP_SECRET)
        {
            AddSimulationLog(`[MINUTE_CACHE_BOOTSTRAP_ERR] secret empty`);
            return false;
        }

        if(MINUTE_CACHE_DISABLE_BOOTSTRAP)
        {
            AddSimulationLog(`[MINUTE_CACHE_BOOTSTRAP_SKIP] disabled`);
            return false;
        }

        const payload = EncryptMinuteCachePayload({
            host:dbpassword.host,
            user:dbpassword.user,
            password:dbpassword.password,
        });

        if(!payload)
            return false;

        try
        {
            const res = await axios.post(`${MINUTE_CACHE_URL}/bootstrap-db`, {
                token:MINUTE_CACHE_TOKEN,
                payload,
            }, {
                headers:MakeMinuteCacheHeaders(),
                timeout:Number(process.env.MINUTE_CACHE_TIMEOUT_MS || 30000),
            });

            const ok = !!(res.data && res.data.ok);
            AddSimulationLog(`[MINUTE_CACHE_BOOTSTRAP] ok:${ok}`);
            return ok;
        }
        catch(err)
        {
            AddSimulationLog(`[MINUTE_CACHE_BOOTSTRAP_ERR] ${err.message}`);
            await StartMinuteCacheViaSupervisor();
            return false;
        }
    })();

    return minuteCacheBootstrapPromise;
}

const LoadMinuteCacheServerData=async(db_id, tickers, todayformat)=>{
    if(!MINUTE_CACHE_URL || !tickers.length)
        return null;

    const includeValue = NeedMinuteValueForSimulation();
    const normalizedTickers = tickers.map(ticker=>String(ticker).toLowerCase());
    const result = new Map();

    const bootstrapped = await BootstrapMinuteCacheServer();
    if(!bootstrapped)
    {
        minuteCacheBootstrapPromise = null;
        const bootstrappedAfterStart = await BootstrapMinuteCacheServer();
        if(!bootstrappedAfterStart)
        return null;
    }

    const started = Date.now();
    try
    {
        const res = await axios.get(`${MINUTE_CACHE_URL}/minute-data-v2`, {
            params:{
                db_id:db_id || '',
                date:todayformat,
                tickers:normalizedTickers.join(','),
                include_value:includeValue ? 'true' : 'false',
            },
            headers:MakeMinuteCacheHeaders(),
            timeout:Number(process.env.MINUTE_CACHE_TIMEOUT_MS || 30000),
        });
        const httpMs = Date.now() - started;

        if(!res.data || !res.data.ok || !res.data.data)
            return null;

        const decodeStart = Date.now();
        const noMinuteDataTickers = [];
        const restoreFailTickers = [];
        Object.entries(res.data.data).forEach(([ticker, item])=>{
            const tickerstr = String(ticker).toLowerCase();
            if(!item)
            {
                noMinuteDataTickers.push(tickerstr);
                result.set(tickerstr, null);
                return;
            }

            const debugInfo = {};
            const restored = RestoreMinuteCacheSparseV2(item, debugInfo);
            if(!restored)
            {
                restoreFailTickers.push(`${tickerstr}:${debugInfo.reason || 'unknown'}`);
                result.set(tickerstr, null);
                return;
            }

            result.set(tickerstr, restored);
        })
        const decodeMs = Date.now() - decodeStart;

        AddSimulationLog(`[MINUTE_CACHE_SERVER_V2] ${todayformat} tickers:${normalizedTickers.length} returned:${result.size} noMinuteData:${noMinuteDataTickers.length} restoreFail:${restoreFailTickers.length} remote:${res.data.elapsedMs}ms http:${httpMs}ms decode:${decodeMs}ms total:${Date.now() - started}ms`);
        if(noMinuteDataTickers.length)
            AddSimulationLog(`[MINUTE_CACHE_SERVER_V2_NO_MINUTE_DATA] ${todayformat} tickers:${noMinuteDataTickers.join(',')}`);
        if(restoreFailTickers.length)
            AddSimulationLog(`[MINUTE_CACHE_SERVER_V2_RESTORE_FAIL] ${todayformat} tickers:${restoreFailTickers.join(',')}`);
        return result;
    }
    catch(err)
    {
        AddSimulationLog(`[MINUTE_CACHE_SERVER_V2_ERR] ${todayformat} ${err.message}`);
    }

    try
    {
        const res = await axios.get(`${MINUTE_CACHE_URL}/minute-close`, {
            params:{
                db_id:db_id || '',
                date:todayformat,
                tickers:tickers.map(ticker=>String(ticker).toLowerCase()).join(','),
            },
            headers:MakeMinuteCacheHeaders(),
            timeout:Number(process.env.MINUTE_CACHE_TIMEOUT_MS || 30000),
        });

        if(!res.data || !res.data.ok || !res.data.data)
            return null;

        const result = new Map();
        Object.entries(res.data.data).forEach(([ticker, item])=>{
            const tickerstr = String(ticker).toLowerCase();
            if(!item || !item.data)
            {
                result.set(tickerstr, null);
                return;
            }

            const minutes = DecodeMinuteCacheFloat32(item.data);
            if(!minutes)
            {
                result.set(tickerstr, null);
                return;
            }

            result.set(tickerstr, {
                products:minutes,
                ticker:tickerstr,
                stockname:'',
                simMinuteCompact:true,
            });
        })

        AddSimulationLog(`[MINUTE_CACHE_SERVER_FALLBACK_V1] ${todayformat} tickers:${tickers.length} returned:${result.size} remote:${res.data.elapsedMs}ms total:${Date.now() - started}ms`);
        return result;
    }
    catch(err)
    {
        AddSimulationLog(`[MINUTE_CACHE_SERVER_ERR] ${todayformat} ${err.message}`);
        return null;
    }
}

const GetMinuteDataPreferCacheServer=async(db_id, ticker, todayformat)=>{
    if(MINUTE_CACHE_URL)
    {
        const minuteByTicker = await LoadMinuteCacheServerData(db_id, [ticker], todayformat);
        if(minuteByTicker)
        {
            const senddatam = minuteByTicker.get(String(ticker).toLowerCase());
            if(senddatam)
                return senddatam;
        }
    }

    return GetDbCachedMinuteCloseData(db_id, ticker, todayformat);
}

const LoadDbMinuteCloseUnionChunk=(db_id, tickers, todayformat)=>{
    const loadStart = Date.now();
    dbMinuteCloseCache.loadingTickers += tickers.length;

    return new Promise((resolve)=>{
        if(!tickers.length)
        {
            resolve(new Map());
            return;
        }

        const marketfnc = GetMarket(db_id, 'm');
        marketfnc((conn)=>{
            const sqlParts = [];
            const values = [];

            tickers.forEach(ticker=>{
                const tickerstr = String(ticker).toLowerCase();
                sqlParts.push('SELECT ? AS ticker,time,close,value FROM ?? WHERE code=? AND date=? AND time>? AND time<?');
                values.push(tickerstr, tickerstr, tickerstr, String(todayformat), '0900', '1600');
            })

            const sql = sqlParts.join(' UNION ALL ');
            conn.query(sql, values, (err, rows)=>{
                conn.release();
                dbMinuteCloseCache.loadingTickers -= tickers.length;

                if(err || !rows)
                {
                    resolve(null);
                    return;
                }

                const rowsByTicker = new Map();
                rows.forEach(row=>{
                    const ticker = String(row.ticker).toLowerCase();
                    let tickerRows = rowsByTicker.get(ticker);
                    if(!tickerRows)
                    {
                        tickerRows = [];
                        rowsByTicker.set(ticker, tickerRows);
                    }
                    tickerRows.push(row);
                })

                const result = new Map();
                rowsByTicker.forEach((tickerRows, ticker)=>{
                    const compact = CompactMinuteRows(tickerRows);
                    ++dbMinuteCloseCache.loadedTickers;
                    dbMinuteCloseCache.loadedRows += tickerRows.length;
                    dbMinuteCloseCache.loadedPoints += compact.points;
                    result.set(ticker, {
                        products:compact.minutes,
                        values:compact.values,
                        ticker:ticker,
                        stockname:'',
                        simMinuteCompact:true,
                        simMinuteValueCompact:true,
                    });
                })

                const chunkElapsed = Date.now() - loadStart;
                dbMinuteCloseCache.elapsedMs += chunkElapsed;
                ++dbMinuteCloseCache.chunks;
                dbMinuteCloseCache.maxChunkMs = Math.max(dbMinuteCloseCache.maxChunkMs, chunkElapsed);
                dbMinuteCloseCache.recentChunks.push({
                    ms:chunkElapsed,
                    tickers:tickers.length,
                    rows:rows.length,
                    first:tickers[0],
                    last:tickers[tickers.length - 1],
                });
                if(dbMinuteCloseCache.recentChunks.length > 8)
                    dbMinuteCloseCache.recentChunks.shift();
                resolve(result);
            })
        })
    });
}

const LoadDbMinuteCloseMultiChunk=(db_id, tickers, todayformat)=>{
    const loadStart = Date.now();
    dbMinuteCloseCache.loadingTickers += tickers.length;

    return new Promise((resolve)=>{
        if(!tickers.length)
        {
            resolve(new Map());
            return;
        }

        const marketfnc = GetMarket(db_id, 'm');
        marketfnc((conn)=>{
            const sqlParts = [];
            const values = [];

            tickers.forEach(ticker=>{
                const tickerstr = String(ticker).toLowerCase();
                sqlParts.push('SELECT time,close,value FROM ?? WHERE code=? AND date=? AND time>? AND time<?');
                values.push(tickerstr, tickerstr, String(todayformat), '0900', '1600');
            })

            conn.query(sqlParts.join(';'), values, (err, results)=>{
                conn.release();
                dbMinuteCloseCache.loadingTickers -= tickers.length;

                if(err || !Array.isArray(results))
                {
                    resolve(null);
                    return;
                }

                const result = new Map();
                let chunkRows = 0;
                tickers.forEach((ticker, index)=>{
                    const rows = Array.isArray(results[index]) ? results[index] : [];
                    if(rows.length <= 0)
                        return;

                    chunkRows += rows.length;
                    const tickerstr = String(ticker).toLowerCase();
                    const compact = CompactMinuteRows(rows);
                    ++dbMinuteCloseCache.loadedTickers;
                    dbMinuteCloseCache.loadedRows += rows.length;
                    dbMinuteCloseCache.loadedPoints += compact.points;
                    result.set(tickerstr, {
                        products:compact.minutes,
                        values:compact.values,
                        ticker:tickerstr,
                        stockname:'',
                        simMinuteCompact:true,
                        simMinuteValueCompact:true,
                    });
                })

                const chunkElapsed = Date.now() - loadStart;
                dbMinuteCloseCache.elapsedMs += chunkElapsed;
                ++dbMinuteCloseCache.chunks;
                dbMinuteCloseCache.maxChunkMs = Math.max(dbMinuteCloseCache.maxChunkMs, chunkElapsed);
                dbMinuteCloseCache.recentChunks.push({
                    ms:chunkElapsed,
                    tickers:tickers.length,
                    rows:chunkRows,
                    first:tickers[0],
                    last:tickers[tickers.length - 1],
                });
                if(dbMinuteCloseCache.recentChunks.length > 8)
                    dbMinuteCloseCache.recentChunks.shift();

                resolve(result);
            })
        })
    });
}

const MakeChunks=(items, chunkSize)=>{
    const chunks = [];
    for(let i = 0; i < items.length; i += chunkSize)
        chunks.push(items.slice(i, i + chunkSize));
    return chunks;
}

const EscapeSqlIdentifier=(value)=>{
    return `\`${String(value).replace(/`/g, '``')}\``;
}

const EscapeSqlString=(value)=>{
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const GetDbMinuteCacheStatus=()=>{
    return {
        loadedTickers:dbMinuteCloseCache.loadedTickers,
        loadingTickers:dbMinuteCloseCache.loadingTickers,
        lastDate:dbMinuteCloseCache.lastDate,
        loadedRows:dbMinuteCloseCache.loadedRows,
        loadedPoints:dbMinuteCloseCache.loadedPoints,
        elapsedMs:dbMinuteCloseCache.elapsedMs,
        wallMs:dbMinuteCloseCache.dayStartMs ? Date.now() - dbMinuteCloseCache.dayStartMs : 0,
        totalMs:dbMinuteCloseCache.totalMs,
        mode:dbMinuteCloseCache.mode,
        chunks:dbMinuteCloseCache.chunks,
        maxChunkMs:dbMinuteCloseCache.maxChunkMs,
        recentChunks:dbMinuteCloseCache.recentChunks,
        memory:GetMemoryText(),
    };
}

const ResetDbMinuteDayStats=(todayformat)=>{
    dbMinuteCloseCache.lastDate = todayformat;
    dbMinuteCloseCache.loadedTickers = 0;
    dbMinuteCloseCache.loadingTickers = 0;
    dbMinuteCloseCache.loadedRows = 0;
    dbMinuteCloseCache.loadedPoints = 0;
    dbMinuteCloseCache.elapsedMs = 0;
    dbMinuteCloseCache.dayStartMs = Date.now();
    dbMinuteCloseCache.totalMs = 0;
    dbMinuteCloseCache.mode = '';
    dbMinuteCloseCache.chunks = 0;
    dbMinuteCloseCache.maxChunkMs = 0;
    dbMinuteCloseCache.recentChunks = [];
}

const PromisePool=async(items, limit, worker)=>{
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async()=>{
        while(nextIndex < items.length)
        {
            const curIndex = nextIndex++;
            results[curIndex] = await worker(items[curIndex], curIndex);
        }
    })
    await Promise.all(workers);
    return results;
}

async function tradesimmulation(db_id, sendTickers, todayformat,opendayformat,oneday){
    g_tradestocklist = [];
    updateCybosdata = false;

    // MarketChange(req.query.market);

    async function CallPromise(ticker)
    {
        // MarketChange('stocklistdayall');

        let senddata = senddatalist.find(senddata=>senddata.ticker.toLowerCase() === ticker.toLowerCase())
        if(senddata)
        {
            PrepareSimulationChartMeta(senddata.chartdatas);
            if(!UseOldMemcached())
            {
                const senddatam = await GetMinuteDataPreferCacheServer(db_id, ticker, todayformat);
                const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase(); 
                const existstock = g_tradestocklist.find(obj=>obj.ticker==caseTicker);

                if(senddatam && !existstock)
                {
                    g_tradestocklist.push({
                        name:senddata.name,
                        ticker:caseTicker,
                        chartdatas:senddata.chartdatas,
                        minchartdatas:senddatam.products,
                        minchartvalues:senddatam.values,
                        simMinuteCompact:true,
                        simMinuteValueCompact:senddatam.simMinuteValueCompact,
                    })
                    return caseTicker;
                }

                return -1;
            }

            return new Promise((resolve, reject) => Oldstocks(db_id, ticker, GetMarketname(db_id, 'm'), 'm', 'DEV', '', todayformat, opendayformat, (senddatam)=>
            {    
                const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase(); 
                const existstock = g_tradestocklist.find(obj=>obj.ticker==caseTicker);
                    
                if(senddatam && !existstock)
                {      
                    g_tradestocklist.push({
                        name:senddata.name, 
                        ticker:caseTicker,        
                        chartdatas:senddata.chartdatas,
                        minchartdatas:senddatam.products,
                    })
                    resolve(caseTicker);                
                }
                else
                {
                    resolve(-1);
                }
            }, true))
        }
        else
        {
            // return new Promise((resolve, reject) => oldstocks(ticker, 'stocklist', 'd', 'DEV', '', todayformat,opendayformat, (senddata)=>
            let todayfirst = new Date();
            let todayformatfirst = `${todayfirst.getFullYear()}${(todayfirst.getMonth()+1).toString().padStart(2,0)}${todayfirst.getDate().toString().padStart(2,0)}`;
            let opendayformatfirst = `${todayfirst.getFullYear()}-${(todayfirst.getMonth()+1).toString().padStart(2,0)}-${todayfirst.getDate().toString().padStart(2,0)}`;    
            
            return new Promise((resolve, reject) => Oldstocks(db_id, ticker, GetMarketname(db_id, 'm'), 'd', 'DEV', '', todayformatfirst,opendayformatfirst, (senddata)=>
            {                        
                if(senddata && Array.isArray(senddata.products))
                {
                    let before30startdate = new Date();
                    
                    if(oneday)
                    {
                        before30startdate.setDate(simulationstartdate.getDate()-beforedayperiod);
                    }
                    else
                    {
                        before30startdate = new Date(simulationstartdate);
                        before30startdate.setDate(before30startdate.getDate()- (defulatConfig.usebeforeliveperiod?90:beforedayperiod));
                        
                        // before30startdate = simulationstartdate
                    }

                    const filterdate = `${before30startdate.getFullYear()}${(before30startdate.getMonth()+1).toString().padStart(2,0)}${before30startdate.getDate().toString().padStart(2,0)}`;

                    const products = senddata.products.filter(product=>product.date >= filterdate)
                    Cacus(products);
                    PrepareSimulationChartMeta(products);
                    const caseTickerd = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
                    senddatalist.push({
                        name:senddata.stockname,
                        ticker:caseTickerd,        
                        chartdatas:products
                    })
    
                    // MarketChange('stocklist');
                    if(testvals[ticker] == null)
                    {
                        testvals[ticker] = 0;
                    }
                    else
                    {
                        ++testvals[ticker];
                    }
                    const PushMinuteStock=(senddatam)=>{
                        const caseTickerm = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
                        const existstock = g_tradestocklist.find(obj=>obj.ticker==caseTickerm);
                    
                        if(senddatam && !existstock)
                        {
                            g_tradestocklist.push({
                                name:senddata.stockname, 
                                ticker:caseTickerm,
                                chartdatas:products,
                                minchartdatas:senddatam.products,
                                minchartvalues:senddatam.values,
                                simMinuteCompact:senddatam.simMinuteCompact,
                                simMinuteValueCompact:senddatam.simMinuteValueCompact,
                            })
                            resolve(caseTickerm);
                        }   
                        else
                        {
                            // console.log(senddata.stockname);
                            resolve(-1);
                        }                            
                    }

                    if(!UseOldMemcached())
                    {
                        GetMinuteDataPreferCacheServer(db_id, ticker, todayformat).then(PushMinuteStock);
                    }
                    else
                    {
                        Oldstocks(db_id, ticker, GetMarketname(db_id, 'm'), 'm', 'DEV', '', todayformat, opendayformat, PushMinuteStock, true);
                    }
                }
                else
                {
                    if(defulatConfig.usesinglesimulation)
                        AddSimulationLog(`[SINGLE_CANDIDATE_NO_DAILY] ${ticker}`);
                    resolve(-1);
                }
            }, false))
        }        
    }

    const LoadDailyForSimulation=async(ticker)=>{
        let cached = senddatalist.find(senddata=>senddata.ticker.toLowerCase() === ticker.toLowerCase());
        if(cached)
        {
            PrepareSimulationChartMeta(cached.chartdatas);
            return cached;
        }

        let todayfirst = new Date();
        let todayformatfirst = `${todayfirst.getFullYear()}${(todayfirst.getMonth()+1).toString().padStart(2,0)}${todayfirst.getDate().toString().padStart(2,0)}`;
        let opendayformatfirst = `${todayfirst.getFullYear()}-${(todayfirst.getMonth()+1).toString().padStart(2,0)}-${todayfirst.getDate().toString().padStart(2,0)}`;

        return new Promise((resolve) => Oldstocks(db_id, ticker, GetMarketname(db_id, 'm'), 'd', 'DEV', '', todayformatfirst, opendayformatfirst, (senddata)=>
        {
            if(!senddata || !Array.isArray(senddata.products))
            {
                if(defulatConfig.usesinglesimulation)
                    AddSimulationLog(`[SINGLE_CANDIDATE_NO_DAILY] ${ticker}`);
                resolve(null);
                return;
            }

            let before30startdate = new Date();
            if(oneday)
            {
                before30startdate.setDate(simulationstartdate.getDate()-beforedayperiod);
            }
            else
            {
                before30startdate = new Date(simulationstartdate);
                before30startdate.setDate(before30startdate.getDate()- (defulatConfig.usebeforeliveperiod?90:beforedayperiod));
            }

            const filterdate = `${before30startdate.getFullYear()}${(before30startdate.getMonth()+1).toString().padStart(2,0)}${before30startdate.getDate().toString().padStart(2,0)}`;
            const products = senddata.products.filter(product=>product.date >= filterdate);
            Cacus(products);
            PrepareSimulationChartMeta(products);

            const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
            const loaded = {
                name:senddata.stockname,
                ticker:caseTicker,
                chartdatas:products,
            };
            senddatalist.push(loaded);

            if(testvals[ticker] == null)
                testvals[ticker] = 0;
            else
                ++testvals[ticker];

            resolve(loaded);
        }, false));
    }

    const GetSimulationDailyFilterDate=()=>{
        let before30startdate = new Date();
        if(oneday)
        {
            before30startdate.setDate(simulationstartdate.getDate()-beforedayperiod);
        }
        else
        {
            before30startdate = new Date(simulationstartdate);
            before30startdate.setDate(before30startdate.getDate()- (defulatConfig.usebeforeliveperiod?90:beforedayperiod));
        }

        return `${before30startdate.getFullYear()}${(before30startdate.getMonth()+1).toString().padStart(2,0)}${before30startdate.getDate().toString().padStart(2,0)}`;
    }

    const GetSimulationDailyFilterEndDate=()=>{
        const end = new Date(defulatConfig.simulationenddate || todayformat);
        if(isNaN(end.getTime()))
            return todayformat;

        return `${end.getFullYear()}${(end.getMonth()+1).toString().padStart(2,0)}${end.getDate().toString().padStart(2,0)}`;
    }

    const BuildLoadedDailyForSimulation=(ticker, rows, filterdate)=>{
        if(!rows || rows.length <= 0)
            return null;

        const products = rows.filter(product=>product.date >= filterdate);
        if(products.length <= 0)
            return null;

        products.sort((a,b)=>{
            if(a.date === b.date)
                return 0;
            return a.date > b.date ? 1 : -1;
        })
        products.forEach(product=>{
            product.macdlongshort = '';
        })

        Cacus(products);
        PrepareSimulationChartMeta(products);

        const dailydata = products[0];
        const caseTicker = IsNaq(db_id) ? ticker.toUpperCase():ticker.toLowerCase();
        const loaded = {
            name:dailydata.name,
            ticker:caseTicker,
            chartdatas:products,
        };

        return loaded;
    }

    const LoadDailyForSimulationBatch=async(indexes)=>{
        const resultByIndex = new Map();
        const uncachedIndexes = [];
        indexes.forEach((sendTickerIndex)=>{
            const ticker = sendTickers[sendTickerIndex];
            const cached = senddatalist.find(senddata=>senddata.ticker.toLowerCase() === ticker.toLowerCase());
            if(cached)
            {
                PrepareSimulationChartMeta(cached.chartdatas);
                resultByIndex.set(sendTickerIndex, cached);
                return;
            }

            uncachedIndexes.push(sendTickerIndex);
        })

        if(uncachedIndexes.length <= 0)
            return resultByIndex;

        const filterdate = GetSimulationDailyFilterDate();
        const filterEndDate = GetSimulationDailyFilterEndDate();
        const batchStart = Date.now();
        const chunks = MakeChunks(uncachedIndexes, 60);
        let batchLoaded = 0;
        let batchFallback = 0;
        let batchQueryMs = 0;
        let batchBuildMs = 0;
        let batchRows = 0;
        const prePushedIndexes = new Set();

        await PromisePool(chunks, 2, async(group)=>{
            const sqlquery = group.map((sendTickerIndex)=>{
                const ticker = sendTickers[sendTickerIndex];
                const tickerValue = EscapeSqlString(ticker);
                const tableName = EscapeSqlIdentifier(ticker);
                return `SELECT '${tickerValue}' AS _sim_ticker, d.* FROM ${tableName} d WHERE d.date >= '${filterdate}' AND d.date <= '${filterEndDate}'`;
            }).join(' UNION ALL ');

            const queryStart = Date.now();
            const queryResult = await new Promise((resolve)=>{
                const marketfncd = GetMarket(db_id,'d');
                marketfncd((connd)=>{
                    connd.query(sqlquery, (err, rows)=>{
                        connd.release();
                        if(err || !rows)
                        {
                            resolve(null);
                            return;
                        }

                        const grouped = new Map();
                        rows.forEach((row)=>{
                            const ticker = row._sim_ticker;
                            delete row._sim_ticker;
                            if(!grouped.has(ticker))
                                grouped.set(ticker, []);
                            grouped.get(ticker).push(row);
                        })
                        resolve({grouped, rowCount:rows.length});
                    })
                })
            })
            batchQueryMs += Date.now() - queryStart;

            if(!queryResult)
            {
                batchFallback += group.length;
                for(let i = 0; i < group.length; ++i)
                {
                    const sendTickerIndex = group[i];
                    const senddata = await LoadDailyForSimulation(sendTickers[sendTickerIndex]);
                    if(senddata)
                    {
                        resultByIndex.set(sendTickerIndex, senddata);
                        prePushedIndexes.add(sendTickerIndex);
                    }
                }
                return;
            }

            const rowsByTicker = queryResult.grouped;
            batchRows += queryResult.rowCount;
            const buildStart = Date.now();
            group.forEach((sendTickerIndex)=>{
                const ticker = sendTickers[sendTickerIndex];
                const rows = rowsByTicker.get(ticker) || [];
                const loaded = BuildLoadedDailyForSimulation(ticker, rows, filterdate);
                if(loaded)
                {
                    ++batchLoaded;
                    resultByIndex.set(sendTickerIndex, loaded);
                }
            })
            batchBuildMs += Date.now() - buildStart;
        })

        uncachedIndexes.forEach((sendTickerIndex)=>{
            const loaded = resultByIndex.get(sendTickerIndex);
            if(!loaded)
                return;
            if(prePushedIndexes.has(sendTickerIndex))
                return;

            senddatalist.push(loaded);
            const ticker = sendTickers[sendTickerIndex];
            if(testvals[ticker] == null)
                testvals[ticker] = 0;
            else
                ++testvals[ticker];
        })

        if(uncachedIndexes.length > 0)
            AddSimulationLog(`[DBDAILY_MISSING_BATCH] ${todayformat} targets:${uncachedIndexes.length} loaded:${batchLoaded} fallback:${batchFallback} chunks:${chunks.length} rows:${batchRows} query:${batchQueryMs}ms build:${batchBuildMs}ms elapsed:${Date.now() - batchStart}ms`);

        return resultByIndex;
    }

    if(!UseOldMemcached())
    {
        ResetDbMinuteDayStats(todayformat);

        const cachedDailyList = sendTickers.map(ticker=>
            senddatalist.find(senddata=>senddata.ticker.toLowerCase() === ticker.toLowerCase())
        );
        const cachedIndexes = [];
        const missingIndexes = [];

        cachedDailyList.forEach((senddata, index)=>{
            if(senddata)
                cachedIndexes.push(index);
            else
                missingIndexes.push(index);
        })

        const dbMinuteLoadStart = Date.now();
        dbMinuteCloseCache.mode = 'multi';
        const cachedIndexChunks = MakeChunks(cachedIndexes, DB_MINUTE_MULTI_CHUNK_SIZE);

        if(MINUTE_CACHE_URL)
        {
            const uniqueMissingIndexes = Array.from(new Set(missingIndexes));
            const loadedDailyByIndexPromise = LoadDailyForSimulationBatch(uniqueMissingIndexes);
            const cacheServerTickers = cachedIndexes.map(sendTickerIndex=>sendTickers[sendTickerIndex]);
            const minuteByTickerFromServer = cachedIndexes.length > 0 ? await LoadMinuteCacheServerData(db_id, cacheServerTickers, todayformat) : new Map();

            if(minuteByTickerFromServer)
            {
                let cacheServerLoadedCount = 0;
                const cacheServerMissingIndexes = [];
                cachedIndexes.forEach(sendTickerIndex=>{
                    const senddata = cachedDailyList[sendTickerIndex];
                    PrepareSimulationChartMeta(senddata.chartdatas);

                    const ticker = sendTickers[sendTickerIndex];
                    const senddatam = minuteByTickerFromServer.get(String(ticker).toLowerCase());
                    if(!senddatam)
                    {
                        cacheServerMissingIndexes.push(sendTickerIndex);
                        return;
                    }

                    ++cacheServerLoadedCount;
                    const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
                    g_tradestocklist.push({
                        name:senddata.name,
                        ticker:caseTicker,
                        chartdatas:senddata.chartdatas,
                        minchartdatas:senddatam.products,
                        minchartvalues:senddatam.values,
                        simMinuteCompact:true,
                        simMinuteValueCompact:senddatam.simMinuteValueCompact,
                    });
                })

                if(cacheServerLoadedCount <= 0 && cachedIndexes.length > 0)
                {
                    g_tradestocklist = [];
                    AddSimulationLog(`[MINUTE_CACHE_SERVER_FALLBACK] ${todayformat} cache server returned no minute rows`);
                }
                else
                {

                    const uniqueCacheServerMissingIndexes = Array.from(new Set(cacheServerMissingIndexes));
                    const loadedDailyIndexes = [];
                    const fallbackSingleIndexes = [];

                    const loadedDailyByIndex = await loadedDailyByIndexPromise;
                    uniqueMissingIndexes.forEach((sendTickerIndex)=>{
                        const senddata = loadedDailyByIndex.get(sendTickerIndex);
                        if(senddata)
                        {
                            cachedDailyList[sendTickerIndex] = senddata;
                            loadedDailyIndexes.push(sendTickerIndex);
                        }
                        else
                        {
                            fallbackSingleIndexes.push(sendTickerIndex);
                        }
                    })

                    const fallbackMinuteIndexes = Array.from(new Set(uniqueCacheServerMissingIndexes.concat(loadedDailyIndexes)));
                    if(fallbackMinuteIndexes.length > 0)
                    {
                        const fallbackMinuteTickers = fallbackMinuteIndexes.map(sendTickerIndex=>sendTickers[sendTickerIndex]);
                        const fallbackMinuteByTicker = await LoadMinuteCacheServerData(db_id, fallbackMinuteTickers, todayformat);
                        let fallbackBatchLoaded = 0;

                        if(fallbackMinuteByTicker)
                        {
                            fallbackMinuteIndexes.forEach(sendTickerIndex=>{
                                const senddata = cachedDailyList[sendTickerIndex];
                                if(!senddata)
                                {
                                    fallbackSingleIndexes.push(sendTickerIndex);
                                    return;
                                }

                                PrepareSimulationChartMeta(senddata.chartdatas);
                                const ticker = sendTickers[sendTickerIndex];
                                const senddatam = fallbackMinuteByTicker.get(String(ticker).toLowerCase());
                                if(!senddatam)
                                {
                                    fallbackSingleIndexes.push(sendTickerIndex);
                                    return;
                                }

                                ++fallbackBatchLoaded;
                                const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
                                g_tradestocklist.push({
                                    name:senddata.name,
                                    ticker:caseTicker,
                                    chartdatas:senddata.chartdatas,
                                    minchartdatas:senddatam.products,
                                    minchartvalues:senddatam.values,
                                    simMinuteCompact:true,
                                    simMinuteValueCompact:senddatam.simMinuteValueCompact,
                                });
                            })
                        }
                        else
                        {
                            fallbackMinuteIndexes.forEach(sendTickerIndex=>fallbackSingleIndexes.push(sendTickerIndex));
                        }

                        const fallbackMinuteTickerLog = fallbackMinuteIndexes.map(sendTickerIndex=>sendTickers[sendTickerIndex]).join(',');
                        const fallbackSingleTickerLog = fallbackSingleIndexes.map(sendTickerIndex=>sendTickers[sendTickerIndex]).join(',');
                        AddSimulationLog(`[DBMIN_MISSING_BATCH] ${todayformat} daily:${loadedDailyIndexes.length} minute:${fallbackMinuteIndexes.length} loaded:${fallbackBatchLoaded} single:${fallbackSingleIndexes.length} minuteTickers:${fallbackMinuteTickerLog} singleTickers:${fallbackSingleTickerLog}`);
                    }

                    const uniqueFallbackSingleIndexes = Array.from(new Set(fallbackSingleIndexes));
                    for(let i = 0; i < uniqueFallbackSingleIndexes.length; ++i)
                    {
                        await CallPromise(sendTickers[uniqueFallbackSingleIndexes[i]]);
                    }

                    const tradeStockByTicker = new Map(g_tradestocklist.map(tradestock=>[tradestock.ticker.toLowerCase(), tradestock]));
                    g_tradestocklist = sendTickers.map(ticker=>tradeStockByTicker.get(ticker.toLowerCase())).filter(Boolean);
                    dbMinuteCloseCache.totalMs = Date.now() - dbMinuteLoadStart;
                    AddSimulationLog(`[DBMIN_FASTPATH] ${todayformat} mode:minute-cache-server cached:${cachedIndexes.length} missing:${uniqueMissingIndexes.length} nullfallback:${uniqueCacheServerMissingIndexes.length} loaded:${g_tradestocklist.length} total:${dbMinuteCloseCache.totalMs}ms ${GetMemoryText()}`);
                    return;
                }
            }
            else
            {
                await loadedDailyByIndexPromise;
            }
        }

        await PromisePool(cachedIndexChunks, DB_MINUTE_MULTI_CONCURRENCY, async(indexChunk)=>{
            const chunkTickers = indexChunk.map(sendTickerIndex=>sendTickers[sendTickerIndex]);
            const minuteByTicker = await LoadDbMinuteCloseMultiChunk(db_id, chunkTickers, todayformat);

            if(!minuteByTicker)
            {
                indexChunk.forEach(sendTickerIndex=>missingIndexes.push(sendTickerIndex));
                return;
            }

            indexChunk.forEach(sendTickerIndex=>{
                const senddata = cachedDailyList[sendTickerIndex];
                PrepareSimulationChartMeta(senddata.chartdatas);

                const ticker = sendTickers[sendTickerIndex];
                const senddatam = minuteByTicker.get(String(ticker).toLowerCase());
                if(!senddatam)
                {
                    missingIndexes.push(sendTickerIndex);
                    return;
                }

                const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
                g_tradestocklist.push({
                    name:senddata.name,
                    ticker:caseTicker,
                    chartdatas:senddata.chartdatas,
                    minchartdatas:senddatam.products,
                    minchartvalues:senddatam.values,
                    simMinuteCompact:true,
                    simMinuteValueCompact:senddatam.simMinuteValueCompact,
                });
            })
        })

        const uniqueMissingIndexes = Array.from(new Set(missingIndexes));
        for(let i = 0; i < uniqueMissingIndexes.length; ++i)
        {
            await CallPromise(sendTickers[uniqueMissingIndexes[i]]);
        }

        const tradeStockByTicker = new Map(g_tradestocklist.map(tradestock=>[tradestock.ticker.toLowerCase(), tradestock]));
        g_tradestocklist = sendTickers.map(ticker=>tradeStockByTicker.get(ticker.toLowerCase())).filter(Boolean);
        dbMinuteCloseCache.totalMs = Date.now() - dbMinuteLoadStart;
        AddSimulationLog(`[DBMIN_FASTPATH] ${todayformat} mode:multi cached:${cachedIndexes.length} chunks:${cachedIndexChunks.length} concurrency:${DB_MINUTE_MULTI_CONCURRENCY} missing:${uniqueMissingIndexes.length} loaded:${g_tradestocklist.length} rows:${dbMinuteCloseCache.loadedRows} points:${dbMinuteCloseCache.loadedPoints} dbElapsed:${dbMinuteCloseCache.elapsedMs}ms total:${dbMinuteCloseCache.totalMs}ms ${GetMemoryText()}`);
        return;
    }

    if(UseOldMemcached())
    {
        let cachedDailyList = sendTickers.map(ticker=>
            senddatalist.find(senddata=>senddata.ticker.toLowerCase() === ticker.toLowerCase())
        );
        const cachedIndexes = [];
        const missingIndexes = [];

        cachedDailyList.forEach((senddata, index)=>{
            if(senddata)
                cachedIndexes.push(index);
            else
                missingIndexes.push(index);
        })

        if(missingIndexes.length > 0)
        {
            const uniqueMissingIndexes = Array.from(new Set(missingIndexes));
            await LoadDailyForSimulationBatch(uniqueMissingIndexes);
            
            missingIndexes.forEach(index => {
                const ticker = sendTickers[index];
                const senddata = senddatalist.find(s=>s.ticker.toLowerCase() === ticker.toLowerCase());
                if(senddata)
                {
                    cachedDailyList[index] = senddata;
                    cachedIndexes.push(index);
                }
            });
            missingIndexes.length = 0;
        }

        if(cachedIndexes.length > 0)
        {
            const minuteKeys = cachedIndexes.map(index=>`${todayformat.slice(2)}${sendTickers[index]}`.toLowerCase());
            const minuteByKey = await new Promise((resolve)=>{
                GetMemcachedDataMulti(minuteKeys, (resultByKey)=>resolve(resultByKey || {}));
            })

            cachedIndexes.forEach((sendTickerIndex, minuteKeyIndex)=>{
                const senddata = cachedDailyList[sendTickerIndex];
                if (!senddata) return;

                PrepareSimulationChartMeta(senddata.chartdatas);

                const ticker = sendTickers[sendTickerIndex];
                const minuteData = minuteByKey[minuteKeys[minuteKeyIndex]];
                if(!minuteData)
                {
                    missingIndexes.push(sendTickerIndex);
                    return;
                }

                let curtime = "09:00"; 
                let curdate = new Date(`1970-01-01T${curtime}:00`);
                const formattedMinuteData = minuteData.reduce(function(accu, curr) {
                    const curminute = curdate.toTimeString().slice(0, 5).replace(':', '');
                    curdate.setMinutes(curdate.getMinutes() + 1);

                    if(curr === '') 
                        accu.push({'close': null, 'code': ticker, 'time': curminute});
                    else
                        accu.push({'close': parseFloat(curr), 'code': ticker, 'time': curminute});
                    return accu;
                }, []);

                const caseTicker = IsNaq(db_id) ? senddata.ticker.toUpperCase():senddata.ticker.toLowerCase();
                g_tradestocklist.push({
                    name:senddata.name,
                    ticker:caseTicker,
                    chartdatas:senddata.chartdatas,
                    minchartdatas:formattedMinuteData,
                    simMinuteCompact:false,
                });
            })
        }

        const uniqueMissingIndexes = Array.from(new Set(missingIndexes));
        for(let i = 0; i < uniqueMissingIndexes.length; ++i)
        {
            await CallPromise(sendTickers[uniqueMissingIndexes[i]]);
        }

        const tradeStockByTicker = new Map(g_tradestocklist.map(tradestock=>[tradestock.ticker.toLowerCase(), tradestock]));
        g_tradestocklist = sendTickers.map(ticker=>tradeStockByTicker.get(ticker.toLowerCase())).filter(Boolean);
        AddSimulationLog(`[TRADELOAD_FASTPATH] ${todayformat} cached:${cachedIndexes.length} missing:${uniqueMissingIndexes.length} loaded:${g_tradestocklist.length}`);
        return;
    }

    for(let i = 0; i < sendTickers.length; ++i)
    {
        const r = await CallPromise(sendTickers[i]);

        // if(r === -1)
        // {
        //     g_tradestocklist = [];
        //     break;
        // }
    }
}

let g_accountsimulation = {};
function Initaccountsimulation(forcereset, db_id)
{
    if(forcereset)
        g_accountsimulation = {};

    Object.entries(g_accountsimulation).forEach(element=>{
        if(element[0] !== "a0")
        {
            if(element[1].todayaction === 'bought' || element[1].todayaction === 'sold')
            {
                element[1].todayaction = 'none';
            }
        }
    })     

    g_tradestocklist.forEach(tradestock=>{                
        if(!g_accountsimulation[tradestock.ticker])
        {
            g_accountsimulation[tradestock.ticker] = {
                company : 'KIS',
                name : tradestock.stockname,
                ticker : tradestock.ticker,//IsNaq(db_id) ? tradestock.ticker : tradestock.ticker.substr(1,tradestock.ticker.length),
                averagebuyprice : 0.0,
                amount : 0,
                todayaction : 'none',
                datetime : null,
                buytime : null,
                macdlongshort : '',
                falseamount : 0,
                falseaveragebuyprice : 0,
                falsecashamount : 0,
                todaybuycnt: 0,
                todayselcnt: 0,
            } 
        }            
        // 원래 있던 종목의 계좌 초기화
        else{
            g_accountsimulation[tradestock.ticker].todaybuycnt = 0;
            g_accountsimulation[tradestock.ticker].todayselcnt = 0;
        }
    })       

    if(!g_accountsimulation['a0'])
    g_accountsimulation['a0'] = {
        company : 'KIS',
        name : 'CASH',
        ticker : 'a0',
        averagebuyprice : 0.0,
        amount : IsNaq(db_id) ? defulatConfig.initmoney_naq : defulatConfig.initmoney,
        totalcapital : IsNaq(db_id) ? defulatConfig.initmoney_naq : defulatConfig.initmoney,
        todayaction : 'none',
        datetime : null,
        buytime : null,
        macdlongshort : '',
        falseamount : 0,
        falseamountBuy : 0,
        todaybuycnt: 0,
        todayselcnt: 0,
    }     
}

async function Initaccountsimulationfromdb(db_id)
{
    async function initwalletpromise(today) {
        moneytotalmoney = 0;
        stocktotalmoney = 0;
        injurancetotalmoney = 0;
        stockkind = 0;    
        let accountsimulation = Object.entries(g_accountsimulation)
        for(let i = 0; i < accountsimulation.length; ++i)
        {
            let element = accountsimulation[i];
            const r = await CacuTotalCapitalPromise(element, today);
        }     
        beforetotalcapital = stocktotalmoney+moneytotalmoney+injurancetotalmoney;     
        console.log(`start asset:${beforetotalcapital}`);              
    }

    //let today = `${curdate.getFullYear()}${(curdate.getMonth()+1).toString().padStart(2,0)}${curdate.getDate().toString().padStart(2,0)}`; 

    g_accountsimulation = {};         
    let before1startdate = new Date();
    before1startdate.setDate(simulationstartdate.getDate()-1);// normal test     
    //before1startdate.setDate(simulationstartdate.getDate()-3);  // mondaytest
    const querydate = `${before1startdate.getFullYear()}_${(before1startdate.getMonth()+1).toString().padStart(2,0)}_${before1startdate.getDate().toString().padStart(2,0)}`
    const today = `${before1startdate.getFullYear()}${(before1startdate.getMonth()+1).toString().padStart(2,0)}${before1startdate.getDate().toString().padStart(2,0)}`
    
    db_walletsnapshot((conn) => {    
        conn.query(`SELECT * FROM ${db_id}_${querydate}`, (err, data) => {
            conn.release();
            if(!err) {
                data.forEach((element)=>{
                    g_accountsimulation[`a${element.ticker}`] = {
                        company : 'KIS',
                        name : element.name,
                        ticker : `a${element.ticker}`,
                        averagebuyprice : element.price,
                        amount : element.amount,
                        todayaction : 'none',
                        datetime : null,
                        buytime : null, 
                        macdlongshort : '',
                        todaybuycnt: 0,
                        todayselcnt: 0,
                    } 
                })

                initwalletpromise(today);
            }
            else {
                // res.send(err);
            }
        })          
    });      
}

let beforetotalcapital = 0;
let longshortcount = {};
let moneytotalmoney = 0;
let injurancetotalmoney = 0;
let stocktotalmoney = 0;
let stockkind = 0;
let assetCrashReboundDownStartCapital = 0;
let assetCrashReboundDownDays = 0;

async function CacuTotalCapitalPromise(element, today, tradestockdic)
{
    return new Promise((resolve, reject) =>         
    {                
        let price = 0;
        const ticker = element[0];
        let tradeStock = tradestockdic[ticker];//g_tradestocklist.find(obj=>obj.ticker===ticker);
        let amount = Number(element[1].amount);
        let induramount = element[1].induranceamount ? Number(element[1].induranceamount) : 0;
        if(ticker === "a0")
        {
            moneytotalmoney += amount;
            injurancetotalmoney = induramount;
            resolve();
        }
        else if(amount > 0)
        {
            ++stockkind;
            if(!tradeStock)
            {            
                const marketfncd = GetMarket(db_id,'d');           
                marketfncd((connd)=>{ 
                    connd.query(`SELECT * FROM ${ticker} WHERE date=${today} LIMIT 1`, (err, data) => {
                        connd.release();
                        if(!data || !data[0])
                        {
                            price = element[1].latestclose;
                            stocktotalmoney += Number(price) * amount;
                            console.log(`CacuTotalCapitalPromiseError ${ticker} ${today}`);
                        }
                        else
                        {
                            price = data[0].close;
                            stocktotalmoney += Number(price) * amount;
                        }
                        resolve();
                    })
                })                     
            }
            else 
            {
                let curchartdataidx = tradeStock.curchartdataidx;
                let curchartdata = tradeStock.chartdatas[curchartdataidx];
                
                if(!curchartdata || GetYMD(curchartdata.date) !== today)
                {
                    curchartdataidx = tradeStock.chartdatas.findIndex(chartdata=>
                        chartdata.date.getFullYear().toString()===today.substr(0,4) &&
                        (chartdata.date.getMonth()+1).toString().padStart(2,0)===today.substr(4,2) &&
                        chartdata.date.getDate().toString().padStart(2,0)===today.substr(6,2));
                    curchartdata = tradeStock.chartdatas[curchartdataidx];
                }

                try
                {
                    price = tradeStock.chartdatas[curchartdataidx].close;
                }
                catch (e)
                {
                    console.error(`CacuTotalCapitalPromise exception ${ticker} ${tradeStock.chartdatas.length} ${today} ${e}`);
                }

                stocktotalmoney += Number(price) * amount;
                resolve();
            }                    
        }   
        else
        {
            resolve();
        }      
    })
}

let beforeyear = '';
let beforemonth = '';
let monthlogs = [];
let monthetclogs = [];
let tradelogs = {};
let rtickerscnt = [];
let rtickersfastcnt = [];

let monthtotalassets = [];
let monthtotalinjurs = [];
let kospilogs = [];
let kosdaqlogs = [];
let monthidx = 0;
let initkospirate = 0;
let initkosdaqrate = 0;
async function printaccountsimulation(today, tradestockdic)
{

    //today.slice(0,4)}-${today.slice(4,6)}-${today.slice(6,8)
    moneytotalmoney = 0;
    injurancetotalmoney = 0;
    stocktotalmoney = 0;
    stockkind = 0;    
    const kospiclose = GetOneStockClose(0,0);
    const kospiclosebef = GetOneStockClose(0,-1);
    const kosdaqclose = GetOneStockClose(1,0);
    const kosdaqclosebef = GetOneStockClose(1,-1);
    if(today == GetYMD(simulationstartdate) && kospiclose > 0)
        initkospirate = GetInitMoney() / kospiclose;   
    if(today == GetYMD(simulationstartdate) && kosdaqclose > 0)
        initkosdaqrate = GetInitMoney() / kosdaqclose;   

    let accountsimulation = Object.entries(g_accountsimulation)
    for(let i = 0; i < accountsimulation.length; ++i)
    {
        let element = accountsimulation[i];
        const r = await CacuTotalCapitalPromise(element, today, tradestockdic); 
    }
    
    const logtraded = JSON.stringify(longshortcount); //Object.entries(longshortcount)
    const totalcapital = stocktotalmoney+moneytotalmoney+injurancetotalmoney;
    const changedper = GetChangePer(beforetotalcapital,totalcapital);
    const logper = GetChangePerLog(changedper);
    const changedperkospi = GetChangePer(kospiclosebef,kospiclose);    
    const logperkospi = GetChangePerLog(changedperkospi);
    const changedperkosdaq = GetChangePer(kosdaqclosebef,kosdaqclose);    
    const logperkosdaq = GetChangePerLog(changedperkosdaq);    
    
 
    const curyear = today.slice(0,4);
    const curmonth = today.slice(4,6);
    let monthperlog = '';
    if(curmonth != beforemonth)
    {
        ++monthidx;
        monthtotalassets.push(totalcapital);
        monthtotalinjurs.push(injurancetotalmoney);
        monthlogs.push(`${beforeyear}/${beforemonth}`);
        monthetclogs.push(tradelogs);
        monthtickerlengs.push(rtickerscnt);
        monthtickerfastlengs.push(rtickersfastcnt);
        kospilogs.push(kospiclose);
        kosdaqlogs.push(kosdaqclose);
        // 최근 한달 수익 ~ 최근6개월
        if(monthidx > 1)
        {
            for(let i = Math.max(1, monthidx-6); i < monthidx; ++i)
            {
                const monthgap = monthidx-i;
                const cahngeval = Math.ceil((monthtotalassets[i] / monthtotalassets[i-1] -1)*10000)/100;
                const changestr = cahngeval>=0?`+${cahngeval}`:cahngeval;
                monthperlog = `${monthgap}m:${changestr}%,` + monthperlog; 
            }
        }

        tradelogs = {};
        rtickerscnt = [];
        rtickersfastcnt = [];
    }
    SetInjurance(g_accountsimulation, beforetotalcapital - totalcapital);
    const printlog = `${today}(${seestockstr}) ${logper}% VS KP:${logperkospi}% KD:${logperkosdaq}% ₩${(totalcapital).toFixed()}=stock(₩${stocktotalmoney.toFixed()})+money(₩${moneytotalmoney.toFixed()})+injurancetotalmoney(₩${injurancetotalmoney.toFixed()})  stockkind:${stockkind} traded:${logtraded} ${monthperlog}`;
    longshortcount = {};
    if(!defulatConfig.usesinglesimulation)
        AddSimulationLog(printlog);
    
    //g_accountsimulation['a0'].totalcapital = totalcapital;
    beforeyear = curyear;
    beforemonth = curmonth;
    assetBuyGate.setYesterdayResult(today, totalcapital, beforetotalcapital, changedper);
    if(beforetotalcapital > 0 && totalcapital < beforetotalcapital)
    {
        if(!assetCrashReboundDownStartCapital)
        {
            assetCrashReboundDownStartCapital = beforetotalcapital;
            assetCrashReboundDownDays = 0;
        }
        ++assetCrashReboundDownDays;
    }
    else
    {
        assetCrashReboundDownStartCapital = 0;
        assetCrashReboundDownDays = 0;
    }
    const assetCrashReboundDownRate = assetCrashReboundDownStartCapital > 0 ? ((totalcapital / assetCrashReboundDownStartCapital) - 1) * 100 : 0;
    globalval.assetCrashReboundYesterdayDownRate = assetCrashReboundDownRate;
    globalval.assetCrashReboundYesterdayDownDays = assetCrashReboundDownDays;
    globalval.assetCrashReboundYesterdayDownStartCapital = assetCrashReboundDownStartCapital;
    globalval.assetCrashReboundYesterdayDownEnough = assetCrashReboundDownRate <= defulatConfig.crashrebounddownthreshold;
    beforetotalcapital = totalcapital;
}

const GetOneStockClose=(number, addday)=>{

    const tradeonstock = g_tradestocklist.find(tradestock=>tradestock.ticker == GetIndexTicker(number))
    if(!tradeonstock || !tradeonstock.chartdatas)   // 못찾으면 에러값 -1 리턴
        return -1;

    let chartdatas = tradeonstock.chartdatas[tradeonstock.curchartdataidx+addday];
    if(!chartdatas)
        chartdatas = tradeonstock.chartdatas[tradeonstock.curchartdataidx];

    if(chartdatas)
        return chartdatas.close;
    return 0;
    // const isOneStock = true;
    
    // for(let i = 0; i < g_tradestocklist.length; ++i)
    // {
    //     // const needcontinue = isOneStock ? (g_tradestocklist[i].ticker == GetIndexTicker(0) || g_tradestocklist[i].ticker == GetIndexTicker(1)) : 
    //     // (g_tradestocklist[i].ticker != GetIndexTicker(0));
        
    //     // if(needcontinue)
    //     //     continue;
    //     if(g_tradestocklist[i].ticker != GetIndexTicker(0))
    //         continue;
    //     return g_tradestocklist[i].chartdatas[g_tradestocklist[i].curchartdataidx].close;
    // }
}

//let simulationstartdate = new Date(`${'2022-04-21'}`);
let simulationstartdate = new Date(defulatConfig.simulationstartdate); //new Date(`${'2022-10-11'}`);
//let simulationenddate = new Date(`${'2024-12-10'}`);
// let simulationstartdate = new Date(`${'2023-01-06'}`);

let simulationlog = '';
let simoldtime = new Date();

const GetPassedTime=(memo)=>{
    const curTime = new Date();
    const elapsedTime = (curTime - simoldtime) / 1000; // 초 단위로 변환
    const minutes = String(Math.floor(elapsedTime / 60)).padStart(2, '0');
    const seconds = String(Math.floor(elapsedTime % 60)).padStart(2, '0');
    simoldtime = curTime;
    // return `${minutes}:${seconds}`
    return (`${memo}: ${minutes}:${seconds} `)
    // console.log(`${memo}: ${minutes}:${seconds}`);
}

// 데이터 받는건 거래할날짜의 최근건 200일전, 예전건 30일전 부터 받는다. ( RSI를 미리 확보하여 첫날부터 바로 거래 할 수 있게 )
const beforedayperiod = 200;//200;
app.get('/dailysimulationoneday', async(req,res) => {
    AddSimulationLog(`stocks dailysimulation oneday ${GetConfig()}`);
    serversimulation(req,res,true);
    res.send('dailysimulationoneday');
})

app.get('/dailysimulation', async(req,res) => {
    //AddSimulationLog(`stocks dailysimulation ${GetConfig()}`);
    // AddSimulationLog(`stocks default:${defulatConfig}`)
    serversimulation(req,res,false);
    res.send('dailysimulation');
})
function isLowerCase(str) {
    return str === str.toLowerCase();
}

function Getcurchartidx(tradestock, curtime){
    let curchartdataidx = tradestock.chartdatas.findIndex(chartdata=>
        chartdata.date.getFullYear()===curtime.getFullYear() &&
        chartdata.date.getMonth()===curtime.getMonth() &&
        chartdata.date.getDate()===curtime.getDate());
    return curchartdataidx;
}

const GetChartYmdSafe=(chartdata)=>{
    if(!chartdata)
        return '';
    if(chartdata.date)
        return GetYMD(chartdata.date);
    if(chartdata.datetime)
        return GetYMD(chartdata.datetime);
    return '';
}

const AdjustAccountPriceField=(accountdata, field, ratio)=>{
    const value = Number(accountdata[field]);
    if(Number.isFinite(value) && value > 0)
        accountdata[field] = value / ratio;
}

const ApplyHeldRightsPriceAdjustment=(tradestock, today)=>{
    if(!defulatConfig.useholdrightspriceadjust)
        return;
    if(!tradestock || !tradestock.chartdatas || tradestock.curchartdataidx == null || tradestock.curchartdataidx < 1)
        return;

    const ticker = tradestock.ticker;
    const accountdata = g_accountsimulation[ticker];
    if(!accountdata || Number(accountdata.amount) <= 0)
        return;

    const chartdatas = tradestock.chartdatas;
    let startIdx = -1;
    if(accountdata.rightsPriceAdjustLastDate)
    {
        const lastCheckedDate = String(accountdata.rightsPriceAdjustLastDate);
        startIdx = chartdatas.findIndex(chartdata=>GetChartYmdSafe(chartdata) === lastCheckedDate);
    }
    else if(accountdata.buytime)
    {
        const buyYmd = GetYMD(accountdata.buytime);
        startIdx = chartdatas.findIndex(chartdata=>GetChartYmdSafe(chartdata) === buyYmd);
    }

    const firstScanIdx = Math.max(1, startIdx + 1);
    const endIdx = tradestock.curchartdataidx;
    const shareRateThreshold = 0.2;

    for(let i = firstScanIdx; i <= endIdx; ++i)
    {
        const before = chartdatas[i - 1];
        const current = chartdatas[i];
        const beforeShares = Number(before && before.shares);
        const currentShares = Number(current && current.shares);
        if(!Number.isFinite(beforeShares) || !Number.isFinite(currentShares) || beforeShares <= 0 || currentShares <= 0)
            continue;

        const ratio = currentShares / beforeShares;
        if(!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < shareRateThreshold)
            continue;

        const oldAverage = Number(accountdata.averagebuyprice || 0);
        const oldFalseAverage = Number(accountdata.falseaveragebuyprice || 0);
        const oldBase = Number(accountdata.partialentrybaseprice || 0);

        AdjustAccountPriceField(accountdata, 'averagebuyprice', ratio);
        AdjustAccountPriceField(accountdata, 'falseaveragebuyprice', ratio);
        AdjustAccountPriceField(accountdata, 'partialentrybaseprice', ratio);
        if(Array.isArray(accountdata.partialentrylots))
        {
            accountdata.partialentrylots.forEach((lot)=>{
                const price = Number(lot.price);
                if(Number.isFinite(price) && price > 0)
                    lot.price = price / ratio;
            })
        }

        accountdata.rightsPriceAdjustCount = Number(accountdata.rightsPriceAdjustCount || 0) + 1;
        AddSimulationLog(`[RIGHTS_PRICE_ADJUST] ${today} ${ticker} ${tradestock.name || tradestock.stockname || accountdata.name || ''} ${GetChartYmdSafe(before)}->${GetChartYmdSafe(current)} shares:${beforeShares}->${currentShares} ratio:${ratio.toFixed(6)} avg:${oldAverage}->${Number(accountdata.averagebuyprice || 0)} falseavg:${oldFalseAverage}->${Number(accountdata.falseaveragebuyprice || 0)} partialbase:${oldBase}->${Number(accountdata.partialentrybaseprice || 0)}`);
    }

    accountdata.rightsPriceAdjustLastDate = GetChartYmdSafe(chartdatas[endIdx]) || today;
}

function SortbyMarketcap(curtime){
    if(!defulatConfig.sortmarketcap)
        return false;
    // g_tradestocklist.sort((a, b) => b.marketCap - a.marketCap);
    g_tradestocklist.sort((a, b) => 
        b.chartdatas[Getcurchartidx(b, curtime)].marketcap - 
        a.chartdatas[Getcurchartidx(a, curtime)].marketcap
    );
}

const PrintMarkedStocks = () => {
    ['KOSPI', 'KOSDAQ'].forEach(market => {
        const marked = [];

        g_tradestocklist.forEach(tradestock => {
            if (!tradestock.name.includes(market)) return;

            const chartdata = tradestock.chartdatas[tradestock.curchartdataidx];

            if (!chartdata || !chartdata.trademark) return;

            marked.push({
                name: tradestock.name,
                ticker: tradestock.ticker,
                rate: chartdata.oneMonthRate,
            });
        });

        marked.sort((a, b) => b.rate - a.rate);

        const text = marked
            .map((stock, idx) => {
                const percent = (stock.rate * 100).toFixed(2);
                return `${idx + 1}.${stock.name} ${percent}%`;
            })
            .join(', ');

        console.log(`[${market}] ${text}`);
    });
};

const MarkStocklist=()=>{
    if(defulatConfig.usetrademark)
    {
        g_tradestocklist.forEach(stock => {
            const chartdata = stock.chartdatas[stock.curchartdataidx];
            if (chartdata) 
            {
                chartdata.trademark = false;
            }
        });

        MarkTop100ByMarketCurrentMinute();
    }

    MarkRsiGoldenCrossStocksSimple();
}

const MarkTop100ByMarketCurrentMinute = () => {
    if(!defulatConfig.usetrademark)
        return;

    ['KOSPI', 'KOSDAQ'].forEach(market => {
        g_tradestocklist
            .filter(stock => stock.name.includes(market))
            .map(stock => {
                const chartdata = stock.chartdatas[stock.curchartdataidx];
                if (!chartdata || !chartdata.oneMonthBaseClose || !chartdata.close) {
                    return null;
                }

                chartdata.oneMonthRate = (chartdata.close / chartdata.oneMonthBaseClose) - 1;

                return { stock, chartdata };
            })
            .filter(Boolean)
            .filter(item => item.chartdata.oneMonthRate >= defulatConfig.trademarkuprate)
            .sort((a, b) => b.chartdata.oneMonthRate - a.chartdata.oneMonthRate)
            .slice(0, defulatConfig.trademarktopstocklistcount)
            .forEach(item => {
                item.chartdata.trademark = true;
            });
    });
};

const MarkRsiGoldenCrossStocksSimple = () => {
    if (!defulatConfig.usetrademarkrsi) return;

    g_tradestocklist.forEach(stock => {
        const idx = stock.curchartdataidx;
        const chartdatas = stock.chartdatas;
        const today = chartdatas[idx];

        // 기본 플래그 초기화
        if (today) today.trademarkrsi = false;

        // 1. 최소한 어제, 오늘 데이터 및 RSI 지표가 온전하게 존재해야 함
        if (idx < 1 || !today || !today.rsi || !chartdatas[idx - 1] || !chartdatas[idx - 1].rsi) return;

        const yesterday = chartdatas[idx - 1];

        // 2. 오늘 첫 RSI / Signal 골든크로스 발생 여부 확인
        const isTodayCross = (yesterday.rsi.RSI <= yesterday.rsi.signal) && (today.rsi.RSI > today.rsi.signal);
        if (!isTodayCross) return;

        // 3. 필터 A: 최근 7거래일 내에 RSI 40 이하로 떨어진 적이 한 번이라도 있는가?
        const startIdxOversold = Math.max(0, idx - 7);
        let wasOversold = false;
        for(let i = startIdxOversold; i <= idx; ++i)
        {
            const rsi = chartdatas[i] && chartdatas[i].rsi;
            if(rsi && rsi.RSI <= 40)
            {
                wasOversold = true;
                break;
            }
        }
        if (!wasOversold) return;

        // const isRsi40Recover = yesterday.rsi.RSI <= 40 && today.rsi.RSI > 40;
        // if (!isRsi40Recover) return;

        // 4. 필터 B: 최근 5거래일 동안(오늘 제외) 골든크로스가 '없었어야' 함 (첫 돌파 검증)
        let hasRecentCross = false;
        const startIdxCross = Math.max(0, idx - 6); // 7일 전~어제 비교용

        for (let i = startIdxCross; i < idx - 1; i++) {
            if (chartdatas[i] && chartdatas[i + 1] && chartdatas[i].rsi && chartdatas[i + 1].rsi) {
                if (chartdatas[i].rsi.RSI <= chartdatas[i].rsi.signal && chartdatas[i + 1].rsi.RSI > chartdatas[i + 1].rsi.signal) {
                    hasRecentCross = true;
                    break;
                }
            }
        }
        if (hasRecentCross) return;

        // 모든 군더더기를 통과한 정석 종목만 구매 대상으로 마킹
        today.trademarkrsi = true;
    });
};

let seestockstr = '';
let printpassedtimelog = ''
const serversimulation=async(req,res,oneday)=>{
    const nation = dbidtonation(req.query.db_id);
    console.log(`[BASELINE_TRACE] serversimulation start ${new Date().toISOString()}`);

    if(defulatConfig.usebreakoutstocklist)
    {
        await getReadySheetData();
        await getValueSheetData();
    }
    // 1. 하루의 권장 종목리스트 받아온다
    async function dailysimulation(today)
    {
        console.log(`[BASELINE_TRACE] dailysimulation start ${today} ${new Date().toISOString()}`);
        PrintMemory(today, g_accountsimulation, g_tradestocklist);

        const FuncCallback=async(sendTickers, _seestockstr)=>{
            printpassedtimelog = '';
            printpassedtimelog += GetPassedTime(`LIST ${today}`);
            seestockstr = _seestockstr;
            // console.log(`sstocksrt :${new Date().getMinutes()}:${new Date().getSeconds()}`)
            let tickers = Object.entries(g_accountsimulation).reduce(function(accum,current){ if (current[0] !== "a0" && current[1].amount > 0) accum.push(`${IsNaq(req.query.db_id)?current[0].toUpperCase():current[0].toLowerCase()}`); return accum},[])
            tickers = tickers.concat(sendTickers.reduce(function(accum,current){ accum.push(`${IsNaq(req.query.db_id)?current.toUpperCase():current.toLowerCase()}`); return accum},[]));
            tickers = Array.from(new Set(tickers.map((item) => item)));            
            
            // 2.권장 종목 리스트의 일,분봉 받아온다
            const todayformat = today;
            const opendayformat = `${today.slice(0,4)}-${today.slice(4,6)}-${today.slice(6,8)}`;
            const tradeSimStartTime = Date.now();
            await tradesimmulation(req.query.db_id, tickers, todayformat, opendayformat,oneday);
            if (todayformat === '20250325') {
                console.log(`[DEBUG_20250325] g_tradestocklist count: ${g_tradestocklist.length}`);
                console.log(`[DEBUG_20250325] tickers: ${g_tradestocklist.map(s => s.ticker).join(',')}`);
            }
            const tradeLoadMs = Date.now() - tradeSimStartTime;
            PushPerfTrace('tradeload', today, {ms:tradeLoadMs, tickers:tickers.length});
            AddSimulationLog(`[TRADELOAD_TRACE] ${today} tradesimmulation:${tradeLoadMs}ms tickers:${tickers.length}`);
            printpassedtimelog += GetPassedTime('[S]');
            let validdate = true;
            if(g_tradestocklist.length > 0)
            {
                const prepareStartTime = Date.now();
                Initaccountsimulation(false, req.query.db_id);
                let minutelongshort = 'NONE';
                let opentimestr = IsNaq(req.query.db_id) ? '09:30' : '09:00';
                let curtime = new Date(`${opendayformat} ${opentimestr}`);
                let timeindex = 0;

                rtickerscnt.push(globalval.rtickers.length);
                rtickersfastcnt.push(globalval.rtickersfast.length);

                    g_tradestocklist.forEach(tradestock=>{
                        PrepareSimulationChartMeta(tradestock.chartdatas);
                    })
                SortbyMarketcap(curtime);
                const tradestockdic = ListToTickerDic(g_tradestocklist);
                // 2.1 일봉기준 sma macd sto 를 미리 구해둔다.
                g_tradestocklist.forEach(tradestock=>{
                    // tradestock.chartdatas.forEach(chartdata=>{
                    //     chartdata.date = chartdata.datetime;
                    // })
                    
                    tradestock.chartdatas.reduce(function(accum,cur){cur.volume = cur.value; accum.push(cur); return accum;},[]);
                    // setmacdbuysell(tradestock.chartdatas);
                    //const sumvolume = Sum(tradestock.minchartdatas.slice(0,tradestock.minchartdatas.length-1).reduce(function(accum,cur){accum.push(cur.value); return accum},[]));

                        let curchartdataidx = Getcurchartidx(tradestock, curtime);

                        if(curchartdataidx !== -1 && tradestock.minchartdatas)
                        {
                            PrepareSimulationSmaBase(tradestock.chartdatas, curchartdataidx);
                            let curchartdata = tradestock.chartdatas[curchartdataidx]; 

                        const daysof1years = 240;
                        tradestock.notices = FilterNotices(tradestock.chartdatas, daysof1years, curchartdataidx);   // ''면 거래o
                        tradestock.validrights = ValidRights(tradestock.chartdatas, defulatConfig.validrightsdays, curchartdataidx); // false면 거래x

                        // let curchartdata = tradestock.chartdatas[tradestock.chartdatas.length-1];    
                        tradestock.orignopen = curchartdata.open                 
                        tradestock.orignhigh = curchartdata.high;
                        tradestock.orignlow = curchartdata.low;
                        if(!defulatConfig.usebeforeliveperiod)
                            tradestock.orignclose = curchartdata.close;
                        if(defulatConfig.usesinglesimulation && tradestock.ticker == globalval.simticker)
                        {
                            if(!globalval.singlesimfirstclose)
                                globalval.singlesimfirstclose = curchartdata.close;
                            globalval.singlesimlastclose = curchartdata.close;
                        }
                        tradestock.orignvolume = curchartdata.volume;
                        // tradestock.latestclose = defulatConfig.usebeforeliveperiod && !defulatConfig.useerrorminuteclosefilter
                        //     ? (tradestock.simMinuteCompact ? GetCompactMinuteClose(tradestock.minchartdatas, 0) : tradestock.minchartdatas[0].close)
                        //     : GetFirstNormalMinuteClose(tradestock);//;
                        if(defulatConfig.usebeforeliveperiod)
                            tradestock.latestclose = tradestock.minchartdatas[0].close 
                        else 
                        {
                            tradestock.latestclose = GetFirstNormalMinuteClose(tradestock);
                        }
                            
                        tradestock._lastNormalMinuteClose = null;
                        tradestock.orignrsi = curchartdata.rsi;  
                        tradestock.orignmacd = curchartdata.macd;
                        tradestock.orignmacdlongshort = curchartdata.macdlongshort;
                        tradestock.curchartdataidx = curchartdataidx;                        
                        tradestock.firstgetprice = 0;
                        tradestock.getpricecount = 0;
                        tradestock.beforegetprice = 0;
                        tradestock.firstbuytriedclose = 0;

                        tradestock.blackratefromfirstgetprice = 0;
                        tradestock.blackratefrombeforegetprice = 0;
                        tradestock.breakoutsafetyshortlv = 0;
                        tradestock.breakoutsafetyshortlv = 0;
                        tradestock.volume = 0;
                        curchartdata.high = 0;
                        curchartdata.low = 1000000000;
                        curchartdata.volume = 0;
                        curchartdata.trademark = false;
                        curchartdata.trademarkrsi = false;
                        
                        //curchartdata.volumerate = 1;//tradestock.orignvolume/sumvolume;

                        curchartdata.macdlongshort = 'NONE';              
                        ApplyHeldRightsPriceAdjustment(tradestock, today);
                    }
                    else
                    {
                        validdate = false;
                    }
                })

                // 3. RealTrade 함수를 통해 종목 리스트들의 트레이딩 시뮬레이션을 실행 한다
                const prepareMs = Date.now() - prepareStartTime;
                PushPerfTrace('prepare', today, {ms:prepareMs, stocks:g_tradestocklist.length});
                AddSimulationLog(`[PREPARE_TRACE] ${today} prepare:${prepareMs}ms stocks:${g_tradestocklist.length}`);

                if(validdate)
                {
                    const endtieme = IsNaq(req.query.db_id) ? 16*60+0 : 15*60+30;
                    const useRealTradeDetailProfile = process.env.realtradeprofile === 'true';
                    globalval.earlyprofitlockbeforetotalcapital = beforetotalcapital;
                    assetBuyGate.setTodayStartCapital(beforetotalcapital);
                    const tradeLoopStartTime = Date.now();
                    let minuteApplyTime = 0;
                    let markStockTime = 0;
                    let realTradeTime = 0;
                    let loopEtcTime = 0;
                    let realTradeProfileCalls = 0;
                    let realTradeProfilePre = 0;
                    let realTradeProfileAccount = 0;
                    let realTradeProfilePartialConfig = 0;
                    let realTradeProfileCapital = 0;
                    let realTradeProfileBuySizing = 0;
                    let realTradeProfileCacu = 0;
                    let realTradeProfileSignal = 0;
                    let realTradeProfilePostSignal = 0;
                    let realTradeProfileSell = 0;
                    let realTradeProfilePartialPlan = 0;
                    let realTradeProfileBuy = 0;
                    let realTradeProfileCacuSkipped = 0;
                    let cacuProfileMacd = 0;
                    let cacuProfileSma = 0;
                    let cacuProfileRsi = 0;
                    let cacuProfileSto = 0;
                    // const tradestockdic = ListToTickerDic(g_tradestocklist);
                    const SetAccountRef=(ticker, resultaccount, addMoney)=>{
                        let tempmacdls = resultaccount.macdlongshort;//'SELLOVERDAY' 'THEDAYFIRSTUP'
                        const splitmacdls = tempmacdls.split(' ');  
                        if(splitmacdls.length>=2 && (tempmacdls.includes('SELLOVERDAY') || tempmacdls.includes('THEDAYFIRSTUP')))
                            tempmacdls = splitmacdls[0];
                        if(!longshortcount[tempmacdls])
                            longshortcount[tempmacdls] = 0;
                        ++(longshortcount[tempmacdls]);

                        if(!tradelogs[tempmacdls])
                            tradelogs[tempmacdls] = [];

                        const chartdatas = tradestockdic[ticker].chartdatas;
                        const curchartdataidx = tradestockdic[ticker].curchartdataidx;
                        const actdate = GetLastDateTime(g_accountsimulation, ticker);
                        const passedday = g_accountsimulation[ticker] && g_accountsimulation[ticker].buytime ? GetPassedDayFromBought(chartdatas, curchartdataidx, actdate) : 0;
                        tradelogs[tempmacdls].push({
                            'blackrate':resultaccount.blackrate.toFixed(2),
                            'passedday':passedday
                        }); 

                        // const islower = isLowerCase(ticker);
                        let newaveragebuyprice = resultaccount.averagebuyprice;
                        let newamount = resultaccount.amount;
                        if(addMoney<0) // 매수
                        {
                            const oldaccount = g_accountsimulation[ticker];
                            if(oldaccount.amount>0) // 이미 보유중이면 평단가 새로 계산
                            {
                                const addamount = resultaccount.amount - oldaccount.amount;// + oldaccount.amount
                                let totalamount = resultaccount.amount;// + oldaccount.amount;
                                let totalprice = addamount * resultaccount.averagebuyprice + oldaccount.amount * oldaccount.averagebuyprice;
                                newamount = totalamount; 
                                newaveragebuyprice = totalprice / totalamount;
                            }
                        }
                        else // 매도
                        {
                            if(newamount==0)   // 전부 매도시 초기화
                                newaveragebuyprice = 0;
                            else    // 일부 매도시 기존 평단가 유지
                                newaveragebuyprice = g_accountsimulation[ticker].averagebuyprice;

                        }
                        

                        // g_accountsimulation[ticker].datetime = new Date(curtime);
                        const oldbuytime = g_accountsimulation[ticker].buytime;
                        const oldRightsPriceAdjustLastDate = g_accountsimulation[ticker].rightsPriceAdjustLastDate;
                        const oldRightsPriceAdjustCount = g_accountsimulation[ticker].rightsPriceAdjustCount;
                        
                        g_accountsimulation[ticker]=resultaccount;
                        if(!defulatConfig.usebeforeliveperiod)
                        {
                            g_accountsimulation[ticker].amount = newamount;
                            g_accountsimulation[ticker].averagebuyprice = newaveragebuyprice;//IsLongStyle(tempmacdls) ? newaveragebuyprice : g_accountsimulation[ticker].averagebuyprice;
                        }
                        if(newamount > 0)
                        {
                            if(oldRightsPriceAdjustLastDate)
                                g_accountsimulation[ticker].rightsPriceAdjustLastDate = oldRightsPriceAdjustLastDate;
                            if(oldRightsPriceAdjustCount)
                                g_accountsimulation[ticker].rightsPriceAdjustCount = oldRightsPriceAdjustCount;
                        }
                        const accountTradeTime = new Date(curtime);
                        g_accountsimulation[ticker].datetime = accountTradeTime;
                        if(addMoney<0 && !g_accountsimulation[ticker].preserveBuyTime)
                            g_accountsimulation[ticker].buytime = accountTradeTime;
                        else
                            g_accountsimulation[ticker].buytime = oldbuytime;
                        if(g_accountsimulation[ticker].preserveBuyTime)
                            delete g_accountsimulation[ticker].preserveBuyTime;
                        g_accountsimulation['a0'].amount += Number(addMoney);
                        minutelongshort = g_accountsimulation[ticker].macdlongshort;
                        CaculateAllStockCapitalValue(g_accountsimulation, tradestockdic);
                    }
                    
                    while((curtime.getHours() * 60 + curtime.getMinutes()) <= endtieme)
                    {   
                        const loopMinuteStartTime = Date.now();
                        ctime = `${curtime.getHours().toString().padStart(2,0)}${curtime.getMinutes().toString().padStart(2,0)}`

                        const minuteApplyStartTime = Date.now();
                        g_tradestocklist.forEach(tradestock=>{
                            //mindata = tradestock.minchartdatas.find(obj=>obj.time===ctime);
                            if(UseOldMemcached())
                            {
                                mindata = tradestock.minchartdatas[timeindex]
                                nextmindata = mindata;
                                // tempnextmindata = tradestock.minchartdatas[timeindex+1];
                                // nextmindata = (tempnextmindata && tempnextmindata.close) ? tempnextmindata : mindata;
                                for (minidx = timeindex+1; minidx < tradestock.minchartdatas.length; ++minidx)
                                {
                                    tempnextmindata = tradestock.minchartdatas[minidx];
                                    if(tempnextmindata.close)
                                    {
                                        nextmindata = tempnextmindata;
                                        break;
                                    }
                                }
                            }
                            else if(tradestock.simMinuteCompact)
                            {
                                mindata = GetCompactMinuteClose(tradestock.minchartdatas, timeindex);
                                tempnextmindata = GetCompactMinuteClose(tradestock.minchartdatas, timeindex+1);
                                nextmindata = tempnextmindata != null ? tempnextmindata : mindata;
                            }
                            else{
                                const curminidx = tradestock.minchartdatas.findIndex(obj=>obj.time===ctime);
                                mindata = tradestock.minchartdatas[curminidx];
                                nextmindata = tradestock.minchartdatas[curminidx+1];
                                // tempnextmindatas = tradestock.minchartdatas.filter((element)=>element.time == ctime)
                                // if(tempnextmindatas && tempnextmindatas.length > 0)
                                //   nextmindata = tempnextmindatas[0];
                            }    
                            tradestock._cur_mindata = mindata;
                            tradestock._cur_nextmindata = nextmindata;

                            // const rawMinuteClose = tradestock.simMinuteCompact ? mindata : (mindata && mindata.close);
                            // const minuteValue = tradestock.simMinuteCompact ? GetCompactMinuteValue(tradestock.minchartvalues, timeindex) : (mindata ? Number(mindata.value || 0) : 0);
                            // const minuteClose = ResolveMinuteClose(tradestock, rawMinuteClose, today, ctime);
                            // tradestock._cur_minuteClose = minuteClose;
                            //if (minuteClose != null) {
                            if (mindata && mindata.close) {
                                // 애초에 length 의 끝을 today에 맞춰서 받아온다
                                let curchartdataidx = tradestock.curchartdataidx;                                
                                let curchartdata = tradestock.chartdatas[curchartdataidx]; 
                                curchartdata.close = mindata.close;
                                curchartdata.high = Math.max( curchartdata.high, mindata.close );
                                curchartdata.low = Math.min( curchartdata.low, mindata.close );
                                curchartdata.volume += mindata.value;//(mindata.value * curchartdata.volumerate);
                                curchartdata.datetime = curtime;
                                curchartdata.date = curtime;
                                
                                tradestock.latestclose = mindata.close;
                                tradestock.volume = curchartdata.volume; 
                                // simoldtime = new Date();
                            }
                                                  
                        })
                        minuteApplyTime += Date.now() - minuteApplyStartTime;
                        const markStockStartTime = Date.now();
                        MarkStocklist();
                        markStockTime += Date.now() - markStockStartTime;
                        // PrintMarkedStocks();

                        globalval.realTradeProfile = useRealTradeDetailProfile ? {calls:0, pre:0, account:0, partialConfig:0, capital:0, buySizing:0, cacu:0, signal:0, postSignal:0, sell:0, partialPlan:0, buy:0, cacuSkipped:0} : null;
                        globalval.cacuOnedayProfile = useRealTradeDetailProfile ? {macd:0, sma:0, rsi:0, sto:0} : null;
                        const realTradeStartTime = Date.now();
                        g_tradestocklist.forEach(tradestock=>{
                            const mindata = tradestock._cur_mindata;
                            const nextmindata = tradestock._cur_nextmindata;
                    
                            const minuteClose = tradestock._cur_minuteClose;
                            if(mindata && mindata.close)
                                {
                                    let curchartdataidx = tradestock.curchartdataidx;
                                    let curchartdata = tradestock.chartdatas[curchartdataidx];
                                    

                                    RealTrade(true, '', false, curchartdataidx, tradestock, g_accountsimulation, tradestockdic, req.query.db_id, minutelongshort, nextmindata, (ticker)=>{},
                                    (ticker, resultaccount, addMoney)=>
                                    {
                                        SetAccountRef(ticker, resultaccount, addMoney);
                                    });
                                    // PrintPassedTime('RealTrade', curtime);
                                }      
                        });
                        realTradeTime += Date.now() - realTradeStartTime;
                        if(useRealTradeDetailProfile && globalval.realTradeProfile)
                        {
                            realTradeProfileCalls += globalval.realTradeProfile.calls;
                            realTradeProfilePre += globalval.realTradeProfile.pre || 0;
                            realTradeProfileAccount += globalval.realTradeProfile.account;
                            realTradeProfilePartialConfig += globalval.realTradeProfile.partialConfig || 0;
                            realTradeProfileCapital += globalval.realTradeProfile.capital || 0;
                            realTradeProfileBuySizing += globalval.realTradeProfile.buySizing || 0;
                            realTradeProfileCacu += globalval.realTradeProfile.cacu;
                            realTradeProfileSignal += globalval.realTradeProfile.signal;
                            realTradeProfilePostSignal += globalval.realTradeProfile.postSignal || 0;
                            realTradeProfileSell += globalval.realTradeProfile.sell || 0;
                            realTradeProfilePartialPlan += globalval.realTradeProfile.partialPlan || 0;
                            realTradeProfileBuy += globalval.realTradeProfile.buy || 0;
                            realTradeProfileCacuSkipped += globalval.realTradeProfile.cacuSkipped;
                        }
                        if(useRealTradeDetailProfile && globalval.cacuOnedayProfile)
                        {
                            cacuProfileMacd += globalval.cacuOnedayProfile.macd;
                            cacuProfileSma += globalval.cacuOnedayProfile.sma;
                            cacuProfileRsi += globalval.cacuOnedayProfile.rsi;
                            cacuProfileSto += globalval.cacuOnedayProfile.sto;
                        }

                        curtime.setMinutes(curtime.getMinutes()+1);
                        ++timeindex;

                        if(defulatConfig.minutetrade)
                        {
                            if(curtime.getHours() * 60 + curtime.getMinutes() < 9*60+30)
                            RealTradeSortedStocks(true, '', false, g_accountsimulation, g_tradestocklist, tradestockdic, req.query.db_id, minutelongshort, nextmindata, (ticker)=>{},
                                (ticker, resultaccount, addMoney)=>
                                {
                                    SetAccountRef(ticker, resultaccount, addMoney);
                                });
                            else
                            SellAllStocks(true, '', false, g_accountsimulation, g_tradestocklist, tradestockdic, req.query.db_id, minutelongshort, nextmindata, (ticker)=>{},
                                (ticker, resultaccount, addMoney)=>
                                {
                                    SetAccountRef(ticker, resultaccount, addMoney);
                                });
                        }
                     
                        // PrintPassedTime(`printaccountsimulation ${ctime}`);
                        loopEtcTime += Date.now() - loopMinuteStartTime;
                    }
                    const tradeLoopTotalTime = Date.now() - tradeLoopStartTime;
                    PushPerfTrace('tradeloop', today, {
                        ms:tradeLoopTotalTime,
                        minute:minuteApplyTime,
                        mark:markStockTime,
                        realtrade:realTradeTime,
                        etc:loopEtcTime - minuteApplyTime - markStockTime - realTradeTime,
                        stocks:g_tradestocklist.length,
                    });
                    AddSimulationLog(`[TRADELOOP_TRACE] ${today} tradeloop:${tradeLoopTotalTime}ms minute:${minuteApplyTime}ms mark:${markStockTime}ms realtrade:${realTradeTime}ms etc:${loopEtcTime - minuteApplyTime - markStockTime - realTradeTime}ms stocks:${g_tradestocklist.length}`);
                    if(useRealTradeDetailProfile)
                    {
                        PushPerfTrace('realtrade_detail', today, {
                            calls:realTradeProfileCalls,
                            pre:realTradeProfilePre,
                            account:realTradeProfileAccount,
                            cacu:realTradeProfileCacu,
                            signal:realTradeProfileSignal,
                            accountBase:realTradeProfileAccount,
                            partialConfig:realTradeProfilePartialConfig,
                            capital:realTradeProfileCapital,
                            buySizing:realTradeProfileBuySizing,
                            postSignal:realTradeProfilePostSignal,
                            sell:realTradeProfileSell,
                            partialPlan:realTradeProfilePartialPlan,
                            buy:realTradeProfileBuy,
                            other:realTradeTime - realTradeProfileAccount - realTradeProfileCacu - realTradeProfileSignal,
                            cacuSkip:realTradeProfileCacuSkipped,
                        });
                        PushPerfTrace('cacu_detail', today, {
                            macd:cacuProfileMacd,
                            sma:cacuProfileSma,
                            rsi:cacuProfileRsi,
                            sto:cacuProfileSto,
                        });
                        AddSimulationLog(`[REALTRADE_DETAIL] ${today} calls:${realTradeProfileCalls} pre:${realTradeProfilePre}ms account:${realTradeProfileAccount}ms partialConfig:${realTradeProfilePartialConfig}ms capital:${realTradeProfileCapital}ms buySizing:${realTradeProfileBuySizing}ms cacu:${realTradeProfileCacu}ms signal:${realTradeProfileSignal}ms postSignal:${realTradeProfilePostSignal}ms sell:${realTradeProfileSell}ms partialPlan:${realTradeProfilePartialPlan}ms buy:${realTradeProfileBuy}ms other:${realTradeTime - realTradeProfilePre - realTradeProfileAccount - realTradeProfilePartialConfig - realTradeProfileCapital - realTradeProfileBuySizing - realTradeProfileCacu - realTradeProfileSignal - realTradeProfilePostSignal - realTradeProfileSell - realTradeProfilePartialPlan - realTradeProfileBuy}ms cacuSkip:${realTradeProfileCacuSkipped}`);
                        AddSimulationLog(`[CACU_DETAIL] ${today} macd:${cacuProfileMacd}ms sma:${cacuProfileSma}ms rsi:${cacuProfileRsi}ms sto:${cacuProfileSto}ms`);
                    }
                     
                    const restoreStartTime = Date.now();
                    g_tradestocklist.forEach(tradestock=>{
                        let curchartdataidx = tradestock.curchartdataidx;
                        let curchartdata = tradestock.chartdatas[curchartdataidx];
                        if(defulatConfig.usebeforeliveperiod)
                        {
                            curchartdata.rsi = tradestock.orignrsi;//tradestock.orignvolume;             
                            curchartdata.macd = tradestock.orignmacd;
                        }
                        else
                        {
                            curchartdata.rsi = clone(tradestock.orignrsi);//tradestock.orignvolume;             
                            curchartdata.macd = clone(tradestock.orignmacd);
                        }
                        // curchartdata.macdlongshort = tradestock.orignmacdlongshort;

                        if(!defulatConfig.usebeforeliveperiod)
                        {
                            curchartdata.dmi = clone(tradestock.origndmi);
                            curchartdata.open = tradestock.orignopen;
                            curchartdata.close = tradestock.orignclose;
                            curchartdata.high = tradestock.orignhigh;
                            curchartdata.low = tradestock.orignlow;
                        }
                        tradestock.notices = ''
                        tradestock.validrights = true;
                    })
                    AddSimulationLog(`[RESTORE_TRACE] ${today} restore:${Date.now() - restoreStartTime}ms stocks:${g_tradestocklist.length}`);
                }
                const accountPrintStartTime = Date.now();
                await printaccountsimulation(today, tradestockdic);
                AddSimulationLog(`[ACCOUNT_TRACE] ${today} account:${Date.now() - accountPrintStartTime}ms`);
            }    
            // console.log(`cstockend :${new Date().getMinutes()}:${new Date().getSeconds()}`)        
            
            printpassedtimelog += GetPassedTime('[C]');
            if(!defulatConfig.usesinglesimulation)
                console.log(printpassedtimelog);
        }

        if(defulatConfig.usetopstocklist)
        {
            console.log(`[BASELINE_TRACE] Topstocklist before ${today} ${new Date().toISOString()}`);
            const topstocklistStartTime = Date.now();
            return new Promise((resolve, reject) => Topstocklist(today, req.query.db_id, async (sendTickers, _seestockstr)=>{
                const topstocklistMs = Date.now() - topstocklistStartTime;
                PushPerfTrace('topstocklist', today, {ms:topstocklistMs, tickers:sendTickers ? sendTickers.length : 0});
                AddSimulationLog(`[TOPSTOCKLIST_TRACE] ${today} topstocklist:${topstocklistMs}ms tickers:${sendTickers ? sendTickers.length : 0}`);
                await FuncCallback(sendTickers, _seestockstr);
                resolve();
            }))
        }else{
            return new Promise((resolve, reject) => TopstocklistBA(today, req.query.db_id, 'test', async (sendTickers, _seestockstr)=>{
                await FuncCallback(sendTickers, _seestockstr);
                resolve();
            }))
        }
    }

    
    // if(!oneday)
    //     simulationstartdate = new Date(`${'2022-04-21'}`);
    let curdate = simulationstartdate;
    // 가지고있던 db로 시작할수있게 하는 로직
    // if(oneday)
    //     Initaccountsimulationfromdb(req.query.db_id);
    // else
        console.log(`[BASELINE_TRACE] Initaccountsimulation before ${new Date().toISOString()}`);
        Initaccountsimulation(true, req.query.db_id);
        console.log(`[BASELINE_TRACE] Initaccountsimulation after ${new Date().toISOString()}`);

    let lastday = defulatConfig.simulationenddate;//new Date();
    let lastdayStr = `${lastday.getFullYear()}${(lastday.getMonth()+1).toString().padStart(2,0)}${lastday.getDate().toString().padStart(2,0)}`;
    let summurylogs = [];
    monthetclogs = [];
    monthtickerlengs = [];
    monthtickerfastlengs = [];
    monthlogs=[];
    monthtotalassets=[];
    monthtotalinjurs=[];
    kospilogs=[];
    kosdaqlogs=[];
    monthidx = 0;
    beforemonth = '';

    const SingleSimOpenDayCheck = async(curdate, dbid) => {
        
        const opendayticker = defulatConfig.usesinglesimulation ? globalval.simticker : GetIndexTicker(0);
        const simstock = g_tradestocklist.find(stock=>stock.ticker == opendayticker);
        const tday = GetYMD(curdate);
        if(!simstock || !simstock.chartdatas)
            return false;
        return simstock.chartdatas.some(chartdata=>GetYMD(chartdata.date) == tday) ?? false;
    }
    const RefOpendayCheck = SingleSimOpenDayCheck;//defulatConfig.usesinglesimulation ? SingleSimOpenDayCheck : Opendaycheck;

    while(true)
    {
        let today = `${curdate.getFullYear()}${(curdate.getMonth()+1).toString().padStart(2,0)}${curdate.getDate().toString().padStart(2,0)}`; 
        const dayStartTime = Date.now();
        await dailysimulation(today);        
        const dayMs = Date.now() - dayStartTime;
        PushPerfTrace('day', today, {ms:dayMs});
        AddSimulationLog(`[DAY_TRACE] ${today} daytotal_before_openday:${dayMs}ms`);
        simdays++;
        const openDayStartTime = Date.now();
        while(true)
        {          
            curdate.setDate(curdate.getDate()+1);
            const isopenday = await RefOpendayCheck(curdate, req.query.db_id);
            if(isopenday || (lastdayStr <= GetYMD(curdate)))
                break;
        }
        AddSimulationLog(`[OPENDAY_TRACE] ${today} openday:${Date.now() - openDayStartTime}ms next:${GetYMD(curdate)}`);
        
        if(lastdayStr <= today)
            break;
    }

    const finalReportStartTime = Date.now();
    const GetChangeVal=(end,start)=>{
        const cahngeval = Math.ceil((end/start -1)*10000)/100;
        return cahngeval;
    }

    const GetChangeStr=(cahngeval)=>{
        const changestr = cahngeval>=0?`+${cahngeval}`:cahngeval;
        return `${changestr}%`;
    }

    let totalper = 0;
    let kospitotalper = 0;
    let kosdaqtotalper = 0;    
    AddSimulationLog(`\n`);
   
for (let i = 1; i < monthtotalassets.length; ++i) {
    // [1] 원본 로직 (절대 보존)
    const cahngeval = GetChangeVal(monthtotalassets[i], monthtotalassets[i-1]);
    const changestr = GetChangeStr(cahngeval);
    const kospichangeval = GetChangeVal(kospilogs[i], kospilogs[i-1]);
    const kosdaqchangeval = GetChangeVal(kosdaqlogs[i], kosdaqlogs[i-1]);
    const alphaP = (cahngeval - kospichangeval).toFixed(2);
    const alphaD = (cahngeval - kosdaqchangeval).toFixed(2);

    let daysum = {}, daylen = {}, kindssum = {}, kindslen = {};
    let totalDayRate = 0, totalKindRate = 0;

    const shortdays = Object.entries(monthetclogs[i]).filter(([item]) => item.includes('SHORT'));
    if (shortdays) {
        for (let n = 0; n < shortdays.length; ++n) {
            const shortday = shortdays[n];
            const kindkey = shortday[0];
            const vals = shortday[1];
            for (let k = 0; k < vals.length; ++k) {
                const key = `${vals[k].passedday}`;
                if (!daysum[key]) { daysum[key] = 0; daylen[key] = 0; }
                const rate = Number(vals[k].blackrate);
                daysum[key] += rate;
                daylen[key] += 1;
                totalDayRate += rate;
            }
            kindslen[kindkey] = vals.length;
            const kSum = vals.reduce((acc, curr) => {
                const val = typeof curr === 'object' ? curr.blackrate : curr;
                return acc + (parseFloat(val) || 0);
            }, 0);
            kindssum[kindkey] = kSum;
            totalKindRate += kSum;
        }
    }

    // [2] 칼정렬을 위한 포맷팅 유틸리티 (좌우 공백 최소화)
    const alignRate = (val) => {
        const icon = val > 0 ? '▲' : '▼';
        const sign = val > 0 ? '+' : '';
        // 숫자는 고정 소수점 1자리로 하여 폭을 일정하게 유지
        return `${icon}${sign}${val.toFixed(1)}%`.padStart(8, ' ');
    };

    // [3] 상세 내역 생성 (왼쪽 공백 제거)
    const dayEntries = Object.entries(daysum).sort(([a], [b]) => Number(a) - Number(b));
    let formattedDays = "";
    for (let j = 0; j < dayEntries.length; j++) {
        const [key, val] = dayEntries[j];
        const dTag = `D+${key-1}`.padEnd(5, ' ');
        const cnt = `(${daylen[key]})`.padEnd(4, ' ');
        formattedDays += `${dTag}${cnt}${alignRate(val)} │ `; // 앞에 공백 제거
        if ((j + 1) % 4 === 0) formattedDays += "\n";
    }

    const formattedKinds = Object.entries(kindssum).sort().map(([key, val]) => {
        const name = key.padEnd(25, ' ');
        const cnt = `(${kindslen[key]}회)`.padStart(7, ' ');
        return `${name}${cnt} : ${alignRate(val)}`; // 앞에 공백 제거
    }).join('\n');

    // [4] 리포트 조립 (모든 라인 왼쪽 정렬 통일)
    const divider = "=".repeat(65);
    const subDivider = "-".repeat(65);
    
    // 시장대비 성과 한 줄 정렬
    const marketLog = `📊 시장대비 성과 : [KOSPI ${GetChangeStr(kospichangeval).padStart(7, ' ')} : ${alignRate(Number(alphaP))}] [KOSDAQ ${GetChangeStr(kosdaqchangeval).padStart(7, ' ')} : ${alignRate(Number(alphaD))}]`;

    const monthReport = `
${divider}
✨ ${monthlogs[i]} 월간 트레이딩 리포트
${divider}
💰 자산 변동 : ${Math.floor(monthtotalassets[i-1]).toLocaleString()} ➔ ${Math.floor(monthtotalassets[i]).toLocaleString()} (${changestr})
${marketLog}
${subDivider}

■ 일자별 상세 요약 (Total: ${alignRate(totalDayRate)})
${formattedDays || '데이터 없음'}

■ 전략별 성과 분석 (Total: ${alignRate(totalKindRate)})
${formattedKinds || '데이터 없음'}

${divider}
`.trim();

    AddSimulationLog(`${monthReport}\n`);


    const kospichangestr = kospichangeval ? `P:${GetChangeStr(kospichangeval)}` : '';
    const kosdaqchangestr = kosdaqchangeval ? `D:${GetChangeStr(kosdaqchangeval)}` : '';
    const idxchangestr = ` VS ${kospichangestr}_${kosdaqchangestr}`; 
    const curcap = monthtotalassets[i]-monthtotalinjurs[i];
    const befcap = monthtotalassets[i-1]-monthtotalinjurs[i-1];
    const capdif = (curcap-befcap);
    const capdifstr = capdif >=0 ? `+${capdif.toFixed(0)}` : `${capdif.toFixed(0)}`;
    const injurssummury = `CAP:${curcap.toFixed(0)}(${capdifstr}) INJ:${monthtotalinjurs[i].toFixed(0)}(+${(monthtotalinjurs[i]-monthtotalinjurs[i-1]).toFixed(0)})`;
    const summurylog = `${monthlogs[i]}:${monthtotalassets[i-1].toFixed(2)}->${monthtotalassets[i].toFixed(2)} ${changestr} ${idxchangestr}`;
    summurylogs += `${summurylog} ${injurssummury}\n`
    totalper += cahngeval;
    kospitotalper += kospichangeval;
    kosdaqtotalper += kosdaqchangeval;
}
    
    AddSimulationLog(summurylogs);

    const indexlog = kospitotalper && kosdaqtotalper ? ` vs ${(kospitotalper / monthtotalassets.length).toFixed(2)}%/${(kosdaqtotalper / monthtotalassets.length).toFixed(2)}%` : '';
    const logfinal = `${(totalper / monthtotalassets.length).toFixed(2)}%${indexlog}`;
    AddSimulationLog(`Injurance : ${GetInjurance(g_accountsimulation)}`);
    AddSimulationLog(`complete dailysimulation 1month ${logfinal}`);
    AddSimulationLog(`[FINAL_TRACE] finalreport:${Date.now() - finalReportStartTime}ms`);
    printraptime();
    globalval.simstate = 'complete';
    const specificDate = new Date()
    const month = String(specificDate.getMonth() + 1).padStart(2, '0');
    const day = String(specificDate.getDate()).padStart(2, '0');
    const hour = String(specificDate.getHours()).padStart(2, '0');
    const minut = String(specificDate.getMinutes()).padStart(2, '0');
    const stocktitle = GetSimulationLogFileTitle(senddatalist);
    const folderpath = `./logsave/${month}_${day}`
    if (!fs.existsSync(folderpath)) {
        fs.mkdirSync(folderpath, { recursive: true }); // recursive: true는 하위 폴더까지 생성
    }
    

    let pathdetail = IsOneStockSimulation() ? '' : `_${hour}${minut}`;
    
    let logicvsnatureper = '';
    if(defulatConfig.usesinglesimulation&&g_accountsimulation[globalval.simticker])
    {
        const account = g_accountsimulation[globalval.simticker];
        const naturalper = (globalval.singlesimlastclose/globalval.singlesimfirstclose).toFixed(2);
        const capital = (GetCashAmount(g_accountsimulation)+account.amount*globalval.singlesimlastclose);    
        const logicper = (capital / defulatConfig.initmoney).toFixed(2);
        const rate1 = (logicper / naturalper).toFixed(2);
        const rate2 = (globalval.simsingleplus/(globalval.simsingleplus+globalval.simsingleminus)).toFixed(2);
        SaveTraderCsv('./singletest.csv', {    
            name: account.name,
            ticker: account.ticker,
            rate: rate1,
            winrate: rate2,
            natrate: naturalper,
        })
        logicvsnatureper = `${rate1}(${rate2})`;
        pathdetail = `${logicper}vs${naturalper}`;
        
    }
    const filepath = `${folderpath}/${logicvsnatureper}_${stocktitle}${pathdetail}_${envport}.txt`;
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath, (err) => {
            if (err) throw err;
            console.log('기존 파일이 삭제되었습니다.');
        });
    }

    const simulationLogText = globalval.simulationlogchunks ? globalval.simulationlogchunks.join('') : globalval.simulationlog;
    fs.appendFile(filepath, simulationLogText, 'utf8', (err) => {
        if(err) throw err;
        console.log(`${filepath} 파일 작성 완료`);
        globalval.simulationlog = '';
        if(globalval.simulationlogchunks)
            globalval.simulationlogchunks.length = 0;
    });

    res.send('dailysimulation');    
}


const printraptime=()=>{
    const simrapendtime = new Date();
    simrapendrap = `${GetYMD(simrapendtime)} ${String(simrapendtime.getHours()).padStart(2, '0')}:${String(simrapendtime.getMinutes()).padStart(2, '0')}:${String(simrapendtime.getSeconds()).padStart(2, '0')}`;

    const simrapelapsed = Math.floor((simrapendtime - simrapstarttime) / 1000);
    const simraphour = Math.floor(simrapelapsed / 3600);
    const simrapminute = Math.floor((simrapelapsed % 3600) / 60);
    const simrapsecond = simrapelapsed % 60;

    let simraptime = '';
    if(simraphour > 0)
        simraptime += `${simraphour}h`;
    if(simrapminute > 0)
        simraptime += `${simraptime ? ' ' : ''}${simrapminute}m`;
    if(simrapsecond > 0 || simraptime === '')
        simraptime += `${simraptime ? ' ' : ''}${simrapsecond}s`;

    AddSimulationLog(`raptime : [${simraptime} ${simdays} days] ${simrapstartrap} ~ ${simrapendrap}`);
}

const SaveTraderCsv = (filepath, row) => {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });

    const header = '이름,ticker,비율,타율,방치\n';
    const line = `${row.name},${row.ticker},${row.rate},${row.winrate},${row.natrate}\n`;

    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, header, 'utf8');
    }

    fs.appendFileSync(filepath, line, 'utf8');
};

app.get('/topstocklist', (req,res) => {
    Topstocklist(req.query.today, req.query.db_id, (sendTickers, seestockstr)=>{
        res.send(sendTickers)
    })
})

app.get('/get_account', async(req,res) => {  
    GetSetAccount(()=>{
        res.send(`${LogTotalAccount()}${LogAccount()}`);
    })
    
})

app.get('/get_my_complete', (req,res)=>{
    Get_my_complete(req.query.db_id, req.query.odno, req.query.sell_buy_dvsn, req.query.ticker, (result)=>{
        res.send(result)
    })    
})



app.get('/test', (req,res)=>{
    // console.log(config.callpypath)
    // res.send(config.callpypath);
    // Get_my_complete(req.query.db_id, req.query.odno, req.query.sell_buy_dvsn, req.query.ticker, (result)=>{
    //     res.send(`get_my_complete ${result}`)
    // })      
    TsetThen(req.query.db_id);
    res.send('')
})

app.get('/buytest', (req,res)=>{
    BuyTest(req.query.ticker, req.query.amount, req.query.db_id);
})

app.get('/seltest', (req,res)=>{
    SelyTest(req.query.ticker, req.query.amount, req.query.db_id);
})

app.get('/sellall', (req,res)=>{
    SelAll(req.query.db_id);
})

// app.get('/eventlist', (req,res) => {   
    
//     db_eventfactor.query(`SHOW tables`, (err, data) => {
//         if(!err) {
//             // telegramapi.TestStart();
//             result = data.map(table => table['Tables_in_eventfactor'])
//             if(config.useConsoleLog)
//                 console.log('eventlist');
//             res.send(result);
//             ++curindex;
//         }
//         else {
//             res.send(err);
//         }
//     })
// })

// app.get('/events', (req,res) => {   
//     db_eventfactor.query(`SELECT * FROM ${req.query.ticker}`, (err, data) => {
//         if(!err) {
//             // telegramapi.TestStart();
//             if(config.useConsoleLog)
//                 console.log('events');
//             res.send(data);
//             ++curindex;
//         }
//         else {
//             res.send(err);
//         }
//     })
// })

app.get('/alltableupdating', (req,res) => {   
    if(req.query.status === 'get')
    {
        query = `SELECT status FROM maintenance WHERE NAME = 'alltableupdating'`
        db_serverinfo((conn) => {
            conn.query(query, (err, data) => {
                conn.release();
                if(!err) {
                    if(config.useConsoleLog)
                        console.log('alltableupdating get');
                    res.send(data[0].status);            
                }
                else {
                    res.send(err);
                }
            })
        });
        
    }
    else
    {
        query = "UPDATE maintenance SET status = 'none' WHERE NAME = 'alltableupdating'"   
        db_serverinfo((conn) => {
            conn.query(query, (err, data) => {
                conn.release();
                if(!err) {
                    if(config.useConsoleLog)
                        console.log('alltableupdating set');
                    res.send();
                }
                else {
                    res.send(err);
                }
            })
        });
                
    }
})


async function hantuopenday(today)
{
    return new Promise((resolve, reject) => {
        axios.get(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/market-time`, {
            headers:{
                "authorization":"Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ0b2tlbiIsImF1ZCI6ImUwMWU1YzIxLTk2ZjQtNGI1Yi1hOTY0LTc3ZGUyNTRhYzhkNyIsInByZHRfY2QiOiIiLCJpc3MiOiJ1bm9ndyIsImV4cCI6MTcyODk0OTUwMywiaWF0IjoxNzI4ODYzMTAzLCJqdGkiOiJQU0xkUHdTS2xGNnA1ZU5HWE9hWnZyY0gyQXJtMXY2N1ZhSHoifQ.KJwnX2hbPTIO7UsW8PX1UCnEJGvv9D5adx4ET2FoaTL96HxwPL2yhkc31QQ3_He9VgWdyyAeDcVCFuoKXZatJQ",
                "appkey":"PSLdPwSKlF6p5eNGXOaZvrcH2Arm1v67VaHz",
                "appsecret":"IgMMULoTyMlhHfV0xkARCkmm8GWhu1AQv9D/vhECn1ikGABw9/C2+NunvP0VKMVSY0GC1B2VlX4prdHiieB6fzBqgJGInJLQk7dVv/JvnXDZNC++opBP0uPpprb8x4W6RS+8qPWrik9A+BhzCt5u7NtP6g17V8p16Fe/fMhucBgRNc64sCw=",                    
                "tr_id":"HHMCM000002C0",
                "custtype":"P",
            }
        }).then(data=> {
            console.log(`hantuopenday status:${data.status} today:${today}`);
            let todayisopenday = false;
            if(data.status === 200 && data.data.rt_cd === '0')
            {
                todayisopenday = (today === data.data.output1.today);
            }
            resolve(todayisopenday);
        }).catch((err) => {
            reject(err);
        });
    })
}
app.get('/heartbeat', (req,res)=>{
    res.send('heartbeat');
})


///////////////////////////// CHEAT ///////////////////////////////////////////////////
app.get('/cheat/setredistickers', (req,res)=>{

    // redisutil.Setredis('KOR_TICKERS', 'D', needupdatestocklists_d);
    // redisutil.Setredis('KOR_TICKERS', 'M', needupdatestocklists_m);
    SetRedisPlural(['a000100', 'a000101'],[]);

    const log = `/cheat/setredistickers`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/logtodb', (req,res)=>{

    // redisutil.Setredis('KOR_TICKERS', 'D', needupdatestocklists_d);
    // redisutil.Setredis('KOR_TICKERS', 'M', needupdatestocklists_m);
        
    SaveTradeLogFolderToDb(defulatConfig.db_id,
        'C:\\Users\\user\\Documents\\GitHub\\react-multiasset-trader\\logsave\\_filter'
    );
    const log = `logtodb`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/pausefetch', (req,res)=>{
    const oldpausefetch = globalval.pausefetch;
    globalval.pausefetch = !globalval.pausefetch;

    const log = `pausefetch: ${oldpausefetch} to ${globalval.pausefetch}`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/everytimefetch', (req,res)=>{
    const oldeverytimefetch = globalval.everytimefetch;
    globalval.everytimefetch = !globalval.everytimefetch;

    const log = `everytimefetch: ${oldeverytimefetch} to ${globalval.everytimefetch}`;
    console.log (log);
    res.send(log);
})


app.get('/cheat/loglv', (req,res)=>{
    loglv = req.query.lv;
    SetLogLV(loglv);
    const log = `/cheat/loglv g_loglv : ${loglv}`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/status', (req,res)=>{
    const log = `/cheat/status<br> ${LogStatus(true)}`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/dbmincache', (req,res)=>{
    res.send(GetDbMinuteCacheStatus());
})

app.get('/cheat/perftrace', (req,res)=>{
    res.send(perfTrace);
})

app.get('/cheat/defines', (req,res)=>{
    const log = `/cheat/defines<br> ${LogDefines()}`;
    console.log (log);
    res.send(log);
})



app.get('/cheat/stocklist', (req,res)=>{
    const log = `/cheat/stocklist<br> ${LogStockList()}`;
    console.log (log);
    res.send(log);
})
app.get('/cheat/account', (req,res)=>{
    const log = `/cheat/account<br> ${LogTotalAccount()}${LogAccount()}`;
    console.log (log);
    res.send(log);
})

app.get('/cheat/filteredaccount', (req,res)=>{
    // 3. 줄바꿈(\n)으로 연결하여 출력
    const log = `${LogTotalAccount()}${FilteredLogAccount()}`;

    console.log(log);
    // telegramapi.SendMessage(log);   
    res.send(log)
})


app.get('/cheat/printfinish', async(req,res)=>{
    // 3. 줄바꿈(\n)으로 연결하여 출력
    await PrintTradingLogAndAccount();

    // telegramapi.SendMessage(log);   
    res.send('printfinish');
})



app.get('/cheat/show_today_tradelog', async (req,res)=>{
    todaydate = new Date();
    const r = await ShowTradeLog(req.query.db_id, todaydate);
    res.send(r);
    telegramapi.SendMessageSellBuy(r, '');
})

app.get('/cheat/tellog', async (req,res)=>{
    let log = '';
    if(req.query.type == 'trade')
    {
        log = `body ${req.query.type}`;
        telegramapi.SendMessageSellBuy('header', log);
    }
    else{
        log = `body ${req.query.type}`;
        telegramapi.SendMessage(log);
    }
    res.send(log);
})

app.get('/remotetest', (req,res)=>{
    console.log ('req remotetest');
    return new Promise ((resolve, reject)=> axios.get(`http://211.255.25.125:4100/cheat/account`).then(data=> {
        console.log ('res remotetest');
        res.send('res remotetest');
        resolve(1);
    }));
})

app.get('/getstock', (req,res)=>{ 
    const log = RawStockList(req.query.stockkinds);
    // console.log (log);
    res.send(log);
})

app.get('/getstocklog', (req,res)=>{
    // const log = JSON.stringify(RawStockList())
    const rawstocklist = JSON.stringify(RawStockList(req.query.stockkinds));
    const tickers = rawstocklist.map(rawstock => rawstock.ticker);
    console.log (tickers);
    res.send(tickers); // JSON.parse
})



///////////////////////////// CHEAT /////////////////////////////////////////////////////

// app.get('/DeleteToken', (req,res) => {   
//     pyutil.DeleteToken();
//     res.send('DeleteToken');
// })
// InitServer();

app.get('/', (req, res) => {
    console.log('Hello World!');
    res.send('Hello World!')
    IsShortStyle('');
    IsLongStyle('');
    // tradeutil.SendMessage(`Maintenance [${req.body.status}] isMaintenanceTime:${req.body.isMaintenanceTime}`);
})


 let envport = defulatConfig.port;
 let db_id = defulatConfig.db_id;
 let envself = defulatConfig.envself;
 
 // defulatConfig.autosimulation = true;
// console.log(`prepare listen ${envport} ${db_id} ${envself}`)
// console.log(process.argv);




const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const LoadSingleCandidateTickers=()=>{
    if(!defulatConfig.singlecandidatefile)
        return null;

    const candidatePath = path.isAbsolute(defulatConfig.singlecandidatefile) ?
        defulatConfig.singlecandidatefile :
        path.resolve(__dirname, '..', defulatConfig.singlecandidatefile);

    try
    {
        const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        const tickers = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.tickers) ? parsed.tickers : []);
        const normalized = Array.from(new Set(tickers.map(ticker=>String(ticker).trim().toLowerCase()).filter(Boolean)));
        AddSimulationLog(`[SINGLE_CANDIDATE_FILE] ${candidatePath} tickers:${normalized.length}`);
        return new Set(normalized);
    }
    catch(err)
    {
        AddSimulationLog(`[SINGLE_CANDIDATE_FILE_ERR] ${candidatePath} ${err.message}`);
        return null;
    }
}
app.listen(envport, async() => {
    console.log(`listen ${envport} ${db_id} ${envself} wait ${defulatConfig.startdelay}s`)
    LoadStockTableList();
    // await LoadAllTickers(db_id);
    await sleep(defulatConfig.startdelay); // 2초 대기
    console.log(`ready to start!`)
    // console.log(`TESTXXXXXX : ${process.env.ismock}`)
    pyutil.ExecuteShell();
    ExecuteTrade(envport, db_id, envself);
    

    //const rport = 4100;//4071
    // if(db === undefined)
    //     db = db_stocklistdayall;
    
    telegramapi.SetPrevMSG(db_id);
    AddSimulationLog(`InitServer! http://localhost:${envport} db_id:${db_id} envself:${envself} simulation:${defulatConfig.autosimulation}`)
    AddSimulationLog(`stocks defulatConfig :${JSON.stringify(defulatConfig)}`);    
    if(defulatConfig.autosimulation)
    {
        const filterdays = defulatConfig.FilterDays; // 1일때와 1보다 큰 경우의 로직을 구분하여 사용. 1은 영업일기준 이고, 나머지는 비영업일 포함이라 변수값보다 갯수가 작을 수 있다.  
        const filterpercent = defulatConfig.FilterPercent; // filterpercent가 작을수록 필터링을 안하기에 모든종목 사용에 가까워짐

        
        AddSimulationLog(`stocks dailysimulation ${GetConfig()} filterdays:${filterdays} filterpercent:${filterpercent}`);
  
        if(!defulatConfig.usesinglesimulation)
        {
            serversimulation({query:{
                db_id:db_id
            }},{send:(text)=>{}}, defulatConfig.simulationoneday); 
        }
        else{
            
            const candidateTickers = LoadSingleCandidateTickers();
            let testtickers = candidateTickers ? Array.from(candidateTickers) : await LoadTickerNames(db_id);
            if(candidateTickers)
            {
                AddSimulationLog(`[SINGLE_CANDIDATE_FILTER] mode:file-only after:${testtickers.length}`);
            }
            for (let i = 0; i < testtickers.length; ++i)
            {
                simulationstartdate = new Date(defulatConfig.simulationstartdate);
                globalval.simticker = testtickers[i];
                globalval.singlesimfirstclose = null;
                globalval.singlesimlastclose = null;
                globalval.simsingleplus = 0;
                globalval.simsingleminus = 0;

                await serversimulation({query:{
                    db_id:db_id
                }},{send:(text)=>{}}, defulatConfig.simulationoneday);   
            }
        }
    }   
})
