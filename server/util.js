
const db_stocklist = require('./config/db_stocklist')
const db_stocklistdayall = require('./config/db_stocklistdayall')
const db_nasstocklist = require('./config/db_nasstocklist')
const db_minute_nasstocklist = require('./config/db_minute_nasstocklist')
const globalval = require('./globalval');
const moment = require('moment');
const {idcurl} = require('./consts')
require('moment-timezone');
const os = require('os');
const fs = require('fs');
require('dotenv').config(); // ?먮뒗 import 'dotenv/config' (ESM)

const mokstr = JSON.parse(process.env.ismock)  ? 'mok' : 'real';
const defaultid = process.env.defaultid;
// console.log('Loaded ISMOCK:', process.env.ismock, mokstr); // ?붾쾭源?

const networkInterfaces = os.networkInterfaces();
const ip = networkInterfaces.NIC1 && networkInterfaces.NIC1[1] ? networkInterfaces.NIC1[1].address : networkInterfaces['Wi-Fi'] && networkInterfaces['Wi-Fi'][1] ? networkInterfaces['Wi-Fi'][1].address : 
networkInterfaces['Wi-Fi 5'] &&  networkInterfaces['Wi-Fi 5'][1] ? networkInterfaces['Wi-Fi 5'][1].address : '0.0.0.0';
const fetchdelay = 50; // 1遺꾩뿉 20媛??덉슜?섏?留?踰꾪띁濡?2諛??뺣룄 ?먯뒯?섍쾶 蹂대궦??
const defulatConfig = {
    db_id : process.env.DB_ID ? process.env.DB_ID : `${defaultid}_${mokstr}_kor`, // srhsha_${mokstr}_kor, srhsha_${mokstr}_naq, 
    port : process.env.PORT ? process.env.PORT : '4100', // 4100, 4200, 4017
    maintenanceport : process.env.maintenanceport ? process.env.maintenanceport :4500,
    envself : process.env.SELF_TRADE ? process.env.SELF_TRADE : 'SELF', // 'TEST_KOR', 'TEST_NAQ'
    isredismaintenance : JSON.parse(process.env.isredismaintenance ? process.env.isredismaintenance : false),
    
    FilterDays : Number(process.env.filter_days ? process.env.filter_days : 1),
    FilterPercent : Number(process.env.filter_percent ? process.env.filter_percent : 40),
    initmoney : Number(process.env.initmoney ? process.env.initmoney : 10000000),
    initmoney_naq : Number(process.env.initmoneynaq ? process.env.initmoneynaq : 10000),
    sellcharge : Number(process.env.sellcharge ? process.env.sellcharge : 0.19), //0.19, // test    
    buycharge : Number(process.env.buycharge ? process.env.buycharge : 0.01),
    simlatesellcharge : Number(process.env.simlatesellcharge ? process.env.simlatesellcharge : 0.0), //0.19, // test    
    simlatebuycharge : Number(process.env.simlatebuycharge ? process.env.simlatebuycharge : 0.0),
    useRecyc : JSON.parse(process.env.useRecyc ? process.env.useRecyc : true),
    useRecycRSI : JSON.parse(process.env.useRecycRSI ? process.env.useRecycRSI : false),
    useassetuprecyclegate : JSON.parse(process.env.useassetuprecyclegate ? process.env.useassetuprecyclegate : true),
    useassetupbuygate : JSON.parse(process.env.useassetupbuygate ? process.env.useassetupbuygate : false),
    useassetupsellcashgate : JSON.parse(process.env.useassetupsellcashgate ? process.env.useassetupsellcashgate : false),
    assetupsellcashcarrymode : process.env.assetupsellcashcarrymode ? process.env.assetupsellcashcarrymode : '',
    divsellpercent: Number(process.env.divsellpercent ? process.env.divsellpercent : -4),
    
    startdelay : Number(process.env.startdelay ? process.env.startdelay : 2000),
    useBuyToGooTimeRSI : JSON.parse(process.env.useBuyToGooTimeRSI ? process.env.useBuyToGooTimeRSI : true),
    notToBuyPercentRsiUnder : Number(process.env.notToBuyPercentRsiUnder ? process.env.notToBuyPercentRsiUnder : 2.0), // NOUSE : 0
    notToBuyPercentRsiOver : Number(process.env.notToBuyPercentRsiOver ? process.env.notToBuyPercentRsiOver : 100.0),   // NOUSE : 100
    ToSellPercentRsiOver : Number(process.env.ToSellPercentRsiOver ? process.env.ToSellPercentRsiOver : -3.0),   // NOUSE : 100
    ismock : JSON.parse(process.env.ismock ? process.env.ismock : true),
    fetchdb : process.env.fetchdb ? process.env.fetchdb : 'redis',
    fetchboy : process.env.fetchboy ? process.env.fetchboy : '',
    tradeboy : process.env.tradeboy ? process.env.tradeboy : 'tradeboy',
    
    autosimulation : process.env.simmulationfunc ? process.env.simmulationfunc === "dailysimulation" ? true : false : false,
    simulationstartdate : process.env.simulationstartdate ? new Date(`${process.env.simulationstartdate}`) : new Date(`${'2022-10-26'}`),//new Date(`${'2025-02-05'}`),//
    simulationenddate : process.env.simulationenddate ? new Date(`${process.env.simulationenddate}`) : new Date(`${'2026-05-29'}`),
    simulationoneday : JSON.parse(process.env.simulationoneday ? process.env.simulationoneday : false),
    useconsolelog : JSON.parse(process.env.useconsolelog ? process.env.useconsolelog : false),
    usememcached : JSON.parse(process.env.usememcached ? process.env.usememcached : false),
    useerrorminuteclosefilter : JSON.parse(process.env.useerrorminuteclosefilter ? process.env.useerrorminuteclosefilter : false),
    usepartialentry : process.env.usepartialentry ? process.env.usepartialentry : '',
    divminpercent : Number(process.env.divminpercent ? process.env.divminpercent : 0.45),
    percentByoneBuy : Number(process.env.percentByoneBuy ? process.env.percentByoneBuy : 10),
    rsishortRelativeWithYesterday : JSON.parse(process.env.rsishortRelativeWithYesterday ? process.env.rsishortRelativeWithYesterday : true), 
    
    rsilow : Number(process.env.rsilow ? process.env.rsilow : 30),
    rsihigh : Number(process.env.rsihigh ? process.env.rsihigh : 70),

    useLowPriceSell : JSON.parse(process.env.useLowPriceSell ? process.env.useLowPriceSell : false),
    lowPriceSellPercent : Number(process.env.lowPriceSellPercent ? process.env.lowPriceSellPercent : -100),
    highPriceSellPercent : Number(process.env.highPriceSellPercent ? process.env.highPriceSellPercent : 100),
    topstocklistcount : Number(process.env.topstocklistcount ? process.env.topstocklistcount : 150),
    // market1toplistcount : Number(process.env.market1toplistcount ? process.env.market1toplistcount : 75),
    // market2toplistcount : Number(process.env.market2toplistcount ? process.env.market2toplistcount : 75),
    
    uselatetrade : JSON.parse(process.env.uselatetrade ? process.env.uselatetrade : false),
    buyonlyupward : JSON.parse(process.env.buyonlyupward ? process.env.buyonlyupward : false),
    sellonlydownward : JSON.parse(process.env.sellonlydownward ? process.env.sellonlydownward : false),
    usefirstbuytriedclose : JSON.parse(process.env.usefirstbuytriedclose ? process.env.usefirstbuytriedclose : true),
    userefundafterlock : JSON.parse(process.env.userefundafterlock ? process.env.userefundafterlock : true),
    lockbuy : JSON.parse(process.env.lockbuy ? process.env.lockbuy : false), // 移섎챸???ㅻ쪟 諛쒓껄. buy???쇱떆以묐떒?쒕떎.
    locksell : JSON.parse(process.env.locksell ? process.env.locksell : false), // 移섎챸???ㅻ쪟 諛쒓껄. buy???쇱떆以묐떒?쒕떎.
    
    useRefundsLong : JSON.parse(process.env.useRefundsLong ? process.env.useRefundsLong : false),
    useRefundsShort : JSON.parse(process.env.useRefundsShort ? process.env.useRefundsShort : false),
    
    tradeOnlyCloseTime : JSON.parse(process.env.tradeOnlyCloseTime ? process.env.tradeOnlyCloseTime : false),
    usePriceTrend : JSON.parse(process.env.usePriceTrend ? process.env.usePriceTrend : false),
    
    longbymacd :  JSON.parse(process.env.longbymacd ? process.env.longbymacd : false),
    longbyrsi :  JSON.parse(process.env.longbyrsi ? process.env.longbyrsi : true),
    longbystoslow  : JSON.parse(process.env.longbystoslow ? process.env.longbystoslow : false),
    cacusto  : JSON.parse(process.env.cacusto ? process.env.cacusto : false),
    excludesimulonlyonestock: process.env.excludesimulonlyonestock ? process.env.excludesimulonlyonestock : "a025900,a058470",

    version : "20260529-1",
    useVirtualExcludeTest:false,

    kodex200: process.env.kodex200 ? process.env.kodex200 : 'u001',
    kodexdaq150: process.env.kodexdaq150 ? process.env.kodexdaq150 : 'u201',
    snp500: process.env.snp500 ? process.env.snp500 : 'SPY',
    naq100: process.env.naq100 ? process.env.naq100 : 'QQQ',
    useMacdUnderRsiShortCross: JSON.parse(process.env.useMacdUnderRsiShortCross ? process.env.useMacdUnderRsiShortCross : false),
    useMacdUnderRsiShortDown: JSON.parse(process.env.useMacdUnderRsiShortDown ? process.env.useMacdUnderRsiShortDown : false),
    
    usetopstocklist : JSON.parse(process.env.usetopstocklist ? process.env.usetopstocklist : true),
    usepersonstocklist : JSON.parse(process.env.usepersonstocklist ? process.env.usepersonstocklist : false),
    usebreakoutstocklist : JSON.parse(process.env.usebreakoutstocklist ? process.env.usebreakoutstocklist : false),
    usebreakouttrade : JSON.parse(process.env.usebreakoutstocklist ? process.env.usebreakoutstocklist : false),
    usepersonstocktrade : JSON.parse(process.env.usepersonstocktrade ? process.env.usepersonstocktrade : false),
    trylongcountlimit : Number(process.env.trylongcountlimit ? process.env.trylongcountlimit : 1), // ?쒖쥌紐??섎（ ?몃쾲源뚯? ??援щℓ媛??
    recselper : Number(process.env.recselper ? process.env.recselper : 50),
    isnxt:JSON.parse(process.env.isnxt ? process.env.isnxt : false),

    hardmaintenanceday : process.env.hardmaintenanceday ? process.env.hardmaintenanceday : 'saturday',
    nomaintenanceday : process.env.nomaintenanceday ? process.env.nomaintenanceday : 'sunday',
    maintenancehour : Number(process.env.maintenancehour ? process.env.maintenancehour : 16),
    maintenancehoursat : Number(process.env.maintenancehoursat ? process.env.maintenancehoursat : 1),
    maintenancehournaq : Number(process.env.maintenancehournaq ? process.env.maintenancehournaq : 19),
    maintenancehournaqsat : Number(process.env.maintenancehournaqsat ? process.env.maintenancehournaqsat : 12),
    fetchport : process.env.FETCHPORT ? process.env.FETCHPORT : '4100',
    fetchurl : process.env.fetchurl ? process.env.fetchurl : idcurl,
    stockkinds : process.env.stockkinds ? process.env.stockkinds : 'top', // ?ㅼ젣 ?낅뜲?댄듃 ?????
    uplimitper : Number(process.env.uplimitper ? process.env.uplimitper : 28),      // 28???댁긽 援щℓ
    dnlimitper : Number(process.env.dnlimitper ? process.env.dnlimitper : 10000),    // 29.5???댁긽 援щℓ ?덊븿 29.5
    useemarsi: JSON.parse(process.env.useemarsi ? process.env.useemarsi : false), // 吏??rsi ( kiwoom ) ?댁슜 ?щ?. 湲곕낯? false ( hantoo, samsung ) ?ъ슜
    shortRecWrongBought:JSON.parse(process.env.shortRecWrongBought ? process.env.shortRecWrongBought : false),
    usersi_5_10_nobuy:JSON.parse(process.env.usersi_5_10_nobuy ? process.env.usersi_5_10_nobuy : false),
    usefilterdissolvestock:JSON.parse(process.env.usefilterdissolvestock ? process.env.usefilterdissolvestock : false),
    limitfilter: Number(process.env.limitfilter ? process.env.limitfilter : 2),
    maxonebuymoney_kor:10000000000,//10000000, // 10000000
    maxonebuymoney_naq:10000,
    fetchboylist:"fetchboy,fetchboygc", // simulonlyonestock
    loworderprocessCount:Number(process.env.loworderprocessCount ? process.env.loworderprocessCount : 50),
    sortmarketcap:false,
    usersivolumefilter:false,

    usetemptopstocklistlog : process.env.usetemptopstocklistlog ? process.env.usetemptopstocklistlog : '',
    topstocklistmix: JSON.parse(process.env.topstocklistmix ? process.env.topstocklistmix : false),             // 留덉폆?좏깉 ?묒뒪??戮묎린. 
    filtertickersdivden : JSON.parse(process.env.filtertickersdivden ? process.env.filtertickersdivden : false),         // ?곗꽑二??쒖쇅
    filtertickersetf : JSON.parse(process.env.filtertickersetf ? process.env.filtertickersetf : false),           // etf ?쒖쇅
    filtertickersetc : JSON.parse(process.env.filtertickersetc ? process.env.filtertickersetc : false),            // 以묎컙???곸뼱?ㅼ뼱媛?醫낅ぉ ?쒖쇅
    validrightsdays: process.env.validrightsdays ? Number(process.env.validrightsdays) : null, // 沅뚮━ 愿??理쒓렐蹂??30?닿린蹂멸컪. ?덉벝嫄곕㈃ config??吏?뚯빞??
    usecandidatevalidrightsfilter: JSON.parse(process.env.usecandidatevalidrightsfilter ? process.env.usecandidatevalidrightsfilter : false),
    useholdrightspriceadjust: JSON.parse(process.env.useholdrightspriceadjust ? process.env.useholdrightspriceadjust : false),
    usecrashreboundsellhold: JSON.parse(process.env.usecrashreboundsellhold ? process.env.usecrashreboundsellhold : false),
    crashreboundsellholdmode: process.env.crashreboundsellholdmode ? process.env.crashreboundsellholdmode : '',
    crashrebounddownthreshold: Number(process.env.crashrebounddownthreshold ? process.env.crashrebounddownthreshold : -10),
    topstockselfreturnfilterdays: process.env.topstockselfreturnfilterdays ? process.env.topstockselfreturnfilterdays.split(',').map(Number).filter(Number.isFinite) : [],
    topstockselfreturnfiltermode: process.env.topstockselfreturnfiltermode || 'positive',
    useforcekorbuy : JSON.parse(process.env.useforcekorbuy ? process.env.useforcekorbuy : true),

    // // srhsha_real_kor rsi?쇱씠釉??ㅼ쟾
    // db_id : 'srhsha_real_kor',
    // port : 4100,
    // ismock : false,
    // isnxt : false,
    // usepersonstocktrade:false,
    // usepersonstocklist:false,
    // //// fetchport : 4100,
    // //// fetchurl : '192.168.219.102',
    // usetopstocklist : true,
    // recselper : 50,
    // stockkinds : 'top', // 't
    // usesamebuyrate : false,
    // useRecyc: true,
    // topstocklistcount : 150,
    // useMacdUnderRsiShortDown : false,
    // topstocklistmix: false,
    // filtertickersdivden: false,
    // filtertickersetf: false,
    // filtertickersetc: false,
    // validrightsdays: null,

    // // // srhsha2_real_kor rsi?쇱씠釉뚰븯諛⑸갑???ㅼ쟾
    // db_id : `srhsha2_real_kor`,
    // port : 4101,
    // ismock : false,
    // isnxt : false,
    // usepersonstocktrade:false,
    // usepersonstocklist:false,
    // useBuyToGooTimeRSI: false,
    // //// fetchurl : '192.168.219.102',
    // //// fetchport : 4100,//4101,
    // usetopstocklist : true,
    // recselper : 50,
    // stockkinds : 'top', // 't
    // usesamebuyrate : true,
    // useRecyc: true,
    // topstocklistcount : 140,
    // useMacdUnderRsiShortDown : true,
    // topstocklistmix: false,
    // filtertickersdivden: false,
    // filtertickersetf: false,
    // filtertickersetc: false,
    // validrightsdays: 30,

    // // srhsha_mok_kor ?쇱씠釉뚰븯諛⑸갑??紐⑥쓽
    // db_id : `srhsha_mok_kor`,
    // port : 4105,
    // ismock : true,
    // isnxt : true,
    // usepersonstocktrade:false,
    // usepersonstocklist:false,
    // useBuyToGooTimeRSI: false,
    // //// fetchurl : '192.168.219.102',
    // //// fetchport : 4100,//4101,
    // usetopstocklist : true,
    // recselper : 50,
    // stockkinds : 'top', // 't
    // usesamebuyrate : true,
    // useRecyc: true,
    // topstocklistcount : 140,
    // useMacdUnderRsiShortDown : true,
    // topstocklistmix: false,
    // filtertickersdivden: false,
    // filtertickersetf: false,
    // filtertickersetc: false,
    // validrightsdays: 30,

    // // COLABO TRADE2 collabo real
    // db_id : `gigachu2_real_kor`,
    // port : 4103,
    // ismock:false,
    // isnxt : false,
    // usepersonstocktrade:true,
    // usepersonstocklist:true,
    // fetchurl : '192.168.219.102',
    // fetchport : 4105,//4101, 
    // usebreakouttrade:false,
    // usebreakoutstocklist:false,
    // usetopstocklist : false,
    // recselper : 100,
    // stockkinds : 'person', // 't
    // usesamebuyrate: true,
    // useRecyc: true,
    // //// topstocklistcount: 
    // //// useMacdUnderRsiShortDown : false,
    // //// topstocklistmix: false,
    // //// filtertickersdivden: false,
    // //// filtertickersetf: false,
    // //// filtertickersetc: false,
    // //// validrightsdays: null,

    // // COLABO TRADE2 collabo mok
    // db_id : `gigachu_mok_kor`,
    // port : 4104,
    // ismock: true,
    // isnxt : true,
    // usepersonstocktrade:true,
    // usepersonstocklist:true,
    // usebreakouttrade:false,
    // usebreakoutstocklist:false,
    // usetopstocklist : false,
    // fetchurl : '192.168.219.102',
    // fetchport : 4105,//4101, 
    // recselper : 100,
    // usesamebuyrate : false,
    // stockkinds : 'person', // 't
    // usesamebuyrate: true,
    // useRecyc: true,
    // //// topstocklistcount: 
    // //// useMacdUnderRsiShortDown : false,
    // //// topstocklistmix: false,
    // //// filtertickersdivden: false,
    // //// filtertickersetf: false,
    // //// filtertickersetc: false,
    // //// validrightsdays: null,
   

    // COLABO FETCH TEST
    // db_id : 'srhsha2_real_kor',//`fetchboygc_real_kor`,
    // port : 4071,
    // fetchboy : 'fetchboy',
    // tradeboy : '',
    // isnxt : true,
    // // fetchurl : '172.29.128.1',//'192.168.219.102',
    // // fetchport : 4071,
    // usetopstocklist : true,
    // usepersonstocklist : false,
    // usebreakoutstocklist : true,
    // stockkinds : 'top',

    ////////////////////////////
    // // // SIMTEST
    port:process.env.PORT ? Number(process.env.PORT) : 4091,//4017,
    usetrademarkrsi:JSON.parse(process.env.usetrademarkrsi ? process.env.usetrademarkrsi : true),
    usejijibujinsell:JSON.parse(process.env.usejijibujinsell ? process.env.usejijibujinsell : true),

    usedoublehalfallsell:false,
    useprofitgivebacksell:'base',
    useearlyprofitlocksell:process.env.useearlyprofitlocksell ? process.env.useearlyprofitlocksell : '',
    useearlyprofitlockcash:process.env.useearlyprofitlockcash ? process.env.useearlyprofitlockcash : '',
    usemarketstrengthbuyfilter:process.env.usemarketstrengthbuyfilter ? process.env.usemarketstrengthbuyfilter : '',
    usemarketstrengthexposurelimit:process.env.usemarketstrengthexposurelimit ? process.env.usemarketstrengthexposurelimit : '',
    useprofittolosssell:'',

    XX:false,
    usetodayssaksucut:false,
    ssaksucutrate:-2,
    usetrademark:false, // ?쒕떖?꾨?鍮?媛寃??곸듅??留덉폆蹂??곸쐞 100媛쒖뵫留?戮묐뒗??
    trademarkuprate:-100, // 0?대㈃ ?쒕떖?꾨?鍮??곸듅?쒓쾬, -100?대㈃ 議곌굔?놁씠 媛?닔?꾪꽣留?媛??
    trademarktopstocklistcount:Number(process.env.trademarktopstocklistcount ? process.env.trademarktopstocklistcount : 140),
    topstocklistcount:Number(process.env.topstocklistcount ? process.env.topstocklistcount : 140), // 100,150,200
    usefilternotices : null,
    validrightsdays: 30,
    usecandidatevalidrightsfilter: JSON.parse(process.env.usecandidatevalidrightsfilter ? process.env.usecandidatevalidrightsfilter : false),
    useholdrightspriceadjust: JSON.parse(process.env.useholdrightspriceadjust ? process.env.useholdrightspriceadjust : false),
    usecrashreboundsellhold: JSON.parse(process.env.usecrashreboundsellhold ? process.env.usecrashreboundsellhold : false),
    crashreboundsellholdmode: process.env.crashreboundsellholdmode ? process.env.crashreboundsellholdmode : '',
    crashrebounddownthreshold: Number(process.env.crashrebounddownthreshold ? process.env.crashrebounddownthreshold : -10),
    topstockselfreturnfilterdays: process.env.topstockselfreturnfilterdays ? process.env.topstockselfreturnfilterdays.split(',').map(Number).filter(Number.isFinite) : [],
    topstockselfreturnfiltermode: process.env.topstockselfreturnfiltermode || 'positive',
    percentByoneBuy:10,//15,20,
    simulonlyonestock:'',// "a068270,a000100,a035420,a001060,a005930,a241560,a026960,a010620,a007310,a069500",
    usesinglesimulation:JSON.parse(process.env.usesinglesimulation ? process.env.usesinglesimulation : false), // 醫낅ぉ?꾪꽣瑜??꾪븳 媛쒕퀎 ?쒕??덉씠??
    singlecandidatefile:process.env.singlecandidatefile ? process.env.singlecandidatefile : '',
    // simulationenddate:new Date(`${'2023-04-24'}`),
    startdelay: 2000,
    useemarsi:false,
    recselper:Number(process.env.recselper ? process.env.recselper : 50),//50, // ?ы솢???먮ℓ 鍮꾩쑉

    usesamebuyrate : true,
    usetemptopstocklistlog : '',
    filtertickersdivden : false,         // ?곗꽑二??쒖쇅
    filtertickersetf : false,           // etf ?쒖쇅
    filtertickersetc : false,            // 以묎컙???곸뼱?ㅼ뼱媛?醫낅ぉ ?쒖쇅
    topstocklistmix: false,             // 留덉폆?좏깉 ?묒뒪??戮묎린. 
    useBuyToGooTimeRSI : false,
    notToBuyPercentRsiUnder : 0,
    notToBuyPercentRsiOver : 100,// 3,
    ToSellPercentRsiOver: -3, // -3
    
    excludesimulonlyonestock:'',            // ?뚯뒪???ㅼ뿼?쒗궎??遺덈웾醫낅ぉ ?쒖쇅
    // simulationstartdate:process.env.simulationstartdate ? new Date(`${process.env.simulationstartdate}`) : new Date(`${'2026-05-12'}`),//2025-05-01//2022-10-26//new Date(`${'2025-06-25'}`),//new Date(`${'2022-10-26'}`),//new Date(`${'2025-10-01'}`),//
    
    trylongcountlimit:1,         // ?쒖쥌紐??섎（ 理쒕? 嫄곕옒?잛닔 ?쒗븳 : 臾댄븳類묐틧??諛⑹? 
    trylongonmoreclosetime:false,
    lowPriceSellPercent: -100,//-8,//-8,//-100,// // ?꾩쟾 ?먯젅
    
    
    usememcached:true,
    useerrorminuteclosefilter:process.env.useerrorminuteclosefilter ? JSON.parse(process.env.useerrorminuteclosefilter) : false,
    useRecyc:true,
    // recyselloverday:3,
    usesanpark:false,
    // usersibuyvolume:'yesterdayclose',
    
    
    useMacdUnderRsiShortCross:false,            // if macddown after buyday sell rsi cross 
    useMacdUnderRsiShortDownOnlyBuyDay:false,   // if macddown in buyday almostclosetime sell rsi down onlybuyday
    useMacdUnderRsiShortDown:true,             // if macddown in after buyday almostclosetime sell rsi down
    // rsimacddownseloverday:6, // 2硫????ㅻ떎?뚮궇遺???????덉쓬
    usepersonstocklist:false,
    sortmarketcap:false,
    
    minutetrade:false,
    usenewtopstockquery:false,
    usedayout:false,
    shortRecIndex:false,
    shortRecYesterday:false,
    shortRecWrongBought:false,
    

    awaitlog:false,
    buyandbuy:false,
    bnbdiv : 0.5,// 1, 0.5, 0.25, 0.1 
    
    simulationoneday:false,
    initmoney:50000000,

    
    useconsolelog:true,
    
    autosimulation:true,
    usefirstbuytriedclose:true,
    fetchboy: "x",
    tradeboy: "x",
    useconsolelog: true,
    simlatesellcharge : 0.01,    
    simlatebuycharge : 0.01,

    // simulonlyonestock: "",// // "a000100(?좏븳?묓뻾), a035420(NAVER), a001060(JW以묒쇅?쒖빟), a005930(?쇱꽦?꾩옄), a241560(?먯궛諛μ베), a026960(?숈꽌湲곗뾽), a010620(HD?꾨?誘명룷), a007310(?ㅻ슌湲?, a069500(KODEX200)"
    // percentByoneBuy:10,      // 10?대㈃ 1/10, 100?대㈃ 1/100 1?대㈃ 1/1. 蹂?섎뒗 遺꾨え媛 ?쒕떎 利?遺꾨え媛 ?묒쓣?섎줉 ?ъ궛??留롮씠 ?ъ슜
    lockbuy:false,
    useRefundsLong:false,
    useRefundsShort:false,
    
    tradeOnlyCloseTime:false,
    usePriceTrend:false,
    useVirtualExcludeTest:false,
    
    longbymacd : false,
    longbyrsi : true,
    longbystoslow : false,
    cacusto : false,
    ///////// SIM TEST END //////////


    // RSI SHORT TEST

    // port:4003,
    // usersishortcross:true,

    // // // BREAKOUT MAINTENANCE & TRADEBOY TEST///////
    // realtimebuystartday : false, // 泥ル궇遺??紐⑤뱺?쒓컙 留ㅻℓ. false?쇰㈃ 3?쇱감遺??紐⑤뱺?쒓컙 留ㅻℓ
    // usememcached:false,
    // maxonebuymoney_kor:5000000000,
    // usebreakouttrade:true,
    // usebreakoutstocklist:true,
    // usetopstocklist : false,
    // limitfilter:2,
    // fetchurl : '192.168.219.102',
    // fetchport : 4105,//4101, 
    // stockkinds : 'breakout', 
    // useRecyc:false, 
    // usebreakoutuponeper:3, // test up       
    // usebreakoutupper:3, // test default
    // fakedropsellskiplv:10, // ??珥덈컲 09:00~09:02 ????쑝濡??섎씫?섎㈃ ?깆뿉???덇구由щ뒗 ?μ쟾嫄곕옒 ?멸? 臾쇰웾. 留ㅻ룄?ㅽ궢???붾젅洹몃옩硫붿떆吏 ?섍퀬 媛寃?湲곕줉 ?덊븳??
    
    // // LIVE
    // port:4102,   // 釉뚯븘 ??같 ?쇱씠釉?
    // db_id : 'srhsha3_real_kor', 
    // ismock:false, //  mok:true live:false
    // isnxt : false, 
    // usebreakoutsafetyshort:false,
    // usebafreesmacondition : false,

    // MOK-1
    // port:4102, // 釉뚯븘 ??같 紐⑥쓽 
    // db_id : 'ybc_mok_kor',
    // ismock:true,  
    // isnxt : true,
    // usebreakoutsafetyshort:false, 
    // usebafreesmacondition : false,
    
    
    // // MOK2 - hongu ba improve safetyshort
    // port:4103, // 釉뚯븘 ??같 怨꾨떒?湲?
    // db_id : 'hongu_mok_kor',
    // ismock:true, //  mok:true live:false 
    // isnxt : true,
    // usebreakoutsafetyshort:true,
    // usebafreesmacondition : false,

    
    // SIM
    // port:4002,
    // db_id : 'gigachu_mok_kor',
    // ismock:true, //  mok:true live:false
    // usebreakoutsafetyshort:true,   // 怨꾨떒?湲?
    // isnxt : true,
    // usetomorrowvol :true,       // ba simul
    // usebadb : false,            // ba simul. ?쒕?? true媛 湲곕낯. ?닿구 ?댁빞 援녹씠 ?덈줈 ?덈쭔?좊떎. 
    // usebreakouttodaynosel:false, // test 
    // usebreakoutsequenceuplimit:false, // test
    // usebreakoutuponeper:3, // test up       
    // usebreakoutupper:3, // test default
    // simulationstartdate:new Date(`${'2022-10-26'}`),
    // simulationenddate:process.env.simulationenddate ? new Date(`${process.env.simulationenddate}`) : new Date(`${'2026-05-20'}`),
    // maintenanceport:4501,
    // nomaintenanceday:'saturday',
    // hardmaintenanceday:'sunday',
    // usebafreesmacondition : false, //test. ?댄룊?좎껜?щ? ?섏??딅뒗?? ?곸? 臾댁“嫄댁궛??
    // usebanobuydoubleup : false, // test 泥レ긽留?援щℓ
    // nobuyjumsang:true,      // ?쒕??먯꽌 ?먯궪?덉궗湲?
    // uplimitearlyvolume:5,   // 蹂쇰ⅷ 理쒓렐 5諛곗씠?곸씠硫?留ㅼ닔
    // usetimedetail:true,
    // usebavolumesma20:false, // 醫낃?媛 ?댁젣 20???꾨옒, ?ㅻ뒛 20?쇱꽑 ?꾧? ?쇱빞 ?곕떎. ?닿쾶 ?놁쑝硫?湲곕낯釉뚯븘泥섎읆 60?쇱꽑湲곗?.
    // reachedlimit:20,     // 蹂쇰ⅷ怨쇳븿猿?20 ?꾨줈 ?댁긽
    
    // divsellpercent:-5,
    // useguardfailfastsell : false, // test
    // dnlimitper : 29.5,       // use 29.5, nouse 10000, // test
    
    /////////////////////// BEFORE LIVE SYNC
    // port:4005,//4017,
    // initmoney:10000000,
    // maxonebuymoney_kor:10000000,
    // topstocklistcount:50,
    // usesamebuyrate : false,
    // useMacdUnderRsiShortDown: false,
    // useemarsi: false,
    // usebeforeliveperiod:true,
    // recselper:50,
    // ////////////// 

    // ///////////////////////// rsi 5,10 test
    
    // port:4100,
    // db_id : `srhsha_mok_kor`,
    // port : 4010,
    // awaitlog:false,
    // recselper:50,
    // topstocklistcount:150,
    // percentByoneBuy:20,
    // usesamebuyrate:true,
    // shortRecWrongBought:false,
    // shortRecHighpricedrop:true,
    // highdroprate:6,
    // highdropblackrate:80, // 援щℓ媛寃⑸?鍮??쇱젙 鍮꾩쑉 ?댁긽 ?곸듅?덉쓣?뚮쭔 留ㅻ룄?쒕떎. 0?닿굅???놁쑝硫??몃（由ы꽩  

    // // 蹂댄뿕 injurance
    // injurance : 5, // 0,1,3,5 // ?섏씡湲덉쓽 injurance??留뚰겮 injurancewallet???ｋ뒗??
    // // top ?먯꽌 3?꾨줈 ?댁긽 ?⑥뼱吏硫?留ㅻ룄 
    // // shortRecWrongBoughtrecyselloverday : 5, 
    // // useMacdUnderRsiShortDown:true,

    // usefilterdissolvestock:true, // ?쒕떖?꾧낵 二쇱떇?섍? ?щ씪吏??ш린袁?湲곗뾽 嫄곕Ⅴ湲? ?뚭컖? ?낅몦??
    // usersi_5_10_nobuy:false, // ?댁젣 5?쇱꽑>10?쇱꽑 利??대? ?곸듅?쇱텛?쒓굔 ?덉궛??
    // usersi_5_20_nobuy:true,
    // usersi_10_20_nobuy:false,
    // usersi_20_10_5_buy:false,
    // useMacdUnderRsiShortDown:false,
    // // // useSMA20upbuy:true,
    // // // rsilongup:true, // up留??쇰룄 ?ш쾶. ????ㅻⅨ 議곌굔???⑹퀜以??
    
    // // TEST
    // port:4006,
    // topstocklistcount:155,
    // percentByoneBuy:15,
    // usefilterdissolvestock : true,
    // useupratelong : true,
    // usesamebuyrate : false,

    // // recselper:100,
    // // divsellpercent:-100,

    // useemarsi: false,
    // usenewtopstockquery:false,
    // simulationstartdate:new Date(`${'2026-02-19'}`),
    // usememcached:false,
    // simulonlyonestock:'a051910',
    // simulationenddate:new Date(`${'2023-01-26'}`)
}

const IsTest=()=>{
    //return false;
    return Number(defulatConfig.port) === 4071;
} 

const IsNaq=(db_id)=>{
    return db_id.includes('naq') || db_id.includes('nas');
}

const dbidtonation=(db_id)=>{
    return IsNaq(db_id) ? 'NAQ' : 'KOR';
}

const dbidtoname=(db_id)=>{
    return db_id.split('_')[0];
}

const dbidtoredisjson=(db_id)=>{
    // return `${dbidtonation(db_id)}_${defulatConfig.fetchport}_JSON`
    return `${dbidtonation(db_id)}_ALL_JSON`
}

const GetOpenDayFormat=(db_id)=>{
    const today = GetLocalDate(db_id);
    const opendayformat = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,0)}-${today.getDate().toString().padStart(2,0)}`;  
    return opendayformat;
}

const GetLocalDate=(db_id, date='')=>{
    if(IsNaq(db_id))
        return date === '' ? new Date(new Date().toLocaleString('en', {timeZone: 'US/Eastern'})) : new Date(new Date(date).toLocaleString('en', {timeZone: 'US/Eastern'}));
    else 
        return date === '' ? new Date() : new Date(date);
}
 
const GetAllLocalDateStr=()=>{
    const krDate = GetLocalDateStr("kor");
    const usDate = GetLocalDateStr("naq");

    return ` K:[${krDate}] U:[${usDate}]`    
}

const GetLocalDateStr=(db_id, milisec)=>{
    const tzlst = {"KOR":"Asia/Seoul", "NAQ":"US/Eastern"};
    const tzval = tzlst[dbidtonation(db_id)];
    const rdate = moment().tz(tzval).format(milisec ? `MM-DD HH:mm:ss.${milisec}`:'MM-DD HH:mm:ss');
    return rdate;
}

const GetPassedTime=(startmsec)=>{
    const diffMSec = (new Date()).getTime() - startmsec;
    const totalseconds = diffMSec / 1000;
    
    let minute = Math.floor (totalseconds / 60);
    const hour = Math.floor(minute / 60)
    minute = minute - hour *60;
    const seconds = Math.floor (totalseconds % 60);
    const passedTime = `${hour}h:${minute}m:${seconds}s`
    return passedTime;
}

function GetMarketname(dbname, gb)
{    
    if(IsNaq(dbname))
    {
        if(gb==='d')                    // day
            return 'nasstocklist';
        else if(gb==='m')               // minute
            return 'minute_nasstocklist';
    }
    else
    {
        if(gb==='d')                      // day
            return 'stocklistdayall';
        else if(gb==='m')               // minute       
            return 'stocklist';
    }
}

function MarketChange(dbname)
{
    // if(dbname==='coinlist')    
    //     db = db_minute_coinlist;
    // else if(dbname==='japanstocklist')    
    //     db = db_japanstocklist; 


    // if(dbname === 'minute_nasstocklist')            // day
    //     db = db_minute_nasstocklist;    
    // else if(dbname === 'stocklist')         // day
    //     db = db_stocklist;     
    // else if(dbname==='stocklistdayall')         // day
    //     db = db_stocklistdayall;
    // else if(dbname==='nasstocklist')            // day
    //     db = db_nasstocklist;
}

function GetMarket(dbname, gb)
{    
    if(IsNaq(dbname))
    {
        if(gb==='d')                    // day
            return db_nasstocklist;
        else if(gb==='m')               // minute
            return db_minute_nasstocklist;
    }
    else
    {
        if(gb==='d')                      // day
            return db_stocklistdayall;
        else if(gb==='m')               // minute       
            return db_stocklist;
    }
}


const buypercent = 0.01;
const selpercent = 0.19;
const GetSellPercent=(selkind)=>{
    if(selkind.includes('DAYOUT_SHORT'))
    {
        return 0.3;
    }

    return 1.0;

    if(selkind.includes('FAST'))
    {
        return 0.3;
    }
    else if(selkind.includes('REFUND'))
    {
        return 1.0;
    }
    else
    {
        return 0.6;
    }
}

const GetBuyPercent=(buykind)=>{
    return 1.0;
}

const GetStartMessage=(nation, title)=>{    
    return `${nation} START-${title}`
}

const GetUpdateMessage=(nation, title, updatestr, starttime)=>{
    const passedTime = GetPassedTime(starttime);
    return `${nation} ${updatestr} ${title} ${passedTime}`
}

const GetCompleteMessage=(nation, title, starttime)=>{
    const passedTime = GetPassedTime(starttime);
    return `${nation} COMPLETE ${title} ${passedTime}`
}

const GetDayName=(day)=>
{
    if(day === 6)
        return 'saturday';
    else if(day === 0)
        return 'sunday';
    return day;
}

const NameToMarket=(db_id, name)=>{
    let marketkind = IsNaq(db_id) ? 'NYSE' : 'KOSPI';
    marketkind = name.includes('KOSDAQ') ? 'KOSDAQ' : 'NASDAQ';
}

const CanNxtTrade=()=>{
    return (defulatConfig.isnxt && !defulatConfig.ismock);
}

const GetIndexTicker=(marketidx)=>{
    if(IsNaq(defulatConfig.db_id))
    {
        return marketidx === 0 ? defulatConfig.snp500 : defulatConfig.naq100;
    }
    else
    {
        return marketidx === 0 ? defulatConfig.kodex200 : defulatConfig.kodexdaq150;
    }
}

const IsIndexTicker=(ticker)=>{
    return (ticker == GetIndexTicker(0)) || (ticker == GetIndexTicker(1));
}

const GetInitMoney=()=>{
    return (IsNaq(defulatConfig.db_id) ? defulatConfig.initmoney_naq : defulatConfig.initmoney);
}

const IsOneStockSimulation=()=>{
    if (!defulatConfig.autosimulation)
        return false;
    if(defulatConfig.usesinglesimulation)
        return true;
    if(globalval.simulonlyonestockcount == 'empty')
        globalval.simulonlyonestockcount = defulatConfig.simulonlyonestock.split(',').length;
    if(defulatConfig.simulonlyonestock == '')
        return false;
    if(globalval.simulonlyonestockcount != 1)
        return false;
    return true;
}

const Getfetchboylist=()=>{
    return defulatConfig.fetchboylist.split(',');
}

const AddSimulationLog=(addlong)=>{
    console.log(addlong + ' ');
    if(globalval.simulationlogchunks)
        globalval.simulationlogchunks.push(addlong + '\n');
    else
        globalval.simulationlog += addlong +'\n';
}

const GetSimulationLogFileTitle=(tradestocklist)=>{
    if(IsOneStockSimulation())
    {
        const singleticker = defulatConfig.usesinglesimulation ? globalval.simticker : defulatConfig.simulonlyonestock;
        const findstock = tradestocklist.find(tradestock=>tradestock.ticker == singleticker);
        return findstock ? `${findstock.name}(${findstock.ticker})` : 'xx';
        //return defulatConfig.simulonlyonestock == findstock.ticker;
    }


    return defulatConfig.topstocklistcount;
}

module.exports = {
    IsNaq, dbidtonation, dbidtoname, dbidtoredisjson, GetLocalDate, GetOpenDayFormat, GetAllLocalDateStr, GetLocalDateStr, GetPassedTime, GetMarket, MarketChange, GetMarketname, GetSellPercent, GetBuyPercent,
    GetStartMessage, GetUpdateMessage, GetCompleteMessage, GetDayName, NameToMarket, IsTest, GetIndexTicker, IsIndexTicker, GetInitMoney,
    AddSimulationLog, GetSimulationLogFileTitle, IsOneStockSimulation, Getfetchboylist, CanNxtTrade,
    defulatConfig, ip, fetchdelay 
}

