const sizeof = require('object-sizeof');
const axios = require('axios');
const db_user = require('./config/db_user')
const db_tradelog = require('./config/db_tradelog')
const db_bastocklist = require('./config/db_bastocklist')
const db_bastocklist_test = require('./config/db_bastocklist_test')
const pyutil = require('./pythonutil')
const config = require("./config")
const db_serverinfo = require('./config/db_serverinfo')
const db_topstocklistlog = require('./config/db_topstocklistlog')
const moment = require('moment');
const {IsNaq, dbidtonation, dbidtoname, MarketChange, GetMarket, GetMarketname, defulatConfig,
    GetStartMessage, GetUpdateMessage, GetCompleteMessage, NameToMarket, IsTest, GetPassedTime, GetIndexTicker,GetOpenDayFormat,
    ip, AddSimulationLog
} = require('./util');
const telegramapi = require(`./telegram`);
const { cat } = require('shelljs');
const consts = require('./consts')
const db_walletsnapshot = require('./config/db_walletsnapshot');
const globalval = require('./globalval');
const {getLastSheetData, getReadySheetData, getValueSheetData} = require('./googlespreadsheet');
const { Highest3, MoveAverage, GetCloses, CalculateEMA, Getslices, GetYMD,
    IsETF, IsPrimary, Hasuplimit, volumefilter2,
    IsRecheadUpLimit, FilterSpecialTickers} = require('./tradeutilcommon');
const { google } = require('googleapis');
const redisutil = require('./redisutil');
const { redis } = require('googleapis/build/src/apis/redis');
const { concat } = require('lodash');
const { GetMemcachedData, GetMemcachedDataMulti } = require('./memcacheutil');

const fetchdb = defulatConfig.fetchdb;
const fetchboy = defulatConfig.fetchboy;
const MINUTE_CACHE_TOKEN = process.env.MINUTE_CACHE_TOKEN || '';
const MakeMinuteCacheHeaders=()=>MINUTE_CACHE_TOKEN ? {'x-minute-cache-token':MINUTE_CACHE_TOKEN} : {};
let stocklistup_starttime;

const IsLive = () =>{
    return consts.IsKorLive(Number(defulatConfig.port)) || consts.IsNaqLive(Number(defulatConfig.port)) || consts.IsTestLive(Number(defulatConfig.port));
}


const TransdbassetToClientAsset=(data,db_id)=>{
    let datas = {};
    let opendayformat = GetOpenDayFormat(db_id);
    let today = opendayformat.replaceAll('-','');

    for (let i = 0; i < data.length; ++i)
    {
        if(data[i].name === 'CASH' || ( data[i].amount > 0 ) || ( GetYMD(data[i].datetime) ==  today))
        {
            let tickerkey = `${IsNaq(db_id) && data[i].name !== 'CASH' ?'':'a'}${data[i].ticker}`
            
            if(IsNaq(db_id) && data[i].name !== 'CASH')
            {
                tickerkey = tickerkey.toLowerCase();
            }               
            datas[tickerkey] = data[i];
            datas[tickerkey].ticker = tickerkey;
            datas[tickerkey].falseamount = 0;
            datas[tickerkey].falseaveragebuyprice = 0;
            datas[tickerkey].falsecashamount = 0;

            if(data[i].name === 'CASH')
            {
                datas[tickerkey].falseamountBuy = 0;
            }
        }
            
    }
    return datas;
}

const Market_sell_order=(apiserver, db_id, ticker, count, macdlongshort, Callback)=>{
    pyutil.market_sell_order(db_id, ticker, count, macdlongshort, (result)=>{
        Callback({result:result});             
    })
}

const Market_buy_order=(apiserver, db_id, ticker, count, macdlongshort, Callback)=>{
    pyutil.market_buy_order(db_id, ticker, count, macdlongshort, (result)=>{
        Callback({result:result});
    })
}

const Market_cancel_order=(db_id, odno, market, ticker, Callback)=>{
    pyutil.market_cancel_order(db_id, odno, market, ticker, (result)=>{
        Callback({result:result});
    })
}

function Getaccount(db_id){
    if(fetchboy === 'fetchboy')
    {
        let tempaccounts = [];
        let executecount = 0;
        return new Promise((resolve, reject)=>
            db_user((conn1) => {
                const splits = db_id.split('_');
                const mok = splits[1];
                const nation = splits[2];
                const query = `SELECT table_name
                    FROM information_schema.TABLES
                    WHERE table_schema = 'user'
                    AND table_name LIKE '%${nation}%'`
                    //AND table_name LIKE '%${mok}%'
                conn1.query(query, (err1, tables) => {
                    conn1.release();
                    if(!err1) {
                        db_user((conn) => {
                            for (idx in tables)
                            {
                                const tablename = tables[idx].table_name
                                conn.query(`SELECT * FROM ${tablename}`, (err, data) => {
                                    if(!err) {
                                        //resolve(TransdbassetToClientAsset(data, db_id)); // Callback
                                        const tempaccount = TransdbassetToClientAsset(data, db_id);
                                        //tempaccounts.concat(tempaccount);
                                        tempaccounts = Object.assign(tempaccounts, tempaccount); 
                                        ++executecount;
                                        if(executecount === tables.length)
                                        {
                                            conn.release();
                                            // tempaccounts = new Set(tempaccounts);
                                            resolve(tempaccounts);
                                        }
                                    }
                                    else {
                                        resolve(err);
                                    }
                                }) 
                            }
                        });
                    }
                    else {
                        resolve(err);
                    }
                }) 
            })
        )
    }
    else
    {
        return new Promise((resolve, reject)=>pyutil.getaccount(db_id, ()=>{
            db_user((conn) => {
                conn.query(`SELECT * FROM ${db_id}`, (err, data) => {
                    conn.release();
                    if(!err) {
                        resolve(TransdbassetToClientAsset(data, db_id)); // Callback
                    }
                    else {
                        resolve(err);
                    }
                }) 
            });       
        }))
    }
    
}


function ShowTradeLog(db_id, todaydate){
        let tempaccounts = [];
        let executecount = 0;
        const todayformat = todaydate.toISOString().split('T')[0].replace(/-/g, '_');
        const tablename = `${db_id}_${todayformat}`;
        return new Promise((resolve, reject)=>
            db_tradelog((conn1) => {
                const splits = db_id.split('_');
                const mok = splits[1];
                const nation = splits[2];
                // const query = `SELECT * FROM '%${nation}%'`
                const query = `SELECT * FROM ${tablename}`
                
                    //AND table_name LIKE '%${mok}%'
                conn1.query(query, (err1, datas) => {
                    conn1.release();
                    if(!err1) {

                        const tickerNameList = datas.map((data) => {
                            // return `${ticker} (${item.name})`;
                            return `${data.longshort} ${data.ticker} (${data.name}) ${data.time} P:${data.price}`
                        });
                    
                        resolve (tickerNameList.join('\n'));
                        // for (idx in datas)
                        // {
                        //     `${datas[idx].ticker} (${datas[idx].name}) ${datas[idx].time} ${datas[idx].price}`
                        // }
                        // resolve(datas);
                    }
                    else {
                        resolve(err1);
                    }
                }) 
            })
        )
 }

function GetIndexdatas(db_id,ticker,startdate,enddate)
{
    return new Promise((resolve, reject)=>
    {
        const sql = `SELECT * FROM ${ticker} WHERE DATE >= ${startdate} AND DATE <= ${enddate}`; // u201
        const marketfncd = GetMarket(db_id,'d');
        marketfncd((connd)=>{
            connd.query(sql, (err, querydata) => {
                connd.release();
                if(!err) {
                    // querydatas = querydata;

                    const closeByDate = {};
                    querydata.forEach((row) => {
                      closeByDate[row.date] = row.close;
                    });

                    resolve(
                        datas=closeByDate 
                    );                    
                }
                else {
                    resolve(err);
                }
            })
        })  
    })
    
}

function ParseSnapshotDateFromTableName(tablename) {
    // 예: srhsha_real_kor_2026_05_07 -> 20260507
    const parts = tablename.split('_');
    if (parts.length < 6) return '';

    return `${parts[3]}${parts[4]}${parts[5]}`;
}

function IsPriceTickerKey(key) {
    if (!key) return false;
    if (key === 'a0') return false;
    if (key.toLowerCase().includes('cash')) return false;

    // SQL table name 방어. 필요하면 규칙 더 좁혀도 됨.
    return /^[a-zA-Z0-9_]+$/.test(key);
}

function GetPrevCloseMap(db_id, tickers, datekey) {
    return new Promise((resolve) => {
        const result = {};

        const safeTickers = [...new Set(tickers)].filter(IsPriceTickerKey);
        if (safeTickers.length === 0 || !datekey) {
            resolve(result);
            return;
        }

        const marketfncd = GetMarket(db_id, 'd');

        marketfncd((connd) => {
            let done = 0;

            safeTickers.forEach((ticker) => {
                const sql = `
                    SELECT date, close
                    FROM ${ticker}
                    WHERE DATE < ${datekey}
                    ORDER BY DATE DESC
                    LIMIT 1
                `;

                connd.query(sql, (err, querydata) => {
                    if (!err && querydata && querydata.length > 0) {
                        result[ticker] = {
                            prevclose: querydata[0].close,
                            prevclosedate: querydata[0].date
                        };
                    }

                    ++done;
                    if (done === safeTickers.length) {
                        connd.release();
                        resolve(result);
                    }
                });
            });
        });
    });
}

async function AttachPrevCloseToSnapshotAccount(db_id, account, tablename) {
    const snapshotDate = ParseSnapshotDateFromTableName(tablename);
    const tickers = Object.keys(account ?? {}).filter(IsPriceTickerKey);

    const prevCloseMap = await GetPrevCloseMap(db_id, tickers, snapshotDate);

    tickers.forEach((ticker) => {
        const prev = prevCloseMap[ticker];
        if (!prev || !account[ticker]) return;

        account[ticker].prevclose = prev.prevclose;
        account[ticker].prevclosedate = prev.prevclosedate;
    });

    return account;
}

function NormalizeDateKey(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\D/g, '').slice(0, 8);
}

function GetsnapshotaccountGeneral(db_id, startdate) {
    let accounts = {};
    let executecount = 0;
    const startDateKey = NormalizeDateKey(startdate);

    return new Promise((resolve) => {
        db_walletsnapshot((conn) => {
            const dateFilter = startDateKey
                ? `
                AND REPLACE(
                    SUBSTRING(
                        table_name,
                        LENGTH('${db_id}') + 2
                    ),
                    '_',
                    ''
                ) >= '${startDateKey}'
                `
                : '';

            const tableQuery = `
                SELECT table_name
                FROM information_schema.TABLES
                WHERE table_schema = 'walletsnapshot'
                AND table_name LIKE '${db_id}\\_%'
                ${dateFilter}
                ORDER BY table_name ASC
            `;

            conn.query(tableQuery, (err, tables) => {
                if (err) {
                    conn.release();
                    resolve(err);
                    return;
                }

                if (!tables || tables.length === 0) {
                    conn.release();
                    resolve(accounts);
                    return;
                }

                for (idx in tables) {
                    const tablename = tables[idx].table_name;

                    conn.query(`SELECT * FROM ${tablename}`, async (err, data) => {
                        if (err) {
                            conn.release();
                            resolve(err);
                            return;
                        }

                        let tempaccount = TransdbassetToClientAsset(data, tablename);

                        if (Object.keys(tempaccount).length > 0) {
                            tempaccount = await AttachPrevCloseToSnapshotAccount(
                                db_id,
                                tempaccount,
                                tablename
                            );

                            accounts[tablename] = tempaccount;
                        }

                        ++executecount;
                        if (executecount === tables.length) {
                            conn.release();
                            resolve(accounts);
                        }
                    });
                }
            });
        });
    });
}


// function GetsnapshotaccountGeneral(db_id)
// {  
//     let accounts = {};
//     let executecount = 0;
//     return new Promise((resolve, reject)=>
//         db_walletsnapshot((conn1) => {
//             const query = `SELECT table_name
//                 FROM information_schema.TABLES
//                 WHERE table_schema = 'walletsnapshot'
//                 AND table_name LIKE '%${db_id}%'
//                 `
//             conn1.query(query, (err1, tables) => {
//                 conn1.release();
//                 if(!err1) {
//                     db_walletsnapshot((conn) => {
//                         for (idx in tables)
//                         {
//                             const tablename = tables[idx].table_name
//                             conn.query(`SELECT * FROM ${tablename}`, (err, data) => {
//                                 if(!err) {
//                                     const tempaccount = TransdbassetToClientAsset(data, tablename);
//                                     if(Object.keys(tempaccount).length > 0)
//                                         accounts[tablename] = tempaccount;
                                    
//                                     ++executecount;
//                                     if(executecount === tables.length)
//                                     {
//                                         conn.release();
//                                         resolve(accounts);
//                                     }
//                                 }
//                                 else {
//                                     resolve(err);
//                                 }
//                             }) 
//                         }
//                     });
//                 }
//                 else {
//                     resolve(err);
//                 }
//             }) 
//         })
//     )
// }

function GetaccountGeneral()
{  
    let accounts = {};
    let executecount = 0;
    return new Promise((resolve, reject)=>
        db_user((conn1) => {
            const query = `SELECT table_name
                FROM information_schema.TABLES
                WHERE table_schema = 'user'
                `
            conn1.query(query, (err1, tables) => {
                conn1.release();
                if(!err1) {
                    db_user((conn) => {
                        for (idx in tables)
                        {
                            const tablename = tables[idx].table_name
                            conn.query(`SELECT * FROM ${tablename}`, (err, data) => {
                                if(!err) {
                                    const tempaccount = TransdbassetToClientAsset(data, tablename);
                                    if(Object.keys(tempaccount).length > 0)
                                        accounts[tablename] = tempaccount;
                                    
                                    ++executecount;
                                    if(executecount === tables.length)
                                    {
                                        conn.release();
                                        resolve(accounts);
                                    }
                                }
                                else {
                                    resolve(err);
                                }
                            }) 
                        }
                    });
                }
                else {
                    resolve(err);
                }
            }) 
        })
    )
}
let teststarttime;

function Fetch_price(db_id, tickers, markets, Callback)
{    
    if(fetchdb === 'redis')
    {
        // const db_id_replace = fetchboy + db_id.slice(db_id.indexOf('_'));
        const db_id_replace = db_id;
        teststarttime = (new Date()).getTime();
        // console.log(`REQ TEST 0`);
        pyutil.fetch_price_list(db_id_replace, tickers, markets, (data,retruntickers)=>{   
            console.log(`${GetPassedTime(teststarttime)} Fetch_price count:${tickers.length} ${tickers[0]}~${tickers[tickers.length-1]} passedtime`);
            Callback(
            {
                rt_cd:data.rt_cd,
                msg1:data.msg1
            });
        });
        return;
    }
    else
    {
        pyutil.fetch_price(db_id, tickers, (data,retruntickers)=>{        
            sql = ``;
            querydatas = [];

            retruntickers.forEach((ticker,index)=>{
                if(index === (retruntickers.length-1))
                    sql += ` SELECT * FROM \`${ticker}\``;
                else
                    sql += ` SELECT * FROM \`${ticker}\` UNION`;
            })

            sql += ` ORDER BY datetime DESC LIMIT ${retruntickers.length}`;
            const marketfncd = GetMarket(db_id,'d');
            marketfncd((connd)=>{
                connd.query(sql, (err, querydata) => {
                    connd.release();
                    if(!err) {
                        querydatas = querydata;
                        // if(lastticker == ticker)
                        {
                            Callback(
                            {
                                datas:querydatas,
                                rt_cd:data.rt_cd,
                                msg1:data.msg1   
                            });
                        }                    
                    }
                    else {
                        Callback(err);
                    }
                })
            })              
        });
    }
}

g_kosstocktablelist = []
g_nasstocktablelist = []
const LoadStockTableList=()=>{
    query = 'SHOW TABLES'
    g_kosstocktablelist = []
    g_nasstocktablelist = []
    db_topstocklistlog((conn) => {
        // db_func((conn) => {
        conn.query(query, (err, datas) =>
        {
            conn.release();
            datas.forEach((data)=>{
                const tablesymbol = defulatConfig.usetemptopstocklistlog ? data[`Tables_in_topstocklistlog_${defulatConfig.usetemptopstocklistlog}`] : data.Tables_in_topstocklistlog;
                date = tablesymbol.split('_')[1];
                if(tablesymbol.includes('kos'))
                    g_kosstocktablelist.push(date);
                else 
                    g_nasstocktablelist.push(date);
            })
        })
    })
}

g_alltickers = []
const LoadAllTickers=async(db_id)=>{
    const formattedDate = new Date().toLocaleDateString('en-CA').replace(/-/g, '');
    g_alltickers = []
    g_temptickers = {'KOSDAQ':[], 'KOSPI':[], 'NASDAQ':[], 'NYSE':[], }
    const marketfncdroot = GetMarket(db_id,'d');
    const marketfncd = GetMarket(db_id,'d');
    const marketname = GetMarketname(db_id, 'd');
    
    return new Promise((resolve, reject) =>
        marketfncdroot((connd0)=>{
            const query = 'SHOW TABLES'
            connd0.query(query, (err, data) => 
            {     
                connd0.release();
                let tablelen = data.length;
                let processedcount = 0;
                for (idx in data)
                {
                    const ticker = data[idx][`Tables_in_${marketname}`];
                    const query = `SELECT * FROM \`${ticker}\` ORDER BY DATE(datetime) desc LIMIT 1`
                    marketfncd((connd)=>{ 
                        connd.query(query, (err, data1) => 
                        {     
                            connd.release();

                            const isvalidupdated = (data1 && data1.length > 0 && data1[0].date === formattedDate);
                            // if (data1[0].marketcap === 0)
                            //     console.log(data1[0].code, data1[0].date, 'marketcap zero')

                            if(isvalidupdated)
                            {
                                g_temptickers[data1[0].market].push(
                                {
                                    'ticker':data1[0].code, 
                                    'marketcap':data1[0].marketcap, 
                                    'market':data1[0].market,
                                });
                            }
                            
                            if (processedcount === tablelen-1)
                            {
                                let kosdaq = SortAllTickers(g_temptickers['KOSDAQ']);
                                let kospi = SortAllTickers(g_temptickers['KOSPI']);
                                let nasdaq = SortAllTickers(g_temptickers['NASDAQ']);
                                let nyse = SortAllTickers(g_temptickers['NYSE']);
                                g_alltickers = [...kosdaq, ...kospi, ...nasdaq, ...nyse];
                                resolve(1);
                            }
                            ++processedcount;
                        })
                    })
                }

            })
        })
    )
}

// const LoadTickerNames = async (db_id) => {
//     const marketfncdroot = GetMarket(db_id, 'd');
//     const marketname = GetMarketname(db_id, 'd');

//     return new Promise((resolve, reject) => {
//         marketfncdroot((connd0) => {
//             const query = 'SHOW TABLES';

//             connd0.query(query, (err, data) => {
//                 connd0.release();

//                 if (err) {
//                     reject(err);
//                     return;
//                 }

//                 const tableKey = `Tables_in_${marketname}`;

//                 const tickers = data
//                     .map(row => row[tableKey])
//                     .filter(Boolean);

//                 resolve(tickers);
//             });
//         });
//     });
// };

const LoadTickerNames = async (db_id) => {
    const marketfncdroot = GetMarket(db_id, 'd');
    const marketfncd = GetMarket(db_id, 'd');
    const marketname = GetMarketname(db_id, 'd');

    const tables = await new Promise((resolve, reject) => {
        marketfncdroot((connd0) => {
            connd0.query('SHOW TABLES', (err, data) => {
                connd0.release();

                if (err) {
                    reject(err);
                    return;
                }

                const tableKey = `Tables_in_${marketname}`;
                resolve(data.map(row => row[tableKey]).filter(Boolean));
            });
        });
    });

    const tickers = [];

    for (const ticker of tables) {
        const row = await new Promise((resolve, reject) => {
            marketfncd((connd) => {
                // const query = `SELECT name FROM \`${ticker}\` ORDER BY DATE(datetime) DESC LIMIT 1`;
                const query = `SELECT name FROM \`${ticker}\` LIMIT 1`;
                connd.query(query, (err, data) => {
                    connd.release();

                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(data?.[0]);
                });
            });
        });

        const name = row?.name;

        if (name && !IsETF(name)) {
            tickers.push(ticker);
        }
    }

    return tickers;
};

const SetRedisPlural = async(d,m)=>{
    const key = 'KOR_TICKERS';
    await redisutil.Initredis(key);

    if(d && d.length>0)
    {
        const dstr = d.join(',');
        console.log(`D : ${dstr}`);
        const redislog = await redisutil.Setredis(key, 'D', dstr);
        console.log(`D-RESULT : ${redislog}`);
    }
    if(m && m.length>0)
    {
        const mstr = m.join(',');
        console.log(`M : ${mstr}`);
        const redislog = await redisutil.Setredis(key, 'M', mstr);
        console.log(`M-RESULT : ${redislog}`);
    }
}

const LoadAllTickerscolabo=async(db_id)=>{
    const formattedDate = new Date().toLocaleDateString('en-CA').replace(/-/g, '');
    g_alltickers = []
    g_temptickers = {'KOSDAQ':[], 'KOSPI':[], 'NASDAQ':[], 'NYSE':[], }
    const marketfncdroot = GetMarket(db_id,'d');
    // const marketfncd = GetMarket(db_id,'d');
    const marketname = GetMarketname(db_id, 'd');
    
    return new Promise((resolve, reject) =>
        marketfncdroot((connd0)=>{
            const query = 'SHOW TABLES'
            connd0.query(query, (err, data) => 
            {     
                connd0.release();
                // let tablelen = data.length;
                // let processedcount = 0;
                let tickers = [];
                for (idx in data)
                {
                    const ticker = data[idx][`Tables_in_${marketname}`];
                    
                    tickers.push(ticker);
                }
                // tickers = tickers.slice(0,10); // DELETE TEST 간소화테스트
                resolve(tickers);
            })
        })
    )
}

const SortAllTickers=(arrs)=>{
    // const marketfncd = GetMarket(db_id,'d');
    // g_alltickers.forEach(tickerinfo=>{
    //     marketfncd((connd)=>{
    //         const query = `SELECT * FROM \`${tickerinfo.tiker}\` ORDER BY DATE(datetime) LIMIT 1`
    //         connd.query(query, (err, data) => 
    //         {     
    //             tickerinfo['market'] = data[0].name;
    //             tickerinfo['marketcap'] = data[0].marketcap;
    //             // for (idx in data)
    //             // {
    //             //     const ticker = data[idx][`Tables_in_${marketname}`];
    //             //     g_alltickers.push({'ticker':ticker, 'marketcap':0, 'market':''})
    //             // }
    //             connd.release();  
    //         })
    //     })
    // })

    return arrs.sort((a, b) => b.marketcap - a.marketcap);
}

// const GetStockTable=(db_id, today)=>{
//     const stocktablelist = IsNaq(db_id) ? g_nasstocktablelist : g_kosstocktablelist;
    
//     let returndate = '';
//     returndate = stocktablelist[0]; 
//     for(key in stocktablelist)
//     {
//         tempdate = stocktablelist[key];
//         if(tempdate >= today)
//             break;
//         returndate = tempdate;
//     }
//     return (IsNaq(db_id) ? `nasstock_${returndate}` : `kosstock_${returndate}`);
// }

// const GetStocktablequery=(db_id, today)=>{
//     // real
//     // for test1 
//     const stocktable = GetStockTable(db_id, today);
//     //const stocktable = IsNaq(db_id) ? 'nasstock_20250206' : 'kosstock_20250206';
    
//     // for test2
//     // const stocktable = IsNaq(db_id) ? 'nasstock_20220510' : 'kosstock_20220510';
    
//     // 150 + 150
//     // return `SELECT ticker FROM ${stocktable} WHERE use1 = 'u'`
    
//     // 상위 일부만 선택
//     return `SELECT ticker FROM ${stocktable} WHERE USE1 != 'up' and USE1 != 'p' and CAST(SUBSTRING_INDEX(rankstr, ' ', -1) AS UNSIGNED) <= ${defulatConfig.topstocklistcount}`

//     // 마켓 구분없이 시총만으로 상위 일부 선택
//     //return `SELECT ticker FROM ${stocktable} WHERE USE1 != 'up' and USE1 != 'p' ORDER BY marketcap DESC LIMIT ${defulatConfig.topstocklistcount}`
    
// }

//////////// new stocktablequery /////////////////////

const GetNewStockTable=(db_id, today, daytype)=>{
    const stocktablelist = IsNaq(db_id) ? g_nasstocktablelist : g_kosstocktablelist;
    
    let returndate = '';
    returndate = stocktablelist[0];
    for(key in stocktablelist)
    {
        tempdate = stocktablelist[key];
        if(tempdate >= today)
        {
            if(daytype=='prev')
            {
                if(key==0)
                    returndate = '';
                else
                    returndate = stocktablelist[key-2];
            }
            break;
        }
        returndate = tempdate;
    }
    return (IsNaq(db_id) ? `nasstock_${returndate}` : `kosstock_${returndate}`);
}

const GetFinalyQuery=(db_id, today, daytype)=>
{
    const stocktable = GetNewStockTable(db_id, today, daytype);

    // 상위 일부만 선택
    let min = 0;//defulatConfig.topstockcutcount ? defulatConfig.topstockcutcount : 0;
    let max = defulatConfig.tradeboy == 'tradeboy' && (defulatConfig.usenewtopstockquery || defulatConfig.filtertickersdivden || defulatConfig.filtertickersetf || defulatConfig.filtertickersetc) ?
     defulatConfig.topstocklistcount * 2 : defulatConfig.topstocklistcount;

    if(!defulatConfig.usetopstocklist)
    {
        min = 0;
        max = 0;
    }    

    if(!defulatConfig.topstocklistmix)
    {
        const marketquery = defulatConfig.marketonly ? ` and CAST(SUBSTRING_INDEX(rankstr, ' ', 1) AS CHAR) = '${defulatConfig.marketonly}'` : '';
        return `SELECT * FROM ${stocktable} WHERE USE1 != 'up' and USE1 != 'p' and CAST(SUBSTRING_INDEX(rankstr, ' ', -1) AS UNSIGNED) >= ${min} and CAST(SUBSTRING_INDEX(rankstr, ' ', -1) AS UNSIGNED) <= ${max}${marketquery}`;    
    }
    // 마켓 구분없이 시총만으로 상위 일부 선택
    return `SELECT * FROM ${stocktable} WHERE USE1 != 'up' and USE1 != 'p' ORDER BY marketcap DESC LIMIT ${max*2}`
}

const GetStocktableList=(db_id, today, daytype)=>{
    
    return new Promise ((resolve, reject)=> db_topstocklistlog((conn) => {
        
        if(defulatConfig.awaitlog)
            console.log(`Topstocklist3 ${today}`);
        const sqlquery = GetFinalyQuery(db_id, today, daytype);

        conn.query(sqlquery, (err2, datas) =>
        {
            conn.release();
            // if(!err2 && datas)
            // {   
            //     ///// 200 naq test
            //     const olddataleng = datas.length;
            //     //datas = datas.reduce(function(accum,cur){accum.push(cur.ticker); return accum},[])
            //     //datas = datas.concat(GetTempnaq200());
            //     //datas = Array.from(new Set(datas.map((item) => item)));
                
            // }
            datas = FilterSpecialTickers(datas);
            resolve(datas);
        })
    }));
}

const GetStocktableFinal=async(db_id, today)=>{
    const returnlist = [];
    const curlist = await GetStocktableList(db_id, today, 'current');
    
    // 검증된 버전 사용하고 싶으면
    // if(defulatConfig.usenewtopstockquery)
    //     return (curlist.slice(0, defulatConfig.topstocklistcount*2)).reduce(function(accum,cur){accum.push(cur.ticker); return accum},[]);
    // else

    // 패치서버거나 종목왜곡필터 사용하지 않는경우 전종목 리턴
    if(defulatConfig.fetchboy.includes('fetch') ||  !defulatConfig.usefilterdissolvestock)
        return curlist.reduce(function(accum,cur){accum.push(cur.ticker); return accum},[]);
    
    // 미검증 테스트 로직
    const prevlist = await GetStocktableList(db_id, today, 'prev');
    const statecounts = {
        'same':0,
        'increase':0,
        'decrease':0,
    }

    const prevByTicker = new Map(prevlist.map(prev => [prev.ticker, prev]));
    curlist.forEach(cur => {
        const prevdata = prevByTicker.get(cur.ticker);
    // curlist.forEach(cur=>{
    //     const prevdata = prevlist.find(prev=>
    //         prev.ticker == cur.ticker
    //     ) 

        // 시총순위상승  cur.rankstr.split(' ')[1]
        // 시총상승      cur.marketcap > prevdata.marketcap
        // 프리브널     : 신규, 
        if(cur && prevdata)
        {
            const curshares = cur.stockcount;
            const prevshares = prevdata.stockcount;

            const currank = cur.rankstr.split(' ')[1];
            const prevrank = prevdata.rankstr.split(' ')[1];
            const rankup = currank < 50 ? currank <= prevrank : currank < prevrank;
            const rankuplv = currank - prevrank;
            const priceup = cur.marketcap > prevdata.marketcap;
            const growuprate = cur.marketcap / prevdata.marketcap;
            cur.growuprate = growuprate;
            cur.rankuplv = rankuplv;
            // if(rankup)
            //     returnlist.push(cur);
            if(curshares == prevshares)
            {
                cur.sharesstate = 'same';
                returnlist.push(cur);
            }else
            if(curshares > prevshares)
            {
                cur.sharesstate = 'increase';
            }else
            if(curshares < prevshares)
            {
                cur.sharesstate = 'decrease';
                returnlist.push(cur);
            }
            ++statecounts[cur.sharesstate];
                
            // console.log(cur.marketcap, prevdata.marketcap);
        }
        // else
        //     console.log();
    })
    // let sortedlist = returnlist.sort((a,b)=> b.growuprate-a.growuprate);
    let sortedlist = returnlist.sort((a,b)=> a.rankuplv-b.rankuplv);
    sortedlist = sortedlist.slice(0, defulatConfig.topstocklistcount*2);
    console.log(statecounts);
    return sortedlist.reduce(function(accum,cur){accum.push(cur.ticker); return accum},[])
}
//////////////////////////////////////////////////////

const stockfilterdays = defulatConfig.FilterDays; // 1일때와 1보다 큰 경우의 로직을 구분하여 사용. 1은 영업일기준 이고, 나머지는 비영업일 포함이라 변수값보다 갯수가 작을 수 있다.  
const filterpercent = defulatConfig.FilterPercent; // filterpercent가 작을수록 필터링을 안하기에 모든종목 사용에 가까워짐
console.log(`filterpercent:${filterpercent} stockfilterdays:${stockfilterdays}`)


// CASE2. 일단위로 시총 갱신
// const Topstocklist=(today, db_id, callback)=>{             
//     // callback(['a000100'])
//     // return;
//     if(!defulatConfig.autosimulation)
//         console.log('Topstocklist-0');
//     let checkedstockcount = 0;
//     //const stocktable = IsNaq(db_id) ? 'nasstock_20250206' : 'kosstock_20250206';
//     // const db_func = db_topstocklistlog;//IsNaq(db_id) ? db_serverinfo : db_topstocklistlog;
    
//     const formattedDate = `${today.substring(0, 4)}-${today.substring(4, 6)}-${today.substring(6, 8)}`;
//     // const datetoday = new Date(formattedDate);

//     const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${stockfilterdays+1}`;        
//     const sqlminute = `SELECT COUNT(*) as cnt FROM ?? WHERE DATE(datetime) <= ? AND DATE(datetime) >= ? AND TIME(datetime)>'09:00' AND TIME(datetime)<'16:00'`;
    
//     const marketfncdroot = GetMarket(db_id,'d');
//     //const marketfncd = GetMarket(db_id,'d');
//     // const marketfncm = GetMarket(db_id, 'm');
//     // TEST 매일 마지막 업데이트된 시총기준으로 줄세우기
//     let datas = []
//     let tickerscount = 0;
//     marketfncdroot((connd)=>{
//         for(idx in g_alltickers)
//         {
//             let tickers = []
//             const curticker = g_alltickers[idx].ticker
//             const querylastdata = `SELECT * FROM \`${curticker}\` order by datetime DESC LIMIT 1`
//             connd.query(querylastdata, (err0, data0) => 
//             {    
//                 //connd0.release();
//                 ++tickerscount;
//                 const statusstr = (data0 && data0.length > 0 && data0[0]) ? data0[0].status : '';
//                 const validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
//                 if(validstatus)
//                     datas.push(data0[0].code);
//                 if(tickerscount === g_alltickers.length)
//                 //if(g_alltickers[g_alltickers.length-1] === data0[0].code)
//                 {
//                     // datas = datas.reduce(function(accum,cur){accum.push(cur); return accum},[])
//                     // datas = datas.concat(GetTempnaq200());
//                     // datas = Array.from(new Set(datas.map((item) => item)));
//                     ///////////////////////////////////////
//                     if(!defulatConfig.autosimulation)
//                         console.log('Topstocklist-1', 'today : ', today, 'leng : ', datas.length);
//                     datas.forEach((data,index)=>{
//                         const ticker = data;
//                         // tickers.push(ticker);                
//                         const GetFilteredMinuteCount=(percent)=>{
//                             const onedayminuteMax = 390;
//                             return onedayminuteMax * (percent / 100);
//                         }
//                         const filterminuteleast = GetFilteredMinuteCount(filterpercent);//0=0%nofilter, 30%, 40% 195=50%, 270=70%, 310=80%  _ 최대 390개
//                         //const sql = `SELECT COUNT(*) as cnt FROM ?? where date < ${today} and date > ${tenDaysAgo}`;
//                         const values = [ticker];
//                         //marketfncd((connd)=>{
//                             connd.query(sqldaily, values, (err1, data1) => 
//                             {    
//                                 // connd0.release();
//                                 const isvalidupdated = (data1 && data1.length > 1 && data1[0].date === today); 
                                
//                                 const statusstr = (data1 && data1[0]) ? data1[0].status : '';
//                                 const validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
                                
//                                 if(!err1 && data1 && isvalidupdated && validstatus)
//                                 {
//                                     // 오늘날짜는 제외하고 어제날짜까지의 분봉만 계산하기 위해 1, -1를 해준다
//                                     const values = [data1[0].code, data1[1].date, data1[data1.length-1].date]; 
//                                     // const values = [data1[0].code, data1[1].date, data1[data1.length-1].date]; 
//                                     const marketfncm = GetMarket(db_id, 'm');
//                                     marketfncm((connm)=>{
//                                         connm.query(sqlminute, values, (err2, data2) => 
//                                         {      
//                                             connm.release(); 
//                                             let validticcker = false;     
//                                             if(!err2 && data2 && data2[0]){
//                                                 ++checkedstockcount;
//                                                 const day30countsAvr = data2[0].cnt / stockfilterdays;
                                                
                                                
//                                                 if(day30countsAvr > filterminuteleast)
//                                                 {
//                                                     if(IsNaq(db_id))
//                                                         tickers.push(ticker);
//                                                     else 
//                                                         tickers.push(ticker)
//                                                 }
//                                             }
//                                             else{
//                                                 ++checkedstockcount;
//                                             }
//                                             if(!defulatConfig.autosimulation)
//                                                 console.log('Topstocklist-2', ticker, 'add:',validticcker, `${checkedstockcount}/${datas.length}`);
                
//                                             if(checkedstockcount === datas.length)
//                                             {
//                                                 connd.release(); 
//                                                 callback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`);
//                                             }                                            
//                                         })
//                                     })
//                                 }
//                                 else{
//                                     ++checkedstockcount;
//                                     if(checkedstockcount === datas.length)
//                                     {
//                                         connd.release(); 
//                                         callback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`);
//                                     }
    
//                                     if(!validstatus)
//                                     {
//                                         console.log(`${data1[0].code} ${data1[0].name} 은 관리/중지/정지 종목으로 매수 제외합니다`);
//                                     }
//                                 }
//                             })
//                         //})
//                     })
//                     // callback(tickers, '');
//                     return;
//                 }
//             })
//         }
//     })
    
//     ////////////////////////////// TEST 매일 마지막 업데이트된 시총기준으로 줄세우기

// }




async function getTopStocksWithPrice(db_id, tradeday, allTickers, exetype='test', logic) {
    const recentDataList = [];

    const marketfncd = GetMarket(db_id,'d');
    function queryPromise(ticker, sql) {
        return new Promise((resolve, reject) => {
            if(exetype=='make' || !g_colabotoplists[ticker])
            {
                marketfncd((connd) => {
                    connd.query(sql, (err, data) => {
                        connd.release(); // 연결 해제는 필수
                        if (err) {
                            return reject(err);
                        }
                        g_colabotoplists[ticker] = data;
                        resolve(data);
                    });
                });
            }
            else
            {
                resolve(g_colabotoplists[ticker]);
            }
            // DB 연결 함수 자체가 오류를 throw할 수 있으므로 try-catch 또는 추가적인 Promise 래핑이 필요할 수 있습니다.
        });
    }

    function checkVolumeCondition_short(result, lastVolume) {
        if (!result || result.length < 2) return false;
    
        // const lastVolume = result[result.length - 1].valuemoney;
        const comparisonTarget = result;//result.slice(0, result.length - 1); // 마지막 요소를 제외한 나머지
    
        // 모든(every) 비교 대상의 volume이 'lastVolume / 4'보다 작거나 같은지 검사
        return comparisonTarget.every(item => item.valuemoney <= lastVolume / 3);
    }
        
    const IsGoldenCrossHighMovAvg120=(high, movavg120, yesterdayhigh, yesterdaymovavg120)=>{
        if(!globalval.excelvalues || !globalval.excelvalues.UPLIMIT)
            return (high>=movavg120 && yesterdayhigh<yesterdaymovavg120);
    
        return true;
    }


    // 1. 모든 티커에 대해 가장 최근 날짜의 종가와 거래량만 병렬로 읽어옴
    let recentDataPromises = allTickers.map(async (ticker, index) => {

        const tableName = `\`${ticker}\``; 
        const process = `${index}/${allTickers.length}`;
        if(logic=='sanpark')
        {
            // SQL: 각 테이블에서 가장 최근 날짜의 close와 volume을 가져오는 쿼리
            const sql = `
            SELECT close, value, valuemoney, open, high, name, date 
            FROM ${tableName}
            WHERE date <= ${g_colabobeforeday}
            ORDER BY date DESC 
            LIMIT 24
            `;
            // value : 거래대금, valuemoney : 거래량
            try {
                const result = await queryPromise(sql);
                if (result && result.length >= 24) {
                    result.sort((a,b)=>a.date-b.date);
                    const movavg = MoveAverage(GetCloses(Getslices(result, 20, 1)));
                    const lastidx = result.length-1;
                    const close = result[lastidx].close;
                    const open = result[lastidx].open;
                    const high = result[lastidx].high;
                    const volumemoney = result[lastidx].value;
                    const volumecount = result[lastidx].valuemoney;
                    const name = result[lastidx].name;
                    const canpush = (volumemoney > 500000000) 
                    && (close>1000 && close<500000)
                    && (close>open)
                    && checkVolumeCondition_short(Getslices(result, 10, 1), volumecount)
                    && (high>Highest3(Getslices(result, 23, 1)))
                    && (close>movavg*1.01 && close<movavg*1.3);

                    if(canpush)
                    {
                        recentDataList.push({
                            ticker: ticker,
                            name: name,
                            close: close,      // 💡 close 추가
                            volumemoney: volumemoney,
                            volumecount: volumecount,
                        });
                    }
                }  
            } catch (error) {
                console.error(`Error fetching recent data for ${ticker}:`, error.message);
            }
        }else if(logic=='breakout')
        {
            // SQL: 각 테이블에서 가장 최근 날짜의 close와 volume을 가져오는 쿼리
            let lastday = new Date();
            let lastdayStr = `${lastday.getFullYear()}${(lastday.getMonth()+1).toString().padStart(2,0)}${lastday.getDate().toString().padStart(2,0)}`;
            let colabobeforeday = g_colabobeforeday ? g_colabobeforeday : tradeday;
            const querytradeday = defulatConfig.autosimulation ? lastdayStr : tradeday;
            const sql = `
            SELECT close, value, valuemoney, open, high, name, date, low 
            FROM ${tableName}
            WHERE date <= ${querytradeday}
            ORDER BY date DESC 
            LIMIT 1000
            `;
            // LIMIT 122
            // value : 거래대금, valuemoney : 거래량
            try {
                let resultfull = await queryPromise(ticker, sql);
                let isvalid = true;
                
                let result = resultfull.filter(element=>element.date <= colabobeforeday);
                let resulttomorrow = resultfull.filter(element=>element.date == tradeday)[0];
                let canpush = false;

                if(exetype=='make')
                {
                    // g_colabobeforeday = (Number(dateStr) - 1).toString();
                    const dblastdate = result[0].date;
                    colabobeforeday = dblastdate;
                    // 내일 쓸 관종 만드는데, 디비의 마지막 요소가 오늘자보다 작으면 제외한다, 
                    // ( 일봉이 점검오류/점검시간안된장종료전호출/날짜지나서주말에호출등으로 비정상적) 
                    if(g_colabobeforeday > dblastdate)
                    {
                        isvalid = false;
                        console.log(`NO PUSH ${resultfull[0].name}(${resultfull[0].ticker}) currentdate:${lastdayStr} dblast:${dblastdate} querytradeday:${querytradeday}`)
                    }
                    // else{
                    //     console.log(`process:${process}`);
                    // }
                }
                
                
                 
                if(exetype=='make')
                {
                    resulttomorrow = Object.assign(Object.create(Object.getPrototypeOf(result[0])), result[0]);
                    resulttomorrow.date = tradeday;
                    // result.unshift(resulttomorrow);
                }

                if (isvalid && result && result.length >= 122 && resulttomorrow) {
                    // if(exetype=='make')
                    // {
                    //     result = result.slice(0,120);
                    // }
                    result.sort((a,b)=>a.date-b.date);

                    const movavg120 = CalculateEMA(GetCloses(Getslices(result, 120, 0)), 120);
                    const movavg60 = CalculateEMA(GetCloses(Getslices(result, 60, 0)), 60);
                    const movavg20 = CalculateEMA(GetCloses(Getslices(result, 20, 0)), 20);
                    const yesterdaymovavg120 = CalculateEMA(GetCloses(Getslices(result, 120, 1)), 120);
                    const yesterdaymovavg60 = CalculateEMA(GetCloses(Getslices(result, 60, 1)), 60);
                    

                    const lastidx = result.length-1;
                    const close = result[lastidx].close;
                    const open = result[lastidx].open;
                    const yesterdayclose = result[lastidx-1].close;
                    const high = result[lastidx].high;
                    const yesterdayhigh = result[lastidx-1].high;
                    const volumemoney = result[lastidx].value;
                    const volumecount = volumemoney / close; //result[lastidx].valuemoney;
                    const name = result[lastidx].name;
                    const tomorrowvolumecount = (resulttomorrow.value / resulttomorrow.close);
                    const tomorhigh = resulttomorrow.high;
                    const tomormovavg20 = CalculateEMA(GetCloses(Getslices(result, 19, 0)).concat(tomorhigh), 20);
                    const tomormovavg60 = CalculateEMA(GetCloses(Getslices(result, 59, 0)).concat(tomorhigh), 60);
                    const istodayclosesma = defulatConfig.usebavolumesma20 ? close < movavg20 : close < movavg60;
                    const istomorclosesma = defulatConfig.usebavolumesma20 ? tomorhigh >= tomormovavg20 : tomorhigh >= tomormovavg60;

                    const istomorrowvolhit = (tomorrowvolumecount > 50000) && 
                    (defulatConfig.uplimitearlyvolume ? 
                        (istodayclosesma && istomorclosesma && volumefilter2(result, lastidx, resulttomorrow.value, 20, defulatConfig.uplimitearlyvolume)) : IsRecheadUpLimit(close,resulttomorrow.high));
                    
                    if(!globalval.excelvalues.UPLIMIT)
                    {
                        canpush = 
                        (volumecount > 50000)// && volumecount < 999999999) 
                        && !IsETF(name)
                        && !(IsPrimary(ticker))
                        && (close>1000 && close<2000000) // ok
                        && (close>=movavg60 && yesterdayclose<yesterdaymovavg60)
                        && (IsGoldenCrossHighMovAvg120(high, movavg120, yesterdayhigh, yesterdaymovavg120))
                        && (movavg120>movavg60 && (movavg60>movavg20))
                        // && (Hasuplimit(GetCloses(Getslices(result, defulatConfig.limitfilter, 0))))
                    }
                    else
                    {

                        const CheckTomorrowFunc=(result, close, yesterdayclose, name)=>{
                            const movavg120 = CalculateEMA((Getslices(result, 120, 0)), 120);
                            const movavg60 = CalculateEMA((Getslices(result, 60, 0)), 60);
                            const yesterdaymovavg60 = CalculateEMA((Getslices(result, 60, 1)), 60);
                            const movavg20 = CalculateEMA((Getslices(result, 20, 0)), 20);
                            let canpush_ = false;

                            const bafreesmacondition = defulatConfig.usebafreesmacondition ? true : (close>=movavg60 && yesterdayclose<yesterdaymovavg60)
                                && (movavg120>movavg60 && movavg60>movavg20)

                            canpush_ = 
                               (close>1000 && close<2000000) // ok
                                && bafreesmacondition;                          
                            return canpush_;
                        }

                      
                        // 종목뽑기. 오늘 이평선 역배열 조건을 달성못했다면 제외한다.내일 오늘보다 올라야 사는건데, 아직 달성못한거면 내일도 자격이 안됨.
                        const bafreesmacondition = defulatConfig.usebafreesmacondition ? false: 
                        ((close>=movavg60) || !(movavg120>movavg60 && movavg60>movavg20));
                        if(IsETF(name)
                        || (IsPrimary(ticker))
                        || bafreesmacondition
                        )
                        {
                            canpush = false;
                        }
                        else{
                            let closes = [
                                // resulttomorrow.close,
                                // resulttomorrow.high
                            ];
                            for(let i = defulatConfig.uplimitper; i <= 30; i+=0.1)
                            {
                                const tempuplimitper = (1+i/100);
                                closes.push(close*tempuplimitper);
                            }

                            let tempcloses = GetCloses(Getslices(result, 120, 0));
                            tempcloses.push(close);
                            for(let i = 0; i <= closes.length; ++i)
                            {
                                const tempclose = closes[i];//close * (1 + i * 0.01);
                                tempcloses[tempcloses.length-1] = (tempclose);

                                if(CheckTomorrowFunc(tempcloses, tempclose, close, name))
                                {
                                    canpush = true;
                                    break;
                                }
                            }
                        }
                    }
                    if(canpush)
                    {
                        recentDataList.push({
                            ticker: ticker,
                            name: name,
                            close: close,      // 💡 close 추가
                            volumemoney: volumemoney,
                            volumecount: volumecount,
                            istomorrowvolhit: istomorrowvolhit,
                        });
                    }
                } 
                if(exetype=='make') 
                    console.log(`process:${process} exetype:${exetype} canpush:${canpush} isvalid:${isvalid} resultlen:${result.length} resulttomorrow:${resulttomorrow!=null}}`);
            } catch (error) {
                console.error(`Error fetching recent data for ${ticker}:`, error.message);
            }
        }
         
    });

    await Promise.all(recentDataPromises);

    
    // g_colabotoplistsinit = true;
    // 2. 최근 거래량(recentVolume) 기준으로 상위 500개만 필터링
    recentDataList.sort((a, b) => b.volumecount - a.volumecount);
    
    // { ticker, recentClose, recentVolume } 형태의 객체 리스트 반환
    // return recentDataList.slice(0, 500); 
    return recentDataList;
}

let g_colaboallstocks = null;
let g_colabotoplists = {};
// let g_colabotoplistsinit = false;


const Topstocklistsanpark=async (today, db_id, callback)=>{
    let timetask = `LoadAllTickerscolabo ${today}`;
    // console.time(timetask);    
    if(!g_colaboallstocks)
        g_colaboallstocks = await LoadAllTickerscolabo(db_id);
    // console.timeEnd(timetask);
    
    timetask = `getTopStocksWithPrice ${today}`;
    console.time(timetask);   
    //console.log("1단계: 상위 500개 종목 데이터 가져오기 및 필터링 시작...");
    const top500 = await getTopStocksWithPrice(db_id, today, g_colaboallstocks, 'test', 'sanpark');
    console.log(`1단계 완료. 후보군 ${top500.length}개.`);
    // console.timeEnd(timetask);
    
    console.log("\n--- ✅ 최종 조건 만족 종목 리스트 ---");
    
    if(top500 && top500.length)         
        console.log(top500.map(item=>`${item.name.split(' ')[0]}(${item.ticker})`).join('\n'))
    
    return r;
}


const Topstocklistbreakout=async (tradeday, db_id, exetype='test', callback)=>{    
    // let timetask = `LoadAllTickerscolabo ${tradeday}`;
    // console.time(timetask);    
    // const r = await LoadAllTickerscolabo(db_id);
    if(exetype=='make' || !g_colaboallstocks)
        g_colaboallstocks = await LoadAllTickerscolabo(db_id);
    // console.timeEnd(timetask);
    
    // const colabobeforeday = tradeday;// g_colabobeforeday ? g_colabobeforeday : tradeday;
    // let timetask = `getTopStocksWithPrice ${tradeday}-${g_colabobeforeday}`;
    // console.time(timetask);   
    //console.log("1단계: 상위 500개 종목 데이터 가져오기 및 필터링 시작...");
    
    
    // 시뮬 첫날은 버린다
    if(!g_colabobeforeday)
    {
        return [];
    }
    const top500 = await getTopStocksWithPrice(db_id, tradeday, g_colaboallstocks, exetype, 'breakout');
    // console.timeEnd(timetask);
    return top500;
}

const PrintTopStockList=(tradeday, top, topfast)=>{
    console.log('\n');
    console.log(`${g_colabobeforeday}일 장종료후 관종 등록 ${tradeday}일에 거래용- ${topfast.length}/${top.length}개.`);
    
    if(defulatConfig.autosimulation)
    {
        if(!g_colabobeforeday)
        {
            g_colabobeforeday = tradeday;
            return [];
        }            

        g_colabobeforeday = tradeday;
    }
    
    if(top && top.length)
    {
        console.log('O', `${topfast.length} / ${top.length}`, topfast.map(item=>` ${item.name.split(' ')[0]}(${item.ticker})`).join(', '), `VOLUME 50000! PRICE ${defulatConfig.uplimitper}%!`);
        // console.log('X', top.filter(item=>!item.istomorrowvolhit).map(item=>` ${item.name.split(' ')[0]}(${item.ticker})`).join(', '));
    }
}

let testidx = 0
let testday = ['20260129'];
let g_colabobeforeday = '';// test할때는 전날 강제로 채워준다
// let testday = ['20221110','20221201'];

const ResolveCallback=(resolvetickers, memo, callback)=>{
    // const idx0 = GetIndexTicker(0);
    // const idx1 = GetIndexTicker(1);

    // if(!resolvetickers.includes(idx0))
    //     resolvetickers.unshift(idx0);
    // if(!resolvetickers.includes(idx1))
    //     resolvetickers.unshift(idx1);

    resolvetickers = AddIndextickers(resolvetickers);
    if(defulatConfig.awaitlog)
        console.log(`Topstocklist5 ${resolvetickers.length}`);
    callback(resolvetickers, memo);
}

const AddIndextickers=(resolvetickers)=>{
    const idx0 = GetIndexTicker(0);
    const idx1 = GetIndexTicker(1);

    if(!resolvetickers.includes(idx0))
        resolvetickers.unshift(idx0);
    if(!resolvetickers.includes(idx1))
        resolvetickers.unshift(idx1);
    return resolvetickers;
}

// 생성이면 해당 날짜의 DB에 넣고, 획득이면 DB에서 가져온다 점검서버는 생성용, 시뮬은 로드용
const TopstocklistBA=async(tradedate, db_id, exetype='test', callback)=>{
    // let temptopstocklist = [];
    // exetype가 test ( 시뮬레이션 ) 인 경우 애초에 YMD 형식으로 넘어온다.
    let tradedayymd = tradedate;
    if(exetype=='make')
    {
        g_colabobeforeday = GetYMD(tradedate);
        tradedate.setDate(tradedate.getDate() + 1)
        tradedayymd = GetYMD(tradedate);
    } 
    ///////////////// COLABO2TEST?///////////
    if(defulatConfig.usesanpark)
    {
        const r = await Topstocklistsanpark(tradedayymd,db_id,()=>{});
        const rtickers = r.map(item=>item.ticker);
        ResolveCallback(rtickers,`usesanpark ${r.length}`,callback);
    }
    else if(defulatConfig.usebreakoutstocklist)
    {
        // today = testday[testidx]// TEST //// DELETE
        // if(testidx < testday.length-1)
        //     ++testidx;
        // dbdbdb 있으면 디비리턴, 없으면 원래대로 로직 진행후 디비 생성
        let r;
        let hasdb = false;
        let usebadb = defulatConfig.autosimulation && defulatConfig.usebadb;
        const todayymd = GetYMD(new Date());
        const islastsimulday = (defulatConfig.autosimulation && tradedayymd >= todayymd)
        const nousedbsim = (defulatConfig.autosimulation && !defulatConfig.usebadb)
        // 시뮬일때 디비에서 읽어온다.
        if(usebadb)
        {
            r = await LoadBADB(exetype, tradedayymd);
            hasdb = r.length > 0;
        }

        // 시뮬일때 디비가 없거나, 점검서버일경우 브아 관종 생성한다
        if(!hasdb)
        {
            r = await Topstocklistbreakout(tradedayymd, db_id,exetype,()=>{});
        }

        const rtickers = r;
        const rtickersfast = r.filter(item=>item.istomorrowvolhit);

        globalval.rtickers = rtickers;
        globalval.rtickersfast = rtickersfast;

        PrintTopStockList(tradedayymd, rtickers, rtickersfast);
        
        // 시뮬일경우 요청날짜와 오늘날짜가 같으면 ( 내일 고가 정보가 없어서 fast 생성 불가 ) 디비생성 안한다. 
        if(!nousedbsim && ((!hasdb) && (globalval.rtickers.length > 0)) && !islastsimulday)
        {   
            const makedbday = exetype == 'make' ? g_colabobeforeday : tradedayymd;
            await MakeDB(exetype, makedbday, rtickers);
        }
        // temptopstocklist = defulatConfig.usetomorrowvol ? rtickersfast.map(item=>item.ticker) : rtickers.map(item=>item.ticker)
        ResolveCallback((defulatConfig.usetomorrowvol && !islastsimulday) ? rtickersfast.map(item=>item.ticker) : rtickers.map(item=>item.ticker),
            `usebreakoutstocklist ${rtickersfast.length}/${r.length}`,callback);
    }
    //////////////////////////////////////////
}

const MakeDB = (exetype, makedbday, stockinfos) => {
    const todayymd = makedbday;//tradeday ? tradeday : GetYMD(new Date());
    const db_func = exetype == 'make' ? db_bastocklist : db_bastocklist_test;
    return new Promise((resolve, reject) => {
        const todayStr = todayymd;//GetLocalDateStr('', 'YYYYMMDD'); // GetLocalDateStr 함수 사용
        const tableName = `bastock_${todayStr}`;

        db_func((conn) => {
            // 1. 기존 테이블 삭제 (존재한다면)
            const dropTableSql = `DROP TABLE IF EXISTS \`${tableName}\``;

            conn.query(dropTableSql, (err) => {
                if (err) {
                    conn.release();
                    console.error('Error dropping table:', err);
                    return reject(err);
                }
                console.log(`Old table ${tableName} dropped (if existed).`);

                // 2. 테이블 생성
                const createTableSql = `
                    CREATE TABLE \`${tableName}\` (
                        ticker VARCHAR(255) NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        istomorrowvolhit INT NOT NULL DEFAULT 0,
                        PRIMARY KEY (ticker)
                    )
                `;

                conn.query(createTableSql, (err, result) => {
                    if (err) {
                        conn.release();
                        console.error('Error creating table:', err);
                        return reject(err);
                    }
                    console.log(`Table ${tableName} created fresh.`);

                    // 3. 데이터 삽입
                    if (stockinfos && stockinfos.length > 0) {
                        const insertSql = `INSERT INTO \`${tableName}\` (ticker, name, istomorrowvolhit) VALUES ?`;
                        const values = stockinfos.map(info => [info.ticker, info.name, info.istomorrowvolhit]);

                        conn.query(insertSql, [values], (err, result) => {
                            conn.release();
                            if (err) {
                                console.error('Error inserting data:', err);
                                return reject(err);
                            }
                            console.log(`${result.affectedRows} rows inserted into ${tableName}.`);
                            resolve(result);
                        });
                    } else {
                        conn.release();
                        console.log('No stockinfos to insert.');
                        resolve('No data inserted');
                    }
                });
            });
        });
    });
}

const LoadBADB = async (exetype, strdate = "") => {
    const db_func = exetype == 'make' ? db_bastocklist : db_bastocklist_test;
    return new Promise((resolve, reject) => {
        db_func((conn) => {
            // 1. 타겟 테이블 이름 결정
            // strdate가 있으면 해당 날짜 테이블을, 없으면 가장 최근 테이블을 찾는 쿼리
            let findTableSql = "";
            let queryParams = [];

            if (strdate !== "") {
                // 특정 날짜 테이블 존재 여부 확인
                findTableSql = `
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = DATABASE() 
                      AND table_name = ?
                    LIMIT 1
                `;
                queryParams = [`bastock_${strdate}`];
            } else {
                // 기존 로직: 최신 테이블 찾기
                findTableSql = `
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = DATABASE() 
                      AND table_name LIKE 'bastock_%'
                    ORDER BY table_name DESC 
                    LIMIT 1
                `;
            }

            conn.query(findTableSql, queryParams, (err, results) => {
                if (err) {
                    conn.release();
                    console.error('테이블 조회 오류:', err);
                    return reject(err);
                }

                // 테이블이 없는 경우
                if (results.length === 0) {
                    conn.release();
                    if (strdate !== "") {
                        console.log(`요청하신 테이블 bastock_${strdate}이 존재하지 않습니다.`);
                        return resolve([]); // 특정 날짜 요청 시 없으면 null 리턴
                    } else {
                        console.log('데이터베이스에 bastock_ 관련 테이블이 없습니다.');
                        return resolve([]); // 전체 조회 시 없으면 빈 배열
                    }
                }

                const tableName = results[0].table_name;
                console.log(`테이블 로드 시작: ${tableName}`);

                // 2. 데이터 조회
                const selectSql = `SELECT ticker, name, istomorrowvolhit FROM \`${tableName}\``;

                conn.query(selectSql, (err, rows) => {
                    conn.release();

                    if (err) {
                        console.error('데이터 조회 오류:', err);
                        return reject(err);
                    }

                    console.log(`${rows.length} rows loaded from ${tableName}.`);
                    
                    // 티커 리스트 추출 및 글로벌 변수 업데이트
                    const tickerList = rows.map(item => item.ticker);
                    globalval.breakouttickerlist = tickerList;
                    globalval.rtickers = tickerList;
                    globalval.rtickersfast = rows.filter(item=>item.istomorrowvolhit).map(item => item.ticker);
                    const returntickerList = rows.map(item => {return{
                            "ticker":item.ticker,
                            "name":item.name,
                            "istomorrowvolhit":item.istomorrowvolhit,
                        }});
                    resolve(returntickerList);
                });
            });
        });
    });
}

const CheckErrorValueStock=(connd)=>{
    const stocktablelist = IsNaq(db_id) ? g_nasstocktablelist : g_kosstocktablelist;
}

const Topstocklist=async (today, db_id, callback)=>{             
    if(!IsLive())
    {
        Topstocklist_sim (today, db_id, callback);
    }
    else
        Topstocklist_live (today, db_id, callback);
}

const Topstocklist_sim=async (today, db_id, callback)=>{             
    const toplistStartTime = Date.now();
    
    if(defulatConfig.autosimulation && (defulatConfig.usesinglesimulation || (defulatConfig.simulonlyonestock && defulatConfig.simulonlyonestock != '')))
    {
        const tickers = defulatConfig.usesinglesimulation ? [globalval.simticker] : defulatConfig.simulonlyonestock.split(',').map(s => s.trim());
        ResolveCallback(tickers,'',callback)
        return;
    }
    
    let tickers = [];

    if(!defulatConfig.usetopstocklist)
    {
        ResolveCallback(tickers, 'usetopstocklist false',callback);
        return;
    }

    let checkedstockcount = 0;
    const formattedDate = `${today.substring(0, 4)}-${today.substring(4, 6)}-${today.substring(6, 8)}`;
    const topstockSelfReturnDays = Array.isArray(defulatConfig.topstockselfreturnfilterdays) ? defulatConfig.topstockselfreturnfilterdays.filter(day=>Number.isFinite(day) && day > 0) : [];
    const topstockSelfReturnMode = defulatConfig.topstockselfreturnfiltermode === 'negative' ? 'negative' : 'positive';
    const topstockSelfReturnLookbackDays = topstockSelfReturnDays.length ? Math.max(...topstockSelfReturnDays) + 2 : 0;
    const dailyLookbackDays = Math.max(stockfilterdays + 1, topstockSelfReturnLookbackDays, (defulatConfig.usecandidatevalidrightsfilter && defulatConfig.validrightsdays) ? defulatConfig.validrightsdays + 1 : 0);
    // const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${defulatConfig.validrightsdays ? defulatConfig.validrightsdays :  stockfilterdays+1}`;
    const sqldaily = `SELECT code, name, date, datetime, status, close, shares FROM ?? where date <= '${today}' ORDER BY date DESC LIMIT ${dailyLookbackDays}`;        

    const GetFilteredMinuteCount=(percent)=>{
        const onedayminuteMax = 390;
        return onedayminuteMax * (percent / 100);
    }
    const filterminuteleast = GetFilteredMinuteCount(filterpercent);//0=0%nofilter, 30%, 40% 195=50%, 270=70%, 310=80%  _ 최대 390개
    
    const SendCallBack=(valid, ticker, vaildvolumes, dataslength, etcinfo)=>{
        let validticcker = false;     
        if(valid){
            const day30countsAvr = vaildvolumes / stockfilterdays;
            validticcker = day30countsAvr > filterminuteleast;
            if(validticcker)
            {
                // tickers.push(ticker);

                // 동기화 테스트 : 끝나고 부활
                let excludetickers = defulatConfig.autosimulation ? defulatConfig.excludesimulonlyonestock.split(',') : [];
                if(!excludetickers.includes(ticker))
                    tickers.push(ticker);
                else
                    console.log(`${ticker} is exclude ticker`);
            }
        }
        else{
            // console.log(`${ticker} is unvalid`); 
        }

        globalval.savedtopstockliststatus = `SendCallBack ${valid} ${checkedstockcount} ${dataslength}`;
        if(checkedstockcount === dataslength)
        {
            ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
        }  
    }

    const EscapeSqlIdentifier=(value)=>{
        return `\`${String(value).replace(/`/g, '``')}\``;
    }

    const EscapeSqlString=(value)=>{
        return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    const GetDailyTableSet=()=>{
        if(globalval.simtableSet)
            return Promise.resolve(globalval.simtableSet);

        return new Promise((resolve)=>{
            const marketfncd = GetMarket(db_id,'d');
            marketfncd((connd)=>{
                connd.query('SHOW TABLES', (err, rows)=>{
                    connd.release();

                    if(err || !rows)
                    {
                        resolve(null);
                        return;
                    }

                    const tableSet = new Set();
                    rows.forEach((row)=>{
                        const tableName = Object.values(row)[0];
                        if(tableName)
                            tableSet.add(String(tableName).toLowerCase());
                    })

                    globalval.simtableSet = tableSet;
                    resolve(tableSet);
                })
            })
        })
    }

    const MakeChunks=(list, size)=>{
        const chunks = [];
        for(let i = 0; i < list.length; i += size)
            chunks.push(list.slice(i, i + size));
        return chunks;
    }
    
    const RunLimited=async(items, limit, worker)=>{
        const results = new Array(items.length);
        let nextIndex = 0;
    
        const runners = Array.from({length: Math.min(limit, items.length)}, async()=>{
            while(nextIndex < items.length)
            {
                const curIndex = nextIndex++;
                results[curIndex] = await worker(items[curIndex], curIndex);
            }
        })
    
        await Promise.all(runners);
        return results;
    }

    const QueryDailySingle=(ticker)=>{
        return new Promise((resolve)=>{
            // tickers.push(ticker);                
            //const sql = `SELECT COUNT(*) as cnt FROM ?? where date < ${today} and date > ${tenDaysAgo}`;
            const values = [ticker];
            const marketfncd = GetMarket(db_id,'d');
            marketfncd((connd)=>{
                globalval.savedtopstockliststatus = `Topstocklist4-1`;
                connd.query(sqldaily, values, (err1, data1) => 
                {   
                    connd.release();
                    resolve({ticker, err1, data1});
                })
            })
        })
    }

    const BuildDailyUnionQuery=(targets)=>{
        const dateValue = EscapeSqlString(today);
        const limit = dailyLookbackDays;

        return targets.map((ticker)=>{
            const tableName = EscapeSqlIdentifier(ticker);
            const tickerValue = EscapeSqlString(ticker);

            return `(
                SELECT '${tickerValue}' AS _topstock_ticker, code, name, date, datetime, status, close, shares
                FROM ${tableName}
                WHERE date <= '${dateValue}'
                ORDER BY date DESC
                LIMIT ${limit}
            )`;
        }).join(' UNION ALL ');
    }

    const QueryDailyUnionChunk=(targets)=>{
        return new Promise((resolve)=>{
            if(targets.length <= 0)
            {
                resolve(null);
                return;
            }

            const sqlquery = BuildDailyUnionQuery(targets);
            const marketfncd = GetMarket(db_id,'d');

            marketfncd((connd)=>{
                globalval.savedtopstockliststatus = `Topstocklist4-1`;
                connd.query(sqlquery, (err1, rows) => 
                {   
                    connd.release();

                    if(err1 || !rows)
                    {
                        resolve(null);
                        return;
                    }

                    const dailyByTicker = new Map();
                    rows.forEach((row)=>{
                        const ticker = row._topstock_ticker;
                        if(!dailyByTicker.has(ticker))
                            dailyByTicker.set(ticker, []);

                        delete row._topstock_ticker;
                        dailyByTicker.get(ticker).push(row);
                    })

                    dailyByTicker.forEach((data1)=>{
                        data1.sort((a,b)=>{
                            if(a.date === b.date)
                                return 0;
                            return a.date > b.date ? -1 : 1;
                        })
                    })

                    resolve(dailyByTicker);
                })
            })
        })
    }

    const LoadDailyRowsCached=(ticker, tableSet)=>{
        if(!globalval.simDailyRowsByTicker)
            globalval.simDailyRowsByTicker = new Map();

        const cacheKey = String(ticker).toLowerCase();
        if(globalval.simDailyRowsByTicker.has(cacheKey))
            return Promise.resolve(globalval.simDailyRowsByTicker.get(cacheKey));

        return new Promise((resolve)=>{
            if(tableSet && !tableSet.has(cacheKey))
            {
                globalval.simDailyRowsByTicker.set(cacheKey, null);
                resolve(null);
                return;
            }

            const marketfncd = GetMarket(db_id,'d');
            const tableName = EscapeSqlIdentifier(ticker);
            const sqlquery = `SELECT code, name, date, datetime, status, close, shares FROM ${tableName} ${GetSimulationDailyRowsWhereSql()} ORDER BY date DESC`;

            marketfncd((connd)=>{
                connd.query(sqlquery, (err, rows) =>
                {
                    connd.release();

                    if(err || !rows)
                    {
                        globalval.simDailyRowsByTicker.set(cacheKey, null);
                        resolve(null);
                        return;
                    }

                    rows.forEach((row)=>{
                        row.date = String(row.date);
                    })

                    globalval.simDailyRowsByTicker.set(cacheKey, rows);
                    resolve(rows);
                })
            })
        })
    }

    const GetSimulationDailyRowsWhereSql=()=>{
        if(!defulatConfig.autosimulation || !defulatConfig.simulationstartdate || !defulatConfig.simulationenddate)
            return '';

        const start = new Date(defulatConfig.simulationstartdate);
        const end = new Date(defulatConfig.simulationenddate);
        if(isNaN(start.getTime()) || isNaN(end.getTime()))
            return '';

        start.setDate(start.getDate() - 365);
        const startYmd = `${start.getFullYear()}${(start.getMonth()+1).toString().padStart(2,0)}${start.getDate().toString().padStart(2,0)}`;
        const endYmd = `${end.getFullYear()}${(end.getMonth()+1).toString().padStart(2,0)}${end.getDate().toString().padStart(2,0)}`;
        return `WHERE date >= '${startYmd}' AND date <= '${endYmd}'`;
    }

    const LoadDailyRowsCachedMulti=async(tickers, tableSet)=>{
        const loadStart = Date.now();
        if(!globalval.simDailyRowsByTicker)
            globalval.simDailyRowsByTicker = new Map();

        const uncachedTargets = [];
        let skippedMissingTable = 0;
        tickers.forEach((ticker)=>{
            const cacheKey = String(ticker).toLowerCase();
            if(globalval.simDailyRowsByTicker.has(cacheKey))
                return;

            if(tableSet && !tableSet.has(cacheKey))
            {
                globalval.simDailyRowsByTicker.set(cacheKey, null);
                ++skippedMissingTable;
                return;
            }

            uncachedTargets.push(ticker);
        })

        let queryMs = 0;
        let buildMs = 0;
        let rowsLoaded = 0;
        let fallbackGroups = 0;
        if(uncachedTargets.length > 0)
        {
            const dailyRowsChunkSize = 24;
            const dailyRowsChunks = MakeChunks(uncachedTargets, dailyRowsChunkSize);

            await RunLimited(dailyRowsChunks, 2, async(group)=>{
                const whereSql = GetSimulationDailyRowsWhereSql();
                const sqlquery = group.map((ticker)=>{
                    const tickerValue = EscapeSqlString(ticker);
                    const tableName = EscapeSqlIdentifier(ticker);
                    return `SELECT '${tickerValue}' AS _topstock_ticker, code, name, date, datetime, status, close, shares FROM ${tableName} ${whereSql}`;
                }).join(' UNION ALL ');

                const loaded = await new Promise((resolve)=>{
                    const marketfncd = GetMarket(db_id,'d');
                    marketfncd((connd)=>{
                        const queryStart = Date.now();
                        connd.query(sqlquery, (err, rows) =>
                        {
                            connd.release();
                            queryMs += Date.now() - queryStart;

                            if(err || !rows)
                            {
                                resolve(null);
                                return;
                            }

                            rowsLoaded += rows.length;
                            const buildStart = Date.now();
                            const rowsByTicker = new Map();
                            rows.forEach((row)=>{
                                const ticker = row._topstock_ticker;
                                if(!rowsByTicker.has(ticker))
                                    rowsByTicker.set(ticker, []);

                                delete row._topstock_ticker;
                                row.date = String(row.date);
                                rowsByTicker.get(ticker).push(row);
                            })
                            buildMs += Date.now() - buildStart;

                            resolve(rowsByTicker);
                        })
                    })
                })

                if(!loaded)
                {
                    ++fallbackGroups;
                    await Promise.all(group.map((ticker)=>LoadDailyRowsCached(ticker, tableSet)));
                    return;
                }

                group.forEach((ticker)=>{
                    const cacheKey = String(ticker).toLowerCase();
                    const rows = loaded.get(ticker) || [];
                    rows.sort((a,b)=>{
                        if(a.date === b.date)
                            return 0;
                        return a.date > b.date ? -1 : 1;
                    })
                    globalval.simDailyRowsByTicker.set(cacheKey, rows);
                })
            })
        }

        const result = tickers.map((ticker)=>{
            return globalval.simDailyRowsByTicker.get(String(ticker).toLowerCase());
        })
        const elapsed = Date.now() - loadStart;
        if(elapsed > 300 || uncachedTargets.length > 0 || skippedMissingTable > 0)
            AddSimulationLog(`[TOPSTOCK_DAILY_CACHE] ${today} tickers:${tickers.length} uncached:${uncachedTargets.length} missingTable:${skippedMissingTable} rows:${rowsLoaded} query:${queryMs}ms build:${buildMs}ms fallbackGroups:${fallbackGroups} elapsed:${elapsed}ms`);
        return result;
    }

    const GetDailyRowsForToday=(rows)=>{
        if(!rows || rows.length <= 0)
            return null;

        let left = 0;
        let right = rows.length - 1;
        let foundIndex = -1;

        while(left <= right)
        {
            const mid = Math.floor((left + right) / 2);
            if(rows[mid].date <= today)
            {
                foundIndex = mid;
                right = mid - 1;
            }
            else
            {
                left = mid + 1;
            }
        }

        if(foundIndex < 0)
            return null;

        return rows.slice(foundIndex, foundIndex + dailyLookbackDays);
    }

    const IsTopstockSelfReturnValid=(data1)=>{
        if(!topstockSelfReturnDays.length)
            return true;
        if(!data1 || !data1.length)
            return false;
        const currentClose = Number(data1[1] && data1[1].close);
        if(!Number.isFinite(currentClose) || currentClose <= 0)
            return false;

        return topstockSelfReturnDays.every((day)=>{
            const past = data1[day + 1];
            const pastClose = Number(past && past.close);
            if(!Number.isFinite(pastClose) || pastClose <= 0)
                return false;
            return topstockSelfReturnMode === 'negative' ? currentClose < pastClose : currentClose > pastClose;
        });
    }

    const CheckDailyData=(ticker, data1, err1, dataslength, minuteCountTargets)=>{
        let validshare = false;     
        // let data1;
        let isvalidupdated; 
        let statusstr;
        let validstatus;
        let validrights;
        let validselfreturn;

        if(!err1 && data1)
        {
            validshare = true;
            // data1 = data30.slice(0,2);
            isvalidupdated = (data1 && data1.length > 1 && data1[0].date === today); 
            statusstr = (data1 && data1[0]) ? data1[0].status : '';
            validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
            validrights = defulatConfig.usecandidatevalidrightsfilter ? ValidRightsBeforeTodayRows(data1, defulatConfig.validrightsdays, today) : true;
            validselfreturn = IsTopstockSelfReturnValid(data1);
        }    

        globalval.savedtopstockliststatus = `Topstocklist4-2 ${isvalidupdated} ${statusstr} ${validstatus} ${validrights} ${validselfreturn}`;

        if(validshare && isvalidupdated && validstatus && validrights && validselfreturn)
        {
            const minuteDates = data1.slice(1, stockfilterdays + 1).map(item=>String(item.date));
            const rangeText = `${data1[0].code},${minuteDates[0]},${minuteDates[minuteDates.length-1]}`;
            globalval.savedtopstockliststatus = `Topstocklist4-3 OK ${ticker} ${rangeText} ${checkedstockcount}/${dataslength}`;
            minuteCountTargets.push({
                ticker,
                code:data1[0].code,
                dates:minuteDates,
                rangeText,
            });
        }
        else{
            ++checkedstockcount;
            globalval.savedtopstockliststatus = `Topstocklist4-O ERR ${ticker} ${formattedDate} ${checkedstockcount}/${dataslength}`;
                
            if(checkedstockcount === dataslength)
            {
                ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
            }

            if(!validshare)
            {
                console.log(`${ticker}은 ${formattedDate}에 상폐로 매수 제외!`);
            }
            else 
            {
                if(!validstatus)
                {
                    console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 관리/중지/정지 종목으로 매수 제외!`);
                }
                // if(!validrights)
                // {
                //     console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 최근 ${defulatConfig.validrightsdays}일간 권리/배당으로 가격외곡! 매수 제외!`);
                // }
            }
        }
    }

    const QueryMinuteCountMulti=async(targets)=>{
        const result = new Map();
        if(!targets.length)
            return result;

        targets.forEach((target)=>{
            result.set(String(target.ticker).toLowerCase(), 0);
        })

        if(defulatConfig.usememcached)
        {
            const memcacheRequests = [];
            targets.forEach((target)=>{
                const ticker = String(target.ticker).toLowerCase();
                const code = String(target.code || target.ticker).toLowerCase();
                target.dates.forEach((date)=>{
                    memcacheRequests.push({
                        ticker,
                        key:`${String(date).slice(2)}${code}`.toLowerCase(),
                    });
                })
            })

            for(let i = 0; i < memcacheRequests.length; i += 100)
            {
                const group = memcacheRequests.slice(i, i + 100);
                await new Promise((resolve)=>{
                    GetMemcachedDataMulti(group.map(item=>item.key), (resultByKey)=>{
                        group.forEach(({ticker, key})=>{
                            const memcachedData = resultByKey ? resultByKey[key] : null;
                            const count = Array.isArray(memcachedData) ? memcachedData.filter(close=>close !== '').length : 0;
                            result.set(ticker, (result.get(ticker) || 0) + count);
                        })
                        resolve();
                    })
                })
            }

            return result;
        }

        const minuteCacheUrl = process.env.MINUTE_CACHE_URL ? String(process.env.MINUTE_CACHE_URL).replace(/\/+$/, '') : '';
        if(!minuteCacheUrl)
            return result;

        const targetsByDate = new Map();
        targets.forEach((target)=>{
            target.dates.forEach((date)=>{
                const dateKey = String(date);
                if(!targetsByDate.has(dateKey))
                    targetsByDate.set(dateKey, []);
                targetsByDate.get(dateKey).push(target);
            })
        })

        const requests = [];
        targetsByDate.forEach((dateTargets, date)=>{
            MakeChunks(dateTargets, 300).forEach((group)=>requests.push({date, group}));
        })

        let minuteCountEndpointDisabled = false;

        const applyMinuteCountData = (data, group)=>{
            group.forEach((target)=>{
                const key = String(target.ticker).toLowerCase();
                const item = data ? data[key] : null;
                const points = item && item.points != null ? Number(item.points) : Number(item || 0);
                result.set(key, (result.get(key) || 0) + points);
            })
        }

        await RunLimited(requests, 4, async({date, group})=>{
            try {
                const tickers = group.map(item=>String(item.ticker).toLowerCase());
                const requestTimeout = Number(process.env.MINUTE_CACHE_TIMEOUT_MS || 30000);
                const requestStart = Date.now();
                if(!minuteCountEndpointDisabled) {
                    try {
                        const response = await axios.get(`${minuteCacheUrl}/minute-count-v2`, {
                            params:{
                                db_id:db_id,
                                date:date,
                                tickers:tickers.join(','),
                            },
                            headers:MakeMinuteCacheHeaders(),
                            timeout:requestTimeout,
                            maxContentLength:1024 * 1024,
                            maxBodyLength:1024 * 1024,
                        });
                        const requestElapsed = Date.now() - requestStart;
                        const data = response && response.data ? response.data.data : null;
                        if(response && response.data && response.data.ok && data) {
                            if(requestElapsed > 200 || today === '20230111')
                                AddSimulationLog(`[TOPSTOCK_MINUTECOUNT_COUNT] ${today} date:${date} tickers:${tickers.length} returned:${Object.keys(data).length} remote:${response.data.elapsedMs != null ? response.data.elapsedMs : 'na'}ms total:${requestElapsed}ms`);
                            applyMinuteCountData(data, group);
                            return;
                        }
                    } catch (countErr) {
                        const status = countErr && countErr.response ? countErr.response.status : 0;
                        if(status === 404 || status === 405) {
                            minuteCountEndpointDisabled = true;
                            AddSimulationLog(`[TOPSTOCK_MINUTECOUNT_COUNT_DISABLED] ${today} ${date} status:${status}`);
                        }
                        else {
                            AddSimulationLog(`[TOPSTOCK_MINUTECOUNT_COUNT_ERR] ${today} ${date} ${countErr && countErr.message ? countErr.message : countErr}`);
                        }
                    }
                }

                const fallbackStart = Date.now();
                const response = await axios.get(`${minuteCacheUrl}/minute-data-v2`, {
                    params:{
                        db_id:db_id,
                        date:date,
                        tickers:tickers.join(','),
                    },
                    headers:MakeMinuteCacheHeaders(),
                    timeout:requestTimeout,
                    maxContentLength:20 * 1024 * 1024,
                    maxBodyLength:20 * 1024 * 1024,
                });
                const fallbackElapsed = Date.now() - fallbackStart;

                const data = response && response.data ? response.data.data : null;
                if(fallbackElapsed > 500 || today === '20230111') {
                    const responseBytes = response && response.data ? Buffer.byteLength(JSON.stringify(response.data)) : 0;
                    AddSimulationLog(`[TOPSTOCK_MINUTECOUNT_REQ] ${today} date:${date} tickers:${tickers.length} returned:${data ? Object.keys(data).length : 0} remote:${response && response.data && response.data.elapsedMs != null ? response.data.elapsedMs : 'na'}ms total:${fallbackElapsed}ms bytes:${responseBytes}`);
                }
                applyMinuteCountData(data, group);
            } catch (err) {
                AddSimulationLog(`[TOPSTOCK_MINUTECOUNT_ERR] ${today} ${date} ${err && err.message ? err.message : err}`);
            }
        })

        return result;
    }

    if(defulatConfig.awaitlog)
        console.log(`Topstocklist2 ${today}`);

    const datas = await GetStocktableFinal(db_id, today);
    const stocktableElapsed = Date.now() - toplistStartTime;
    const olddataleng = datas.length;
    if(datas && olddataleng>0)
    {   
        ///// 200 naq test
        
        // datas = datas.reduce(function(accum,cur){accum.push(cur.ticker); return accum},[])
        // datas = datas.concat(GetTempnaq200());
        // datas = Array.from(new Set(datas.map((item) => item)));
        ///////////////////////////////////////

        if(defulatConfig.awaitlog)
            console.log(`Topstocklist4-O ${today} ${olddataleng} ${datas.length}`);

        const unionStartTime = Date.now();
        const tableSetStartTime = Date.now();
        const tableSet = await GetDailyTableSet();
        const tableSetElapsed = Date.now() - tableSetStartTime;
        const minuteCountTargets = [];

        let dailyCacheProgress = 0;
        const dailyCacheTotal = datas.length;
        if(defulatConfig.awaitlog)
            console.log(`[TOPSTOCK_PREP] ${today} daily-cache start ${dailyCacheTotal}`);
        const dailyRowsStartTime = Date.now();
        const dailyRowsList = await LoadDailyRowsCachedMulti(datas, tableSet);
        const dailyRowsElapsed = Date.now() - dailyRowsStartTime;
        const dailySliceStartTime = Date.now();
        const dailyLoadResults = datas.map((ticker, index)=>{
            const rows = dailyRowsList[index];
            ++dailyCacheProgress;
            if(defulatConfig.awaitlog && (dailyCacheProgress === 1 || dailyCacheProgress % 25 === 0 || dailyCacheProgress === dailyCacheTotal))
                console.log(`[TOPSTOCK_PREP] ${today} daily-cache ${dailyCacheProgress}/${dailyCacheTotal} ${ticker}`);
            return {
                ticker,
                data1: GetDailyRowsForToday(rows),
            };
        })
        const dailySliceElapsed = Date.now() - dailySliceStartTime;
        if(defulatConfig.awaitlog)
            console.log(`[TOPSTOCK_PREP] ${today} daily-cache done ${Date.now() - unionStartTime}ms`);

        const dailyCheckStartTime = Date.now();
        dailyLoadResults.forEach((result)=>{
            CheckDailyData(result.ticker, result.data1, result.data1 ? null : true, datas.length, minuteCountTargets);
        })
        const dailyCheckElapsed = Date.now() - dailyCheckStartTime;
        const unionElapsed = Date.now() - unionStartTime;
        if(unionElapsed > 500 || tableSetElapsed > 100 || dailyRowsElapsed > 300 || dailySliceElapsed > 100 || dailyCheckElapsed > 100)
            AddSimulationLog(`[TOPSTOCK_UNION_DETAIL] ${today} tableSet:${tableSetElapsed}ms dailyRows:${dailyRowsElapsed}ms slice:${dailySliceElapsed}ms check:${dailyCheckElapsed}ms targets:${minuteCountTargets.length} total:${unionElapsed}ms`);
        const minuteCountStartTime = Date.now();
        const minuteCountByTicker = await QueryMinuteCountMulti(minuteCountTargets);
        minuteCountTargets.forEach(({ticker, rangeText})=>{
            const count = minuteCountByTicker.get(String(ticker).toLowerCase()) || 0;
            const valid = count > 0;
            ++checkedstockcount;
            globalval.savedtopstockliststatus = `Topstocklist4-4 OK ${count} ${valid} ${checkedstockcount}/${datas.length}`;
            SendCallBack(valid, ticker, count, datas.length, rangeText);
        })

        AddSimulationLog(`[TOPSTOCK_TRACE] ${today} total:${Date.now() - toplistStartTime}ms stocktable:${stocktableElapsed}ms union:${unionElapsed}ms minuteCount:${Date.now() - minuteCountStartTime}ms datas:${datas.length} valid:${tickers.length}`);

        return;
    }
    else{
        if(defulatConfig.awaitlog)
            console.log(`Topstocklist4-X ${today} ${err2}`);
        ResolveCallback([],'',callback)
    }
}

// CASE1. topstocklistlog 디비 모두 참조해서 순회하며 가까운 날짜의 시총 가져옴 : 간격이 월~연단위
const Topstocklist_live=async (today, db_id, callback)=>{             
    
    if(defulatConfig.autosimulation && (defulatConfig.usesinglesimulation || (defulatConfig.simulonlyonestock && defulatConfig.simulonlyonestock != '')))
    {
        const tickers = defulatConfig.usesinglesimulation ? [globalval.simticker] : defulatConfig.simulonlyonestock.split(',').map(s => s.trim());
        ResolveCallback(tickers,'',callback)
        return;
    }
    
    if(!defulatConfig.autosimulation)
        console.log('Topstocklist-0');
    let tickers = [];

    if(!defulatConfig.usetopstocklist)
    {
        ResolveCallback(tickers, 'usetopstocklist false',callback);
        return;
    }

    let checkedstockcount = 0;
    const formattedDate = `${today.substring(0, 4)}-${today.substring(4, 6)}-${today.substring(6, 8)}`;
    const dailyLookbackDays = Math.max(stockfilterdays + 1, (defulatConfig.usecandidatevalidrightsfilter && defulatConfig.validrightsdays) ? defulatConfig.validrightsdays + 1 : 0);
    // const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${defulatConfig.validrightsdays ? defulatConfig.validrightsdays :  stockfilterdays+1}`;
    const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${dailyLookbackDays}`;        
    const sqlminute = `SELECT COUNT(*) as cnt FROM ?? WHERE DATE(datetime) <= ? AND DATE(datetime) >= ? AND TIME(datetime)>'09:00' AND TIME(datetime)<'16:00'`;

    const GetFilteredMinuteCount=(percent)=>{
        const onedayminuteMax = 390;
        return onedayminuteMax * (percent / 100);
    }
    const filterminuteleast = GetFilteredMinuteCount(filterpercent);//0=0%nofilter, 30%, 40% 195=50%, 270=70%, 310=80%  _ 최대 390개
    
    const SendCallBack=(valid, ticker, vaildvolumes, dataslength, etcinfo)=>{
        let validticcker = false;     
        if(valid){
            const day30countsAvr = vaildvolumes / stockfilterdays;
            validticcker = day30countsAvr > filterminuteleast;
            if(validticcker)
            {
                // tickers.push(ticker);

                // 동기화 테스트 : 끝나고 부활
                let excludetickers = defulatConfig.autosimulation ? defulatConfig.excludesimulonlyonestock.split(',') : [];
                if(!excludetickers.includes(ticker))
                    tickers.push(ticker);
                else
                    console.log(`${ticker} is exclude ticker`);
            }
        }
        else{
            // console.log(`${ticker} is unvalid`); 
        }

        if(!defulatConfig.autosimulation)
            console.log('Topstocklist-2', valid ? 'add:' : 'pass', validticcker, `c:${vaildvolumes}`, `${etcinfo}`, `${checkedstockcount}/${dataslength}`);

        globalval.savedtopstockliststatus = `SendCallBack ${valid} ${checkedstockcount} ${dataslength}`;
        if(checkedstockcount === dataslength)
        {
            ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
        }  
    }

    if(defulatConfig.awaitlog)
        console.log(`Topstocklist2 ${today}`);

    const datas = await GetStocktableFinal(db_id, today);
    const olddataleng = datas.length;
    if(datas && olddataleng>0)
    {   
        ///// 200 naq test
        
        // datas = datas.reduce(function(accum,cur){accum.push(cur.ticker); return accum},[])
        // datas = datas.concat(GetTempnaq200());
        // datas = Array.from(new Set(datas.map((item) => item)));
        ///////////////////////////////////////
        if(!defulatConfig.autosimulation)
            console.log('Topstocklist-1', 'today : ', today, 'leng : ', datas.length);

        if(defulatConfig.awaitlog)
            console.log(`Topstocklist4-O ${today} ${olddataleng} ${datas.length}`);

        datas.forEach((data,index)=>{
            const ticker = data;
            // tickers.push(ticker);                
            //const sql = `SELECT COUNT(*) as cnt FROM ?? where date < ${today} and date > ${tenDaysAgo}`;
            const values = [ticker];
            const marketfncd = GetMarket(db_id,'d');
            marketfncd((connd)=>{
                globalval.savedtopstockliststatus = `Topstocklist4-1`;
                connd.query(sqldaily, values, (err1, data1) => 
                {   
                    connd.release();
                    let validshare = false;     
                    // let data1;
                    let isvalidupdated; 
                    let statusstr;
                    let validstatus;
                    let validrights;

                    if(!err1 && data1)
                    {
                        validshare = true;
                        // data1 = data30.slice(0,2);
                        isvalidupdated = (data1 && data1.length > 1 && data1[0].date === today); 
                        statusstr = (data1 && data1[0]) ? data1[0].status : '';
                        validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
                        validrights = defulatConfig.usecandidatevalidrightsfilter ? ValidRightsBeforeTodayRows(data1, defulatConfig.validrightsdays, today) : true;
                    }    

                    globalval.savedtopstockliststatus = `Topstocklist4-2 ${isvalidupdated} ${statusstr} ${validstatus} ${validrights}`;

                    if(validshare && isvalidupdated && validstatus && validrights)
                    {
                        if(false)
                        {
                            const memcachedkey = `${data1[data1.length-1].date.slice(2)}${data1[0].code}`;
                            globalval.savedtopstockliststatus = `Topstocklist4-3 OK ${ticker} ${memcachedkey} ${checkedstockcount}/${datas.length}`;
                            
                            GetMemcachedData(memcachedkey, (memcacheddata)=>{
                                const count = memcacheddata ? memcacheddata.filter(close => close !== '').length : 0;
                                const valid = memcacheddata !== null && count > 0;
                                ++checkedstockcount;
                                globalval.savedtopstockliststatus = `Topstocklist4-4 OK ${count} ${valid} ${checkedstockcount}/${datas.length}`;
                                SendCallBack(valid, ticker, count, datas.length, memcachedkey);
                            })
                        }
                        else
                        {
                            // 오늘날짜는 제외하고 어제날짜까지의 분봉만 계산하기 위해 1, -1를 해준다
                            const minuteRangeEnd = data1[stockfilterdays] || data1[data1.length - 1];
                            const values = [data1[0].code, data1[1].date, minuteRangeEnd.date]; 
                            const marketfncm = GetMarket(db_id, 'm');
                            marketfncm((connm)=>{
                                connm.query(sqlminute, values, (err2, data2) => 
                                {    
                                    connm.release();
                                    const valid = (!err2 && data2 && data2[0] && data2.length>0);
                                    const datacnt = valid ? data2[0].cnt : 0;
                                    ++checkedstockcount;
                                    SendCallBack(valid, ticker, datacnt, datas.length, values.join(', '));
                                })
                            })
                        }
                        
                    }
                    else{
                        ++checkedstockcount;
                        globalval.savedtopstockliststatus = `Topstocklist4-O ERR ${ticker} ${formattedDate} ${checkedstockcount}/${datas.length}`;
                            
                        if(checkedstockcount === datas.length)
                        {
                            ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
                        }

                        if(!validshare)
                        {
                            console.log(`${ticker}은 ${formattedDate}에 상폐로 매수 제외!`);
                        }
                        else 
                        {
                            if(!validstatus)
                            {
                                console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 관리/중지/정지 종목으로 매수 제외!`);
                            }
                            // if(!validrights)
                            // {
                            //     console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 최근 ${defulatConfig.validrightsdays}일간 권리/배당으로 가격외곡! 매수 제외!`);
                            // }
                        }
                    }
                    
                })
            })
        })
        // callback(tickers, '');
        return;
    }
    else{
        if(defulatConfig.awaitlog)
            console.log(`Topstocklist4-X ${today} ${err2}`);
        ResolveCallback([],'',callback)
    }
}

// 결과달라짐 ai fast
// const Topstocklist=async (today, db_id, callback)=>{             
    
//     if(defulatConfig.autosimulation && (defulatConfig.usesinglesimulation || (defulatConfig.simulonlyonestock && defulatConfig.simulonlyonestock != '')))
//     {
//         const tickers = defulatConfig.usesinglesimulation ? [globalval.simticker] : defulatConfig.simulonlyonestock.split(',').map(s => s.trim());
//         ResolveCallback(tickers,'',callback)
//         return;
//     }
    
//     if(!defulatConfig.autosimulation)
//         console.log('Topstocklist-0');
//     let tickers = [];

//     if(!defulatConfig.usetopstocklist)
//     {
//         ResolveCallback(tickers, 'usetopstocklist false',callback);
//         return;
//     }

//     let checkedstockcount = 0;
//     const formattedDate = `${today.substring(0, 4)}-${today.substring(4, 6)}-${today.substring(6, 8)}`;
//     // const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${defulatConfig.validrightsdays ? defulatConfig.validrightsdays :  stockfilterdays+1}`;
//     const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${stockfilterdays+1}`;        
//     const sqlminute = `SELECT COUNT(*) as cnt FROM ?? WHERE DATE(datetime) <= ? AND DATE(datetime) >= ? AND TIME(datetime)>'09:00' AND TIME(datetime)<'16:00'`;

//     const GetFilteredMinuteCount=(percent)=>{
//         const onedayminuteMax = 390;
//         return onedayminuteMax * (percent / 100);
//     }
//     const filterminuteleast = GetFilteredMinuteCount(filterpercent);//0=0%nofilter, 30%, 40% 195=50%, 270=70%, 310=80%  _ 최대 390개
    
//     const SendCallBack=(valid, ticker, vaildvolumes, dataslength, etcinfo)=>{
//         let validticcker = false;     
//         if(valid){
//             const day30countsAvr = vaildvolumes / stockfilterdays;
//             validticcker = day30countsAvr > filterminuteleast;
//             if(validticcker)
//             {
//                 // tickers.push(ticker);

//                 // 동기화 테스트 : 끝나고 부활
//                 let excludetickers = defulatConfig.autosimulation ? defulatConfig.excludesimulonlyonestock.split(',') : [];
//                 if(!excludetickers.includes(ticker))
//                     tickers.push(ticker);
//                 else
//                     console.log(`${ticker} is exclude ticker`);
//             }
//         }
//         else{
//             // console.log(`${ticker} is unvalid`); 
//         }

//         if(!defulatConfig.autosimulation)
//             console.log('Topstocklist-2', valid ? 'add:' : 'pass', validticcker, `c:${vaildvolumes}`, `${etcinfo}`, `${checkedstockcount}/${dataslength}`);

//         globalval.savedtopstockliststatus = `SendCallBack ${valid} ${checkedstockcount} ${dataslength}`;
//         if(checkedstockcount === dataslength)
//         {
//             ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
//         }  
//     }

//     const EscapeSqlIdentifier=(value)=>{
//         return `\`${String(value).replace(/`/g, '``')}\``;
//     }

//     const EscapeSqlString=(value)=>{
//         return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
//     }

//     const LoadDailyTableSet=()=>{
//         return new Promise((resolve)=>{
//             const marketfncd = GetMarket(db_id,'d');
//             marketfncd((connd)=>{
//                 connd.query('SHOW TABLES', (err, rows)=>{
//                     connd.release();

//                     if(err || !rows)
//                     {
//                         console.log('Topstocklist SHOW TABLES err', err);
//                         resolve(null);
//                         return;
//                     }

//                     const tableSet = new Set();
//                     rows.forEach((row)=>{
//                         const tableName = Object.values(row)[0];
//                         if(tableName)
//                             tableSet.add(String(tableName).toLowerCase());
//                     })

//                     resolve(tableSet);
//                 })
//             })
//         })
//     }

//     const ResolveDailyTableTicker=(ticker, tableSet)=>{
//         if(!tableSet)
//             return ticker;

//         const raw = String(ticker);
//         const lower = raw.toLowerCase();
//         const upper = raw.toUpperCase();
//         const noPrefix = lower.replace(/^a/i, '');

//         const candidates = [
//             raw,
//             lower,
//             upper,
//             noPrefix,
//             `a${noPrefix}`,
//             `A${noPrefix}`,
//         ];

//         for(const candidate of candidates)
//         {
//             if(tableSet.has(candidate.toLowerCase()))
//                 return candidate;
//         }

//         return null;
//     }

//     const BuildTopstockDailyUnionQuery=(targets)=>{
//         const dateValue = EscapeSqlString(formattedDate);
//         const limit = stockfilterdays + 1;

//         return targets.map(({ticker, tableTicker})=>{
//             const tableName = EscapeSqlIdentifier(tableTicker);
//             const tickerValue = EscapeSqlString(ticker);

//             return `(
//                 SELECT '${tickerValue}' AS _topstock_ticker, code, name, date, status
//                 FROM ${tableName}
//                 WHERE DATE(datetime) <= '${dateValue}'
//                 ORDER BY DATE(datetime) DESC
//                 LIMIT ${limit}
//             )`;
//         }).join(' UNION ALL ');
//     }

//     const QueryTopstockDailyChunk=(targets)=>{
//         return new Promise((resolve)=>{
//             if(targets.length === 0)
//             {
//                 resolve(new Map());
//                 return;
//             }

//             const marketfncd = GetMarket(db_id,'d');
//             const sqlquery = BuildTopstockDailyUnionQuery(targets);

//             marketfncd((connd)=>{
//                 connd.query(sqlquery, (err1, rows) => 
//                 {   
//                     connd.release();

//                     if(err1 || !rows)
//                     {
//                         console.log('Topstocklist union daily err', err1);
//                         resolve(null);
//                         return;
//                     }

//                     const byTicker = new Map();
//                     rows.forEach((row)=>{
//                         const ticker = row._topstock_ticker;
//                         if(!byTicker.has(ticker))
//                             byTicker.set(ticker, []);
//                         byTicker.get(ticker).push(row);
//                     })

//                     resolve(byTicker);
//                 })
//             })
//         })
//     }

//     const QueryTopstockDailySingle=(ticker, tableTicker)=>{
//         return new Promise((resolve)=>{
//             // tickers.push(ticker);                
//             //const sql = `SELECT COUNT(*) as cnt FROM ?? where date < ${today} and date > ${tenDaysAgo}`;
//             const values = [tableTicker || ticker];
//             const marketfncd = GetMarket(db_id,'d');
//             marketfncd((connd)=>{
//                 globalval.savedtopstockliststatus = `Topstocklist4-1`;
//                 connd.query(sqldaily, values, (err1, data1) => 
//                 {   
//                     connd.release();
//                     resolve(err1 ? null : data1);
//                 })
//             })
//         })
//     }

//     const PushMemcacheTargetOrExclude=(ticker, data1, dataslength, memcacheTargets)=>{
//         let validshare = false;     
//         // let data1;
//         let isvalidupdated; 
//         let statusstr;
//         let validstatus;
//         // let validrights;

//         if(data1)
//         {
//             validshare = true;
//             // data1 = data30.slice(0,2);
//             isvalidupdated = (data1 && data1.length > 1 && data1[0].date === today); 
//             statusstr = (data1 && data1[0]) ? data1[0].status : '';
//             validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
//             // validrights = ValidRights(data30);
//         }    

//         globalval.savedtopstockliststatus = `Topstocklist4-2 ${isvalidupdated} ${statusstr} ${validstatus}`;

//         if(validshare && isvalidupdated && validstatus)// && validrights)
//         {
//             const memcachedkey = `${data1[data1.length-1].date.slice(2)}${data1[0].code}`;
//             globalval.savedtopstockliststatus = `Topstocklist4-3 OK ${ticker} ${memcachedkey} ${checkedstockcount}/${dataslength}`;
//             memcacheTargets.push({
//                 ticker,
//                 key: memcachedkey.toLowerCase(),
//                 memcachedkey,
//             });
//         }
//         else{
//             ++checkedstockcount;
//             globalval.savedtopstockliststatus = `Topstocklist4-O ERR ${ticker} ${formattedDate} ${checkedstockcount}/${dataslength}`;
                
//             if(checkedstockcount === dataslength)
//             {
//                 ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
//             }

//             if(!validshare)
//             {
//                 console.log(`${ticker}은 ${formattedDate}에 상폐로 매수 제외!`);
//             }
//             else 
//             {
//                 if(!validstatus)
//                 {
//                     console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 관리/중지/정지 종목으로 매수 제외!`);
//                 }
//                 // if(!validrights)
//                 // {
//                 //     console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 최근 ${defulatConfig.validrightsdays}일간 권리/배당으로 가격외곡! 매수 제외!`);
//                 // }
//             }
//         }
//     }

//     if(defulatConfig.awaitlog)
//         console.log(`Topstocklist2 ${today}`);

//     const datas = await GetStocktableFinal(db_id, today);
//     const olddataleng = datas.length;
//     if(datas && olddataleng>0)
//     {   
//         ///// 200 naq test
        
//         // datas = datas.reduce(function(accum,cur){accum.push(cur.ticker); return accum},[])
//         // datas = datas.concat(GetTempnaq200());
//         // datas = Array.from(new Set(datas.map((item) => item)));
//         ///////////////////////////////////////
//         if(!defulatConfig.autosimulation)
//             console.log('Topstocklist-1', 'today : ', today, 'leng : ', datas.length);

//         if(defulatConfig.awaitlog)
//             console.log(`Topstocklist4-O ${today} ${olddataleng} ${datas.length}`);

//         if(usememcached)
//         {
//             const memcacheTargets = [];
//             const unionChunkSize = 50;
//             const dailyTableSet = await LoadDailyTableSet();

//             for(let i = 0; i < datas.length; i += unionChunkSize)
//             {
//                 const group = datas.slice(i, i + unionChunkSize);
//                 const unionTargets = [];
//                 const singleFallbackTargets = [];

//                 group.forEach((ticker)=>{
//                     const tableTicker = ResolveDailyTableTicker(ticker, dailyTableSet);
//                     if(tableTicker)
//                         unionTargets.push({ticker, tableTicker});
//                     else
//                         PushMemcacheTargetOrExclude(ticker, null, datas.length, memcacheTargets);
//                 })

//                 const dailyByTicker = await QueryTopstockDailyChunk(unionTargets);

//                 if(dailyByTicker)
//                 {
//                     unionTargets.forEach(({ticker})=>{
//                         const data1 = dailyByTicker.get(ticker);
//                         PushMemcacheTargetOrExclude(ticker, data1, datas.length, memcacheTargets);
//                     })
//                 }
//                 else
//                 {
//                     singleFallbackTargets.push(...unionTargets);
//                 }

//                 if(singleFallbackTargets.length > 0)
//                 {
//                     await Promise.all(singleFallbackTargets.map(async ({ticker, tableTicker})=>{
//                         const data1 = await QueryTopstockDailySingle(ticker, tableTicker);
//                         PushMemcacheTargetOrExclude(ticker, data1, datas.length, memcacheTargets);
//                     }))
//                 }
//             }

//             for(let i = 0; i < memcacheTargets.length; i += 100)
//             {
//                 const group = memcacheTargets.slice(i, i + 100);
//                 await new Promise((resolve)=>{
//                     GetMemcachedDataMulti(group.map(item => item.key), (resultByKey)=>{
//                         group.forEach(({ticker, key, memcachedkey})=>{
//                             const memcacheddata = resultByKey[key] ?? null;
//                             const count = memcacheddata ? memcacheddata.filter(close => close !== '').length : 0;
//                             const valid = memcacheddata !== null && count > 0;
//                             ++checkedstockcount;
//                             globalval.savedtopstockliststatus = `Topstocklist4-4 OK ${count} ${valid} ${checkedstockcount}/${datas.length}`;
//                             SendCallBack(valid, ticker, count, datas.length, memcachedkey);
//                         })
//                         resolve();
//                     })
//                 })
//             }

//             return;
//         }

//         datas.forEach((data,index)=>{
//             const ticker = data;
//             // tickers.push(ticker);                
//             //const sql = `SELECT COUNT(*) as cnt FROM ?? where date < ${today} and date > ${tenDaysAgo}`;
//             const values = [ticker];
//             const marketfncd = GetMarket(db_id,'d');
//             marketfncd((connd)=>{
//                 globalval.savedtopstockliststatus = `Topstocklist4-1`;
//                 connd.query(sqldaily, values, (err1, data1) => 
//                 {   
//                     connd.release();
//                     let validshare = false;     
//                     // let data1;
//                     let isvalidupdated; 
//                     let statusstr;
//                     let validstatus;
//                     // let validrights;

//                     if(!err1 && data1)
//                     {
//                         validshare = true;
//                         // data1 = data30.slice(0,2);
//                         isvalidupdated = (data1 && data1.length > 1 && data1[0].date === today); 
//                         statusstr = (data1 && data1[0]) ? data1[0].status : '';
//                         validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
//                         // validrights = ValidRights(data30);
//                     }    

//                     globalval.savedtopstockliststatus = `Topstocklist4-2 ${isvalidupdated} ${statusstr} ${validstatus}`;

//                     if(validshare && isvalidupdated && validstatus)// && validrights)
//                     {
//                         if(usememcached)
//                         {
//                             const memcachedkey = `${data1[data1.length-1].date.slice(2)}${data1[0].code}`;
//                             globalval.savedtopstockliststatus = `Topstocklist4-3 OK ${ticker} ${memcachedkey} ${checkedstockcount}/${datas.length}`;
                            
//                             GetMemcachedData(memcachedkey, (memcacheddata)=>{
//                                 const count = memcacheddata ? memcacheddata.filter(close => close !== '').length : 0;
//                                 const valid = memcacheddata !== null && count > 0;
//                                 ++checkedstockcount;
//                                 globalval.savedtopstockliststatus = `Topstocklist4-4 OK ${count} ${valid} ${checkedstockcount}/${datas.length}`;
//                                 SendCallBack(valid, ticker, count, datas.length, memcachedkey);
//                             })
//                         }
//                         else
//                         {
//                             // 오늘날짜는 제외하고 어제날짜까지의 분봉만 계산하기 위해 1, -1를 해준다
//                             const values = [data1[0].code, data1[1].date, data1[data1.length-1].date]; 
//                             const marketfncm = GetMarket(db_id, 'm');
//                             marketfncm((connm)=>{
//                                 connm.query(sqlminute, values, (err2, data2) => 
//                                 {    
//                                     connm.release();
//                                     const valid = (!err2 && data2 && data2[0] && data2.length>0);
//                                     const datacnt = valid ? data2[0].cnt : 0;
//                                     ++checkedstockcount;
//                                     SendCallBack(valid, ticker, datacnt, datas.length, values.join(', '));
//                                 })
//                             })
//                         }
                        
//                     }
//                     else{
//                         ++checkedstockcount;
//                         globalval.savedtopstockliststatus = `Topstocklist4-O ERR ${ticker} ${formattedDate} ${checkedstockcount}/${datas.length}`;
                            
//                         if(checkedstockcount === datas.length)
//                         {
//                             ResolveCallback(tickers.sort((a,b)=>{return a.localeCompare(b)}), `${tickers.length}/${checkedstockcount}(D${stockfilterdays})`,callback);
//                         }

//                         if(!validshare)
//                         {
//                             console.log(`${ticker}은 ${formattedDate}에 상폐로 매수 제외!`);
//                         }
//                         else 
//                         {
//                             if(!validstatus)
//                             {
//                                 console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 관리/중지/정지 종목으로 매수 제외!`);
//                             }
//                             // if(!validrights)
//                             // {
//                             //     console.log(`${data1[0].code} ${data1[0].name} 은 ${formattedDate}에 최근 ${defulatConfig.validrightsdays}일간 권리/배당으로 가격외곡! 매수 제외!`);
//                             // }
//                         }
//                     }
                    
//                 })
//             })
//         })
//         // callback(tickers, '');
//         return;
//     }
//     else{
//         if(defulatConfig.awaitlog)
//             console.log(`Topstocklist4-X ${today} ${err2}`);
//         ResolveCallback([],'',callback)
//     }
// }



const GetTempnaq200=()=>{
    return[];
//     return ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'COST', 'NFLX', 'ASML', 'TMUS', 'CSCO', 'AZN', 'LIN', 'ISRG', 'PEP', 'QCOM', 'ADBE', 'AMD', 'PLTR', 'TXN', 'INTU', 'ARM',
// 'BKNG', 'PDD', 'AMGN', 'AMAT', 'HON', 'SNY', 'CMCSA', 'APP', 'ADP', 'SBUX', 'GILD', 'VRTX', 'LRCX', 'ADI', 'MU', 'KLAC', 'CRWD', 'MELI', 'MRVL', 'CEG', 'IBKR', 'PYPL', 'EQIX', 'INTC', 'CME',
// 'ABNB', 'CDNS', 'TEAM', 'SNPS', 'MAR', 'CTAS', 'MSTR', 'DASH', 'FTNT', 'MDLZ', 'ORLY', 'COIN', 'REGN', 'WDAY', 'ADSK', 'NTES', 'JD', 'CSX', 'ROP', 'PANW', 'PCAR', 'CPRT', 'NXPI', 'PAYX', 'AEP',
// 'LULU', 'ROST', 'CHTR', 'AXON', 'DDOG', 'FANG', 'MNST', 'NDAQ', 'HOOD', 'TCOM', 'BKR', 'KDP', 'FAST', 'CTSH', 'VRSK', 'GEHC', 'EXC', 'ARGX', 'ODFL', 'XEL', 'CCEP', 'KHC', 'UAL', 'ALNY', 'ACGL',
// 'IDXX', 'DXCM', 'TTWO', 'WTW', 'BIDU', 'EBAY', 'EA', 'CSGP', 'MPWR', 'ZS', 'FER', 'FCNCA', 'ANSS', 'FITB', 'MCHP', 'BNTX', 'TW', 'LPLA', 'ZM', 'CDW', 'WBD', 'TROW', 'RYAAY', 'TPG', 'NTAP',
// 'HBAN', 'LI', 'ERIC', 'FWONA', 'FWONK', 'CHKP', 'EXE', 'NTRA', 'PTC', 'FOXA', 'GFS', 'FOX', 'WDC', 'ON', 'NTR', 'EXPE', 'VOD', 'CINF', 'SBAC', 'ILMN', 'BIIB', 'ERIE', 'STX', 'VRSN', 'DKNG',
// 'WMG', 'ICLR', 'AZPN', 'ALGN', 'GEN', 'NWSA', 'HOLX', 'CYBR', 'FLEX', 'ALAB', 'OKTA', 'DUOL', 'DLTR', 'MRNA', 'UTHR', 'DPZ', 'NBIX', 'ENTG', 'SFM', 'CASY', 'LOGI', 'AKAM', 'ARCC', 'LNT', 'LINE',
// 'ZBRA', 'CG', 'SSNC', 'STLD', 'DOCU', 'PODD', 'ULTA', 'AFRM', 'ZG', 'Z', 'COO', 'PFG', 'GRAB', 'TER', 'KSPI', 'TRMB', 'NTNX', 'RPRX', 'FITBI', 'FSLR', 'SOFI', 'FFIV', 'JBHT', 'NWS', 'SMCI'];
}

let getsettradestockliststatus = 0;
const Gettradestocklist=(db_id)=>{
    console.log('TRY Gettradestocklist', db_id);
    // if(globalval.clientfetchtickerlist.length > 0)
    //     return null;
    if(getsettradestockliststatus != 0)
        return null;
    getsettradestockliststatus = 1;
    // const port = IsNaq(db_id) ? consts.NAQ_LIVE_PORT : consts.KOR_LIVE_PORT;
    const fetchport = IsNaq(db_id) ? consts.NAQ_LIVE_PORT : defulatConfig.fetchport;
    const fetchserverurl = defulatConfig.fetchurl;// consts.idcurl;//consts.IsSubFetchBoy(defulatConfig.port, defulatConfig.fetchboy) ? 'localhost' : consts.idcurl;
    return new Promise ((resolve, reject)=> axios.get(`http://${fetchserverurl}:${fetchport}/getstock?stockkinds=${defulatConfig.stockkinds}`).then(data=> {
        console.log (`res getstock from fetchboy ${data.data.length}`);
        getsettradestockliststatus = 0;
        globalval.clientfetchtickerlist = data.data;
        resolve(data);
    }));
}

const SetDBServerInfo=(where, querystatus, callback)=>
{
    query = `UPDATE maintenance SET status = '${querystatus}' WHERE NAME = '${where}'`;
    db_serverinfo((conn) => {
        conn.query(query, (err, data) => {
            conn.release();
            if(err)
                console.log(err);

            if(callback)
                callback()
        })
    });
    
}

const ValidStatus=(statusstr)=>{
    let validstatus = true;
    for (const statuschar of String(statusstr || ''))
    {
        //const statuschar = statusstr[idx];
        if(statuschar !== '0')
        {
            validstatus = false;
            break;
        }
            
    }
    return validstatus;
}

const ValidRightsRecentRows = (dailydatas, days) => {
    if(!days)
        return true;
    if(!dailydatas || dailydatas.length <= 1)
        return true;

    const sliced = dailydatas.slice(0, days);
    const closerate = 0.5;
    const sharerate = 0.2;
    const CheckRate = (prev, curr, rate) => {
        const before = Number(prev);
        const after = Number(curr);
        if(!Number.isFinite(before) || !Number.isFinite(after) || before === 0)
            return false;
        return Math.abs(after / before - 1) >= rate;
    }

    for (let i = 1; i < sliced.length; i++) {
        const newer = sliced[i - 1];
        const older = sliced[i];
        if (CheckRate(older.close, newer.close, closerate))
            return false;
        if (CheckRate(older.shares, newer.shares, sharerate))
            return false;
    }

    return true;
}

const ValidRightsBeforeTodayRows = (dailydatas, days, today) => {
    if(!days)
        return true;
    if(!dailydatas || dailydatas.length <= 1)
        return true;
    const beforeTodayRows = dailydatas.filter(row=>String(row.date) < String(today));
    return ValidRightsRecentRows(beforeTodayRows, days);
}

const FilterNotices=(dailydatas, days, curchartdataidx) => {
    //////////////////////////////////////////
    // 공시필터
    let notices = '';
    const daysof1years = days;
    const startIdx = Math.max(0, curchartdataidx - (daysof1years-1));
    const filtered = dailydatas
        .slice(startIdx, curchartdataidx + 1)  // 끝인덱스 기준 240개
        .filter(data => data.notices !== '0000000000');
    if(filtered && filtered.length > 0)
    {
        let tempnotices = '';
        filtered.forEach((filter)=>{
            tempnotices += filter.notices;
        })
        notices = tempnotices;
        // console.log(`${tempnotices}`);
    }
    //////////////////////////////////////////
    return notices;
}

const ValidRights = (dailydatas, days, curchartdataidx) => {
    if(!defulatConfig.validrightsdays)
        return true;
    // 1. 권리락/배당락 이벤트가 하나라도 있는지 체크 (item.rights가 '0'이 아니면 이벤트 발생)
    // const hasLockEvent = dailydatas.some(item => !/^0+$/.test(item.rights));
    // if (hasLockEvent) return false;

    const startIdx = Math.max(0, curchartdataidx - (days - 1));
    const sliced = dailydatas.slice(startIdx, curchartdataidx + 1);

    const closerate = 0.5;
    const sharerate = 0.2;
    const CheckRate = (prev, curr, rate) => {
        const changeRate = Math.abs(curr / prev - 1);
        if (changeRate >= rate) return true;
        return false;
    }

    for (let i = 1; i < sliced.length; i++) {
        const title = `${sliced[i].name}(${sliced[i].code}) ${GetYMD(sliced[i - 1].datetime)}~${GetYMD(sliced[i].datetime)}`;
        if (CheckRate(sliced[i - 1].close, sliced[i].close, closerate)) {
            console.log(`${title} 종가 차이 ${closerate}% 이상`);
            return false;
        }
        if (CheckRate(sliced[i - 1].shares, sliced[i].shares, sharerate)) {
            console.log(`${title} 상장 주식수 차이 ${sharerate}% 이상`);
            return false;
        }
    }

    return true;
};


async function Opendaycheck(opendate, db_id)
{
    let openday = `${opendate.getFullYear()}-${(opendate.getMonth()+1).toString().padStart(2,0)}-${opendate.getDate().toString().padStart(2,0)}`; 
    let nation = dbidtonation(db_id);
    return new Promise((resolve, reject) => {
        axios.get(`http://${consts.flaskserver}/checkopenday?date=${openday}&nation=${nation}`).then(data=> {     
            resolve(data.data === 'True');
        }).catch((err) => {
            reject(err);
        });
    })
}

const CheckStocksDate=async(db_id, todayformat, opendayformat, stockaccounts, callback)=>{
    const nation = dbidtonation(db_id);
    const isNaq = IsNaq(db_id);
    const alltablename = `alltableupdating${dbidtoname(db_id)}`
    // opendayformat = '2025-01-17'
    console.log('CheckStocksDate 0.');//idcurl
    // let personstocklist = [];
    
    if(defulatConfig.usepersonstocklist || defulatConfig.usebreakoutstocklist)
    {
        await getReadySheetData();
        await getValueSheetData();

        if(defulatConfig.usepersonstocklist)
        {
            await getLastSheetData();
        }

        if(defulatConfig.usebreakoutstocklist)
        {
            await LoadBADB('make');
        }
    }

    axios.get(`http://${consts.flaskserver}/getbeforeopenday?date=${opendayformat}&nation=${nation}`).then(datadate=> {
        axios.get(`http://${consts.flaskserver}/getbeforeopendaynottoday?date=${opendayformat}&nation=${nation}`).then(datadatenottoday=> {
        let needupdatestocklists_d = [];
        let needupdatestocklists_m = [];
        let needupdatestocklists = [];
        let needdate = datadate.data.split(' ')[0];
        needdate = needdate.replaceAll('-','');

        let needdatenottoday = datadatenottoday.data.split(' ')[0];
        needdatenottoday = needdatenottoday.replaceAll('-','');
        let stockinterval;
        // const stocktable = IsNaq(db_id) ? 'nasstock_20250206' : 'kosstock_20250206';
        console.log('CheckStocksDate 1');
        db_serverinfo((conn)=>{
            db_topstocklistlog((connstocklog) => {
                connstocklog.query(GetFinalyQuery(db_id, needdate), (errtickers, datas) =>
                {
                    connstocklog.release();
                    datas = FilterSpecialTickers(datas);
                    // account
                    let realTradeLists = stockaccounts?stockaccounts.reduce(function(accum,current){ accum.push(`${current.toLowerCase()}`); return accum},[]):[];
                    let acclen = realTradeLists.length;
                    
                    let topstocklen = 0;
                    let balen = 0;
                    
                    if(defulatConfig.usetopstocklist)
                    {
                        datas = datas.reduce(function(accum,current){ accum.push(`${current.ticker.toLowerCase()}`); return accum},[]);  
                        datas = AddIndextickers(datas);                  
                        globalval.toptickerlist = datas;
                        topstocklen = datas.length;
                        realTradeLists = realTradeLists.concat(datas);
                    }

                    let googlelen = 0;
                    if(defulatConfig.usepersonstocklist)
                    {
                        googlelen = globalval.persontickerlist.length;
                        realTradeLists = realTradeLists.concat(globalval.persontickerlist);
                    }

                    if(defulatConfig.usebreakoutstocklist)
                    {
                        balen = globalval.breakouttickerlist.length;

                        // if(balen > 600)
                        // {
                        //     // 0번 인덱스부터 599번 인덱스까지 딱 600개만 남기고 자릅니다.
                        //     globalval.breakouttickerlist = globalval.breakouttickerlist.slice(0, 600);
                            
                        //     console.log(`[CUT] 티커가 너무 많아 600개로 제한했습니다. (기존: ${balen}개)`);
                        // }

                        realTradeLists = realTradeLists.concat(globalval.breakouttickerlist);
                        console.log(`CheckStocksDate.breakouttest1 ${realTradeLists.length} to ${globalval.breakouttickerlist.length}`);
                    }

                    realTradeLists = Array.from(new Set(realTradeLists.map((item) => item)));
                    const lenstr = `LEN:${realTradeLists.length} ACCLEN:${acclen} TOPLEN:${topstocklen}, GOOLEN:${googlelen}, BALEN:${balen}`;
                    console.log('CheckStocksDate 2', lenstr); 
                    realTradeLists.forEach((data,idx)=>{
                        const idxinfo = `${idx}/${realTradeLists.length-1}`
                        const marketfncd = GetMarket(db_id,'d');
                        const marketfncm = GetMarket(db_id,'m');
                        const dayticker = data;//data.ticker;
                        const getlastsql = `SELECT * FROM \`${dayticker}\` ORDER BY datetime DESC LIMIT 1`;
                        marketfncd((connd)=>{       
                            connd.query(getlastsql, (_err, datastock) => {
                                connd.release();
                                let tempdayticker = dayticker;

                                if(!_err)
                                    tempdayticker = datastock[0].code;
                                    
                                if(_err || ((datastock && datastock[0] && datastock[0].date < needdate) && !needupdatestocklists_d.includes(tempdayticker)))
                                {   
                                    ddate = (datastock && datastock[0]) ? datastock[0].date : 'x';
                                    statusstr = (datastock && datastock[0]) ? datastock[0].status : '';
                                    const dateinfo = `D:${ddate}/${needdate}`
                                    
                                    needupdatestocklists_d.push(tempdayticker);
                                    console.log('CheckStocksDate (D) 3-1 push', idxinfo, tempdayticker, dateinfo, 'needupdatestocklists_d.length:',needupdatestocklists_d.length); 
                                }
                                else
                                {
                                    ddate = (datastock && datastock[0]) ? datastock[0].date : 'x';
                                    const dateinfo = `D:${ddate}/${needdate}`
                                    // mdate = (mindatastock && mindatastock[0]) ? mindatastock[0].date : 'x';
                                    // const dateinfo = `D:${ddate}/${needdate} M:${mdate}/${needdatenottoday}`
                                    console.log('CheckStocksDate (D) 3-1 done', idxinfo, tempdayticker, dateinfo);
                                }
                                
                                const getlastsql = `SELECT * FROM \`${tempdayticker}\` ORDER BY datetime DESC LIMIT 1`;
                                const minticker = tempdayticker;
                                marketfncm((connm)=>{                                
                                    connm.query(getlastsql, (_mindataerr, mindatastock) => {
                                        connm.release();
                                        if(_mindataerr)
                                        {
                                            console.log(`${_mindataerr.message}`)
                                            // tickersplt = _mindataerr.message.split(' ');
                                            // tickersplt = tickersplt[2].split('.')[1];
                                            ticker = minticker;//tickersplt.replace("'", '');
                                        } else
                                        {
                                            if(mindatastock.length===0)
                                                ticker = minticker
                                            else
                                                ticker = mindatastock[0].code;
                                        }
                                        
                                        if(_mindataerr || (mindatastock && mindatastock[0] && mindatastock[0].date < needdatenottoday) && !needupdatestocklists_m.includes(ticker))
                                        {
                                            mdate = (mindatastock && mindatastock[0]) ? mindatastock[0].date : 'x';
                                            statusstr = (mindatastock && mindatastock[0]) ? mindatastock[0].status : '';
                                            const dateinfo = `M:${mdate}/${needdatenottoday}`

                                            
                                            needupdatestocklists_m.push(ticker);
                                            console.log('CheckStocksDate (m) 3-2 push', idxinfo, ticker, dateinfo, 'needupdatestocklists_m.length:',needupdatestocklists_m.length);

                                        }
                                        else
                                        {
                                            mdate = (mindatastock && mindatastock[0]) ? mindatastock[0].date : 'x';
                                            const dateinfo = `M:${mdate}/${needdatenottoday}`
                                            console.log('CheckStocksDate (m) 3-2 done', idxinfo, ticker, dateinfo);
                                        }
                                        if(realTradeLists.length-1 === idx)
                                        {
                                            // 20260127 아침 점검때 분봉 업데이트를 제거한다. 시간이 오래 걸리고 할 이유가 없다,
                                            // needupdatestocklists = needupdatestocklists_d.concat(needupdatestocklists_m);
                                            needupdatestocklists_m = [];
                                            needupdatestocklists = Array.from(new Set(needupdatestocklists.map((item) => item)));
                                            console.log(`CheckStocksDateLength-d : ${needupdatestocklists_d.length} / ${realTradeLists.length} ${needupdatestocklists_d}`);
                                            console.log(`CheckStocksDateLength-m : ${needupdatestocklists_m.length} / ${realTradeLists.length} ${needupdatestocklists_m}`);
                                            
                                            if(needupdatestocklists_d.length > 0 || needupdatestocklists_m.length > 0)
                                            {                        
                                                if(isNaq)
                                                {
                                                    SetDBServerInfo('alltableupdatingnaq', 'none', ()=>{
                                                        SetDBServerInfo('alltableupdatingnaqday', 'none', ()=>{
                                                            stocklistup_starttime = (new Date()).getTime();
                                                            telegramapi.SetPrevMSG(db_id);

                                                            let startlog = GetStartMessage(nation, 'CheckStockDate');
                                                            console.log(startlog);
                                                            telegramapi.SendMessage(startlog);                                    
                                                            let updatestate = ''
                                                            
                                                            pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'yahoo_nas_day_alltime', 'yahoo_nas_day_alltime_plural', needupdatestocklists_d, 0, 0, 0, (result)=>{    
                                                            });
                                                            if(stockinterval)
                                                                return;
                                                            stockinterval = setInterval(() => {
                                                            query = `SELECT status FROM maintenance WHERE NAME = 'alltableupdatingnaq'`
                                                            conn.query(query, (err1, dataalltableupdatingnaq) => {
                                                                if(!err1 && dataalltableupdatingnaq) 
                                                                {
                                                                    query = `SELECT status FROM maintenance WHERE NAME = 'alltableupdatingnaqday'`
                                                                    conn.query(query, (err2, dataalltableupdatingnaqday) => {
                                                                        if(!err2 && dataalltableupdatingnaqday) 
                                                                        {
                                                                            if(dataalltableupdatingnaqday[0].status.includes('complete'))
                                                                            {
                                                                                SetDBServerInfo('alltableupdatingnaqday', 'updating-none_comp');
                                                                                let startlog = GetStartMessage(nation,'CheckStockDate');
                                                                                let completelog = GetCompleteMessage(nation, 'CheckStockDate(D)', stocklistup_starttime);
                                                                                console.log(completelog);
                                                                                telegramapi.EditMessageText(startlog, completelog);

                                                                                pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'nasminutestock_oldinfo_collect', 'nasminutestock_oldinfo_collect_plural', needupdatestocklists_m, 0, 0, 0, ()=>{                
                                                                            
                                                                                });
                                                                            }
                                                                            if(dataalltableupdatingnaq[0].status.includes('complete'))
                                                                            {
                                                                                SetDBServerInfo('alltableupdatingnaq', 'updating-none_comp');
                                                                                let startlog = GetStartMessage(nation,'CheckStockDate');
                                                                                let completelog = GetCompleteMessage(nation, 'CheckStockDate(M)', stocklistup_starttime);
                                                                                console.log(completelog);
                                                                                telegramapi.EditMessageText(startlog, completelog);

                                                                                clearInterval(stockinterval);           
                                                                                conn.release();                                             
                                                                                callback('COMPLETE CheckStocksDate');
                                                                            }
                                                                            
                                                                            if(!dataalltableupdatingnaqday[0].status.includes('none_comp')){
                                                                                let startlog = GetStartMessage(nation,'CheckStockDate');
                                                                                let updatelog = GetUpdateMessage(nation,'CheckStockDate',`d-${dataalltableupdatingnaqday[0].status}% count:${needupdatestocklists_d.length}`, stocklistup_starttime);
                                                                                console.log(updatelog);
                                                                                telegramapi.EditMessageText(startlog, updatelog);                                                                
                                                                            }
                                                                            else if(!dataalltableupdatingnaq[0].status.includes('none_comp')){
                                                                                let startlog = GetStartMessage(nation,'CheckStockDate');
                                                                                let updatelog = GetUpdateMessage(nation,'CheckStockDate',`m-${dataalltableupdatingnaq[0].status}% count:${needupdatestocklists_m.length}`, stocklistup_starttime);
                                                                                console.log(updatelog);
                                                                                telegramapi.EditMessageText(startlog, updatelog);                                                                
                                                                            }
                                                                        }
                                                                    })
                                                                }
                                                            })
                                                            }, 2000);     
                                                        });
                                                    });
                                                }
                                                else // iskor
                                                {
                                                    SetRedisPlural(needupdatestocklists_d,needupdatestocklists_m);
                                            
                                                    // main fetchserver만 
                                                    SetDBServerInfo(`${alltablename}`, 'none', ()=>{
                                                        stocklistup_starttime = (new Date()).getTime();
                                                        telegramapi.SetPrevMSG(db_id);

                                                        let startlog = GetStartMessage(nation, 'CheckStockDate');
                                                        console.log(startlog);
                                                        telegramapi.SendMessage(startlog);                                    
                                                        
                                                        let stocktimeout;
                                                        let stockinterval;
                                                        let updatestate = ''
                                                        pyutil.resetcreon(db_id,()=>{
                                                            if(stocktimeout)
                                                                return;
                                                            stocktimeout = setTimeout(() => {
                                                                pyutil.stock_oldinfo_collect_plural(db_id, needupdatestocklists_d, 'd', (result)=>{
                                                                    if(stockinterval)
                                                                        return;
                                                                    stockinterval = setInterval(() => {
                                                                        query = `SELECT status FROM maintenance WHERE NAME = '${alltablename}'`
                                                                        conn.query(query, (err, dataserverinfo) => {
                                                                            if(!err) {
                                                                                // console.log(dataserverinfo[0].status);
                                                                                statuslist = dataserverinfo[0].status.split('-');
                                                                                if(statuslist.length > 1)
                                                                                {
                                                                                    const statusgb = statuslist[0]
                                                                                    const statuspercent = statuslist[1];                                                        

                                                                                    if(statuspercent==='complete_d' && updatestate !== 'complete_d') // daily update end
                                                                                    {
                                                                                        updatestate = statuspercent;
                                                                                        pyutil.stock_oldinfo_collect_plural(db_id, needupdatestocklists_m, 'm', (result)=>{

                                                                                        });
                                                                                    }
                                                                                    else if(statuspercent==='complete_m' && updatestate !== 'complete_m') // minute update end
                                                                                    {
                                                                                        updatestate = statuspercent;
                                                                                        SetDBServerInfo(`${alltablename}`, 'updating-none_comp');
                                                                                        
                                                                                        let startlog = GetStartMessage(nation,'CheckStockDate');
                                                                                        let completelog = GetCompleteMessage(nation, 'CheckStockDate', stocklistup_starttime);
                                                                                        console.log(completelog);
                                                                                        telegramapi.EditMessageText(startlog, completelog);

                                                                                        clearInterval(stockinterval);
                                                                                        conn.release();
                                                                                        callback('COMPLETE CheckStocksDate');                                           
                                                                                    }
                                                                                    else if (statuspercent!=='none_comp')
                                                                                    {
                                                                                        let startlog = GetStartMessage(nation,'CheckStockDate');
                                                                                        let updatelog = GetUpdateMessage(nation,'CheckStockDate',`${statusgb}-${statuspercent}% (${needupdatestocklists.length})`, stocklistup_starttime);
                                                                                        console.log(updatelog);
                                                                                        telegramapi.EditMessageText(startlog, updatelog);                                                                
                                                                                    }
                                                                                }
                                                                            }
                                                                        })
                                                                    }, 5000);
                                                                });
                                                            }, 1000 * 60);
                                                        })
                                                    });
                                                }
                                            }
                                            else{
                                                callback('COMPLETE CheckStocksDate');                                            
                                            }
                                        }
                                        // else
                                        // {
                                        //     console.log('CheckStocksDate 3-3', 'idx:', idx, 'len:', realTradeLists.length-1 )
                                        // }
                                    })
                                })
                            })
                        })
                    })
                })
            });
        })
    });
    
    })
}

//////////////////////////////////////////// OLDSTOCK 부품 /////////////////////////////////////////////////////////////////////////////////////////////////
const GetOldStock=(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate)=>{
    updateCybosdata = (servicetype === "LIVE" && (maintenance === 'false' || maintenance === false));
    const veryoldday = '20220101';
    dbquery = oneday ? `SELECT * FROM \`${ticker}\` WHERE date=${todayformat} ${gb==='m' ? 'AND time>0900 AND time<1600' : ''}` : `SELECT * FROM \`${ticker}\`  WHERE date > ${veryoldday}`;
    
    if(defulatConfig.usememcached && gb==='m')
    {
        const memcachedkey = `${todayformat.slice(2)}${ticker}`;
        GetMemcachedData(memcachedkey, (data)=>{
            if(data)
            {
                let curtime = "09:00"; // 시간 문자열 (59분일 경우를 테스트)
                let curdate = new Date(`1970-01-01T${curtime}:00`);

                mindata = data.reduce(function(accu,curr) {
                    // 1분 더하기
                    const curminute = curdate.toTimeString().slice(0, 5).replace(':',''); // "HH:MM" 형식
                    curdate.setMinutes(curdate.getMinutes() + 1);
                    // console.log(curminute); // 결과 출력 (1000)

                    if(curr === '') 
                        accu.push({'close':null, 'code':ticker, 'time':curminute});
                    else
                        accu.push({'close':parseFloat(curr), 'code':ticker, 'time':curminute});
                    return accu;
                }, []);
                CallStock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, mindata);
            }
            else
                callback(null);
        });
    }
    else
    {
        const marketfnc = GetMarket(db_id, gb);
        marketfnc((conn)=>{
            conn.query(dbquery, (err, data) => {
                const datasize = sizeof(data)
                conn.release();
                if(!err) {                
                    if(data.length <= 0)
                    {
                        callback(null);
                        return;
                    }                    

                    if(!ticker)
                    {
                        console.log(`oldstocks db error: ticker is ${ticker}`);
                    }
                    CallStock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, data);
                }
                else
                {
                    if(config.useErrorLog)
                        console.log(`req error: ${ticker} ${err} dbquery : ${dbquery}`);

                    CallStock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, data)
                }            
            });
        })  
    }
}   

const SendMessageOldstock=(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, mindatas)=>{
    if (!mindatas) {
        callback('err');
        mindatas = []
    }
    else
    {
        // console.log(`stockend12 :${new Date().getSeconds()}`)
        //stockQuery = `SELECT * FROM \`${ticker}\` WHERE date<=${todayformat} AND date>=${reqindexdata ? startdate.replaceAll('-','').split(' ')[0] : mindatas[0].date}`;
        //MarketChange(GetMarketname(market, gb));
        if(gb === 'm' && oneday)
        {                    
            //stockQuery = `SELECT * FROM \`${ticker}\` WHERE date=${todayformat}`;// AND time>0900 AND time<0400
            callback({ products : mindatas, ticker : mindatas[0].code.toLowerCase(), stockname : mindatas[0].name });
            mindatas = []
        }
        else
        {
            //const marketfnc = GetMarket(db_id, 'd');
            //marketfnc((conn)=>{
            //    conn.query(stockQuery, (err2, datas) => {
                    err2 = 'error'
                    datas = mindatas
                    //conn.release();
                    //if(!err2) {
                    if(datas) {
                        dailydata = datas[0];
                        let productdatas = [];
                        // 가장 시간이 오래걸리는 로직인데, volume을 안쓰는듯하여 주석처리.
                        if(gb==='d')
                        {   
                            // case1. use hourdata                             
                            productdatas = datas;
                            productdatas.forEach(data=>{                            
                                data.macdlongshort = '';                          
                            })
                        }
                        else
                        {
                            productdatas = datas
                        }
                        callback({ products : productdatas, ticker : dailydata.code.toLowerCase(), market:dailydata.market, stockname : dailydata.name });
                        mindatas = []
                    }
                    else {                            
                        callback(err2);
                        mindatas = []
                    }
                //})
            //})
        }
        
    }             
    

    // selectQuery = `SELECT * FROM ${ticker} WHERE date<=${todayformat} LIMIT 1`;
    // GetMarket(market, 'm').query(`${selectQuery}`, (err1, firstdata) => {
    //     if (err1) {
    //         callback(err1);
    //     }
    //     else
    //     {
    //         // console.log(`stockend12 :${new Date().getSeconds()}`)
    //         stockQuery = `SELECT * FROM ${ticker} WHERE date<=${todayformat} AND date>=${reqindexdata ? startdate.replaceAll('-','').split(' ')[0] : firstdata[0].date}`;
            
    //         MarketChange(GetMarketname(market, gb));
    //         if(gb === 'm' && oneday)
    //         {                    
    //             stockQuery = `SELECT * FROM ${ticker} WHERE date=${todayformat}`;// AND time>0900 AND time<0400
    //         }

    //         // SELECT * FROM a000100 WHERE date=20241230 ORDER BY time LIMIT 1 // open
    //         // SELECT * FROM a000100 WHERE date=20241230 ORDER BY time desc LIMIT 1 // close
    //         // SELECT * FROM a000100 WHERE date=20241230 ORDER BY high desc LIMIT 1 // high
    //         // SELECT * FROM a000100 WHERE date=20241230 ORDER BY low  LIMIT 1 // low
    //         db.query(stockQuery, (err2, datas) => {
    //             if(!err2) {
    //                 // console.log(`stockend14 :${new Date().getSeconds()}`)
    //                 dailydata = datas[0];
    //                 let productdatas = [];
    //                 // 가장 시간이 오래걸리는 로직인데, volume을 안쓰는듯하여 주석처리.
    //                 if(gb==='d')
    //                 {   
    //                     // case1. use hourdata                             
    //                     productdatas = datas;

    //                     // case2. use minutesdata
    //                     // let curdate = '';
    //                     // let open;
    //                     // let high;
    //                     // let close;
    //                     // let low;
    //                     // let code;
    //                     // let name;
    //                     // let dividends;
    //                     // let datetime;
    //                     // let splits;
    //                     // let time;
    //                     // let value;
                        
    //                     // for(let i = 0; i < datas.length; ++i)
    //                     // {
    //                     //     let product = datas[i];
    //                     //     let productnxt = i+1 <= datas.length ? datas[i+1] : null;

    //                     //     // day first data
    //                     //     if(curdate !== product.date)
    //                     //     {
    //                     //         curdate = product.date;
                                
    //                     //         date = curdate;
    //                     //         dividends = 0;
    //                     //         datetime = product.datetime;
    //                     //         code = product.code;
    //                     //         name = product.name;
    //                     //         splits = product.splits;
    //                     //         time = product.time;
    //                     //         value = product.value;
    //                     //         open = product.open;
    //                     //         high = product.high;
    //                     //         close = product.close;
    //                     //         low = product.low;
    //                     //     }
    //                     //     // day not first data
    //                     //     else{
    //                     //         high = Math.max(high, product.high);
    //                     //         low = Math.min(low, product.low);
                                
    //                     //         // day last data
    //                     //         if(!productnxt || productnxt.date !== curdate)
    //                     //         {
    //                     //             productdatas.push({
    //                     //                 date:date,
    //                     //                 dividends:dividends,
    //                     //                 datetime:datetime,
    //                     //                 code:code,
    //                     //                 name:name,
    //                     //                 splits:splits,
    //                     //                 time:time,
    //                     //                 value:value,
    //                     //                 open:open,
    //                     //                 high:high,
    //                     //                 close:close,
    //                     //                 low:low,
    //                     //             });
    //                     //         }
    //                     //     }                                   
    //                     // }


    //                     productdatas.forEach(data=>{                            
    //                         data.macdlongshort = '';
    //                         // dayminutedatas = mindatas.filter(mindata=>data.date===mindata.date);
    //                         // if(dayminutedatas.length > 0)
    //                         //     data.value = Sum(dayminutedatas.reduce(function(accum,cur){accum.push(cur.value); return accum},[]));
    //                         // else
    //                         //     data.value = -1;                                
    //                     })                            
                     
    //                 }
    //                 else
    //                 {
    //                     productdatas = datas
    //                 }
    //                 //console.log(`stockend16 :${new Date().getSeconds()}`)
    //                 callback({ products : productdatas, ticker : dailydata.code, stockname : dailydata.name });
    //             }
    //             else {                            
    //                 callback(err2);
    //             }
    //         })
    //     }             
    // })
}

const CallStock=async(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, mindatas)=>{
    if(updateCybosdata)
    {            
        // const nation = dbidtonation(db_id);
        // const marketfnc = GetMarket(db_id, 'd');
        // marketfnc((conn)=>{
        //     getlastsql = oneday ? `SELECT * FROM \`${ticker}\` WHERE date=${todayformat} ORDER BY datetime DESC LIMIT 1` : `SELECT * FROM \`${ticker}\` ORDER BY datetime DESC LIMIT 1`;
        //     conn.query(getlastsql, (_err, data) => {
        //         conn.release();
        //         SendMessageOldstock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, mindatas);       
        //     });
        // })              
        SendMessageOldstock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, mindatas);
    }
    else {
        SendMessageOldstock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate, mindatas);
    }
}

const Oldstocks=(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate) => {
    // tickercomplete = [];
    MarketChange(GetMarketname(market, gb));
    GetOldStock(db_id, ticker, market, gb, servicetype, maintenance, todayformat, opendayformat, callback, oneday, reqindexdata, startdate);
}
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const Get_my_complete=(db_id, odno, sell_buy_dvsn, macdlongshort, Callback)=>{
    pyutil.get_my_complete(db_id, odno, sell_buy_dvsn, macdlongshort, (result)=>{
        Callback(result);
        //res.send(`get_my_complete ${result}`)
    })
}

function Issue_access_token(db_id,usemok,callback)
{
    console.log('req issue_access_token');
    query = `SELECT status FROM maintenance WHERE NAME = 'gethantutoken'`    
    db_serverinfo((conn) => {
        conn.query(query, (err, data) => {
            conn.release();
            if(!err && data && data[0] && data[0].status === 'true') {
                if(usemok)
                {
                    db_id_replace = db_id.replace('real', 'mok');
                }
                else{
                    db_id_replace = db_id.replace('mok', 'real');
                }

                pyutil.issue_access_token(db_id_replace,()=>{
                    console.log(`res issue_access_token ${usemok?'[MOK]':'[REAL]'}`);
                    if(callback)
                        callback();
                });
            }
            else
            {
                console.log(`no use gethantutoken. if you want add db gethantutoken true`);
            }
        })
    });        
        
}



module.exports = {
    Market_sell_order, Market_buy_order, Market_cancel_order, Getaccount, Fetch_price, Oldstocks, Get_my_complete, Issue_access_token, 
    Topstocklist, LoadBADB, TopstocklistBA, CheckStocksDate, Gettradestocklist, GetaccountGeneral, GetsnapshotaccountGeneral, GetIndexdatas,
    LoadStockTableList, LoadAllTickers, LoadTickerNames, ShowTradeLog, Opendaycheck ,SetRedisPlural, ValidRights, FilterNotices,
}
