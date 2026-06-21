const telegramapi = require(`./telegram`)
const shell = require('shelljs')
const {spawn, execFile} = require("child_process");
const config = require("./config")
const iconv = require('iconv-lite');
const fs = require('fs');
const {defulatConfig, fetchdelay
} = require('./util');
const g_ismok = defulatConfig.ismock;
const coolMax = g_ismok ? 500 : 200; 
const coolMaxFast = g_ismok ? fetchdelay : fetchdelay;

let g_shellExecute = [];        // 1초 최대 2건.
let g_shellExecuteFast = [];    // 1초 최대 20건.
let TokenCoolMax = 60 * 2;  // 2분에 한번씩 체크
let beforecurmilsecond = 0;

let pyresultlist = []
let debugval; // 디버깅용 변수저장
const pyutil =
{
    ShellExecutePython(pathhead, filename, funcname, value1, value2, value3, value4, value5, CallBack, callbackvals)
    {
        const ParseVals=(decodeStr, resultval)=>{            
            for(const [parsestr, destval] of Object.entries(resultval))
            {
                decodeStr.split(',').some((element)=>{
                    if(element.includes(parsestr))
                    {
                        resultval[parsestr] = element.split(':')[1];
                        return true;
                    }
                    else
                        return false;
                })
            }
        }        

        // LOG TEST
        // console.log('ShellExecutePython', funcname, value1, value2, value3, value4, value5);

        // -Verb runas
        // pythonw
        //const pythonpath = 'C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python38\\pythonw'
        let pythonpath = filename === 'yahoo_nas_day_alltime' ?'C:\\Users\\user\\anaconda3\\envs\\pydebug\\pythonw' : 'pythonw';
        // const pywpath = 'C:\\Users\\user\\Documents\\GitHub\\python-multiasset-trader\\yahoo_nas_day_alltime.pyw';
        // const pythonpath = 'C:\\Users\\user\\anaconda3\\envs\\pydebug\\pythonw'
        const result = spawn(pythonpath, [pathhead + `${filename}.pyw`, funcname, value1, value2, value3, value4, value5]);
        const key = filename+funcname+value1+value2+value3+value4+value5;
        if(!pyresultlist[key])
            pyresultlist[key] = {}
        pyresultlist[key].result = result;
        // pyresultlist[key].CallBack = CallBack;
        // pyresultlist[key].callbackvals = callbackvals;
        
        
        // const args = [funcname, value1, value2, value3, value4, value5]
        // const command = `"pythonw" "${pathhead + `${filename}.pyw`}" ${args.join(' ')}' -Verb runas`;
        // const result = spawn(command, { shell: true });//
        let resultval = {
            rt_cd : '0',
            msg1 : '',
            odno : '',
            rmn_qty : '',
            ord_qty : '',
            tot_ccld_qty : '',
            tot_ccld_amt : '',
            avg_prvs : '',
            sll_buy_dvsn_cd : '',
        }
        // pyresultlist[key].resultval = resultval;        
        // pyresultlist[key].filename = filename;
        // pyresultlist[key].funcname = funcname;
        
        const pyresult = pyresultlist[key];
        pyresult.result.resultval = resultval;
        pyresult.result.filename = filename;
        pyresult.result.funcname = funcname;
        pyresult.result.CallBack = CallBack;
        pyresult.result.callbackvals = callbackvals;
        // if(pyresult.added)
        //     continue;
        // if(!pyresult.added)
        //     pyresult.added = true;       
        
        

        pyresult.result.stdout.once('data', function(data) {
            filename = pyresult.result.filename;
            funcname = pyresult.result.funcname;
            resultval = pyresult.result.resultval;
            CallBack = pyresult.result.CallBack;
            callbackvals = pyresult.result.callbackvals;
            // LOG TEST
            // console.log('once', funcname, resultval, callbackvals);

            decodeStr = iconv.decode(data, 'UTF-8');
            if(decodeStr.includes('PYTHONERROR'))
                return;
            
            if(funcname.includes('market') || funcname.includes('complete') || funcname.includes('oldinfo_collect'))
            {
                ParseVals(decodeStr.replace('[p]','').replaceAll('\r\n',''), resultval);
            }

            // if(config.useConsoleLog)
            //     console.log(`[S] ${filename} ${funcname} success : `, decodeStr);
                // console.log(`${filename} success : `, iconv.decode(data, 'euc-kr'));
            if(CallBack)
            {
                if(funcname === 'fetch_price')
                {
                    ticker = decodeStr.replace('[p]','').replaceAll('\r\n','').split(' ')[1]
                    if (ticker === callbackvals[callbackvals.length-1])

                        CallBack(resultval, callbackvals);
                    
                }
                else
                    CallBack(resultval);
            }
        })

        pyresult.result.stderr.on('data', function(data) {
            filename = pyresult.result.filename;
            funcname = pyresult.result.funcname;
            resultval = pyresult.result.resultval;
            CallBack = pyresult.result.CallBack;
            callbackvals = pyresult.result.callbackvals;              
            // RECONNECT MUSE HAVE OUT AND ERROR. THAT ERROR IS NEED ERROR.
            isReconnect = funcname.includes('reconnect');
            if(isReconnect)
                return;

            decodeStr = iconv.decode(data, 'UTF-8');
            if(config.useErrorLog)
                console.log(`[S] ${filename} ${funcname} error : `, decodeStr);

            ParseVals(decodeStr.replace('[PYTHONERROR]','').replace('\r\n','') , resultval);
                // console.log(`${filename} error : `, iconv.decode(data, 'UTF-16'));~
            if(CallBack)
            {
                if(funcname === 'fetch_price' || funcname === 'getaccount')
                    CallBack(resultval, callbackvals);
                else
                    CallBack(resultval);
            }
        });
                 
        // for ( resultkey in  pyresultlist )
        // {
        //     const pyresult = pyresultlist[resultkey];
        //     if(pyresult.added)
        //         continue;
        //     if(!pyresult.added)
        //         pyresult.added = true;       
            

        //     pyresult.result.stdout.on('data', function(data) {
        //         filename = pyresult.filename;
        //         funcname = pyresult.funcname;
        //         resultval = pyresult.resultval;
        //         CallBack = pyresult.CallBack;
        //         callbackvals = pyresult.callbackvals;

        //         decodeStr = iconv.decode(data, 'UTF-8');
        //         if(decodeStr.includes('PYTHONERROR'))
        //             return;
                
        //         if(funcname.includes('market') || funcname.includes('complete') || funcname.includes('oldinfo_collect'))
        //         {
        //             ParseVals(decodeStr.replace('[p]','').replaceAll('\r\n',''), resultval);
        //         }
    
        //         // if(config.useConsoleLog)
        //         //     console.log(`[S] ${filename} ${funcname} success : `, decodeStr);
        //             // console.log(`${filename} success : `, iconv.decode(data, 'euc-kr'));
        //         if(CallBack)
        //         {
        //             if(funcname === 'fetch_price')
        //                 CallBack(resultval, callbackvals);
        //             else
        //                 CallBack(resultval);
        //         }
        //     })

        //     pyresult.result.stderr.on('data', function(data) {
        //         filename = pyresult.filename;
        //         funcname = pyresult.funcname;
        //         resultval = pyresult.resultval;                
        //         // RECONNECT MUSE HAVE OUT AND ERROR. THAT ERROR IS NEED ERROR.
        //         isReconnect = funcname.includes('reconnect');
        //         if(isReconnect)
        //             return;
    
        //         decodeStr = iconv.decode(data, 'UTF-8');
        //         if(config.useErrorLog)
        //             console.log(`[S] ${filename} ${funcname} error : `, decodeStr);
    
        //         ParseVals(decodeStr.replace('[PYTHONERROR]','').replace('\r\n','') , resultval);
        //             // console.log(`${filename} error : `, iconv.decode(data, 'UTF-16'));~
        //         if(CallBack)
        //         {
        //             if(funcname === 'fetch_price')
        //                 CallBack(resultval, callbackvals);
        //             else
        //                 CallBack(resultval);
        //         }
        //     });
        // }

        // result.stdout.once('data', function(data) {
        //     decodeStr = iconv.decode(data, 'UTF-8');
        //     if(decodeStr.includes('PYTHONERROR'))
        //         return;
            
        //     if(funcname.includes('market') || funcname.includes('complete') || funcname.includes('oldinfo_collect'))
        //     {
        //         ParseVals(decodeStr.replace('[p]','').replaceAll('\r\n',''), resultval);
        //     }

        //     // if(config.useConsoleLog)
        //     //     console.log(`[S] ${filename} ${funcname} success : `, decodeStr);
        //         // console.log(`${filename} success : `, iconv.decode(data, 'euc-kr'));
        //     if(CallBack)
        //     {
        //         if(funcname === 'fetch_price')
        //             CallBack(resultval, callbackvals);
        //         else
        //             CallBack(resultval);
        //     }
        // })

        // result.stderr.on('data', function(data) {
        //     // RECONNECT MUSE HAVE OUT AND ERROR. THAT ERROR IS NEED ERROR.
        //     isReconnect = funcname.includes('reconnect');
        //     if(isReconnect)
        //         return;

        //     decodeStr = iconv.decode(data, 'UTF-8');
        //     if(config.useErrorLog)
        //         console.log(`[S] ${filename} ${funcname} error : `, decodeStr);

        //     ParseVals(decodeStr.replace('[PYTHONERROR]','').replace('\r\n','') , resultval);
        //         // console.log(`${filename} error : `, iconv.decode(data, 'UTF-16'));~
        //     if(CallBack)
        //     {
        //         if(funcname === 'fetch_price')
        //             CallBack(resultval, callbackvals);
        //         else
        //             CallBack(resultval);
        //     }
        // });

    },

    
    ShellExcute(filename, funcname, value1, value2, value3, value4, value5, CallBack)
    {
        function runPythonScriptAsAdmin(scriptPath, ...args) {
            // TEST
            // const safeArgs = args.map(arg => `\\"${arg}\\"`).join(' ');
            // const command = `powershell -Command "Start-Process cmd -ArgumentList '/k python \\"${scriptPath}\\" ${safeArgs}' -Verb runas"`;
            
            // ORIGINAL
            const command = `powershell -Command Start-Process cmd -ArgumentList '/c start "" "python" "${scriptPath}" ${args.join(' ')}' -Verb runas`;
            return spawn(command, { shell: true });
          }

        if(config.useConsoleLog)
            console.log(`${filename} ${funcname} ${value2} Start`);        

        debugval = `${config.pythonfileabsolutepathhead} ${filename}.pyw ${funcname} ${value1} ${value2} ${value3} ${value4} ${value5}`
        //const result = spawn('cmd.exe', ["/c", config.batchfileabsolutepathhead + `${filename}.bat`, funcname, value1, value2, value3, value4, value5]);
        result = runPythonScriptAsAdmin(config.pythonfileabsolutepathhead + `${filename}.pyw`, funcname, value1, value2, value3, value4, value5)
        // result.stdout.once('close', function(data) {
        //     // if(config.useConsoleLog)
        //     //     console.log(`${filename} ${funcname} success : `, iconv.decode(data, 'UTF-8'));
        //         // console.log(`${filename} success : `, iconv.decode(data, 'euc-kr'));
        //     if(CallBack)
        //         CallBack();
        // })

        // result.stderr.on('close', function(data) {
        //     // if(config.useErrorLog)
        //     //     console.log(`${filename} ${funcname} error : `, iconv.decode(data, 'UTF-8'));
        //         // console.log(`${filename} error : `, iconv.decode(data, 'UTF-16'));~
        //     if(CallBack)
        //         CallBack();
        // });

        result.on('close', (code) => {
            if (code === 0) {
                CallBack();
            } else {
                console.log(`runPythonScriptAsAdmin close ${code} ${debugval}`)
            }
          });
      
        //   result.on('error', (error) => {
        //     console.log('1')
        //   });
       
        if(config.useConsoleLog)
            console.log(`${filename} ${funcname} ${value2} End`);
    },

    ShellExcuteShellJS(filename, funcname, value1, value2, value3, value4, value5, CallBack)
    {       
        if(config.useConsoleLog)
            console.log(`${config.batchfileabsolutepathhead + filename}.bat Start`);       

        let result = shell.exec(`${config.batchfileabsolutepathhead + filename}.bat ${funcname} ${value1} ${value2} ${value3} ${value4} ${value5}`)

        if(CallBack)
            CallBack();        

        if(config.useConsoleLog)
            console.log(`${config.batchfileabsolutepathhead + filename} ${funcname} End`);   
    },

    ExecuteShell(){
        setInterval(() => {
            // console.log('INTERVAL!');
            if(g_shellExecute.length > 0)
            {
                const excutemsg = g_shellExecute.shift();
                pyutil.ShellExecutePython(excutemsg.pathhead, excutemsg.filename, excutemsg.funcname, excutemsg.value1, excutemsg.value2, excutemsg.value3, excutemsg.value4, excutemsg.value5, excutemsg.CallBack, excutemsg.callbackvals);
            }            
        }, coolMax);

        setInterval(() => {
            // console.log('INTERVAL!');
            if(g_shellExecuteFast.length > 0)
            {
                const excutemsg = g_shellExecuteFast.shift();
                pyutil.ShellExecutePython(excutemsg.pathhead, excutemsg.filename, excutemsg.funcname, excutemsg.value1, excutemsg.value2, excutemsg.value3, excutemsg.value4, excutemsg.value5, excutemsg.CallBack, excutemsg.callbackvals);
                // console.log('EXECUTE!');
            }            
        }, coolMaxFast);
    },

    PushShell(pathhead, filename, funcname, value1, value2, value3, value4, value5, CallBack, callbackvals){
        const shellexecute = funcname.includes('fetch_price') ? g_shellExecuteFast : g_shellExecute;
        shellexecute.push({
            pathhead:pathhead, 
            filename:filename, 
            funcname:funcname, 
            value1:value1, 
            value2:value2, 
            value3:value3, 
            value4:value4, 
            value5:value5, 
            CallBack:CallBack,
            callbackvals:callbackvals,
        })
    },

    InsertShell(pathhead, filename, funcname, value1, value2, value3, value4, value5, CallBack){
        const shellexecute = funcname.includes('fetch_price') ? g_shellExecuteFast : g_shellExecute;
        shellexecute.unshift({
            pathhead:pathhead, 
            filename:filename, 
            funcname:funcname, 
            value1:value1, 
            value2:value2, 
            value3:value3, 
            value4:value4, 
            value5:value5, 
            CallBack:CallBack,
        })
    },

    get_kisfile(db_id)
    {
        // console.log('get_kisfile market : ' + `kis${IsNasdaq(market) ? '_naq' : ''}`);
        //return `kis${IsNasdaq(market) ? '_naq' : ''}`
        return `kis${db_id.includes('naq') ? '_naq' : ''}`
    },

    IsMock(db_id)
    {
        return db_id.includes('mok');
    },

    market_buy_order(db_id, ticker, count, macdlongshort, CallBack)
    {
        pyutil.InsertShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "market_buy_order", db_id, ticker, parseInt(count), macdlongshort, defulatConfig.fetchport, CallBack);
    },

    market_sell_order(db_id, ticker, count, macdlongshort, CallBack)
    {    
        pyutil.InsertShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "market_sell_order", db_id, ticker, parseInt(count), macdlongshort, defulatConfig.fetchport, CallBack);
    },
    market_cancel_order(db_id, odno, market, ticker, CallBack)
    {
        pyutil.InsertShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "market_cancel_order", db_id, odno, market, ticker, 0, CallBack);       
    },

    getaccount(db_id, CallBack)
    {           
        pyutil.PushShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "getaccount", db_id, 0, 0, 0, 0, CallBack);
    },

    fetch_price(db_id, tickers, CallBack)
    {   
        tickers.forEach((ticker)=>{
            pyutil.PushShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "fetch_price", db_id, ticker, 0, 0, 0, ticker === tickers[tickers.length-1] ? CallBack : null, tickers); 
        })        
    },

    fetch_price_list(db_id, tickers, markets, CallBack)
    {   
        pyutil.PushShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "fetch_price_list", db_id, tickers, markets, defulatConfig.port, 0, CallBack); 
    },

    init_wallet(db_id, CallBack)
    {
        pyutil.PushShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "init_wallet", db_id, 0, 0, 0, 0, CallBack);
    },

    update_daily_walletsnapshot(db_id, CallBack)
    {
        pyutil.PushShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "update_daily_walletsnapshot", db_id, 0, 0, 0, 0, CallBack);
    },

    // get_my_complete(db_id, odno, sell_buy_dvsn, ticker, CallBack)
    get_my_complete(db_id, odno, sell_buy_dvsn, macdlongshort, CallBack)
    {
        pyutil.PushShell(config.pythonfileabsolutepathheadkis, pyutil.get_kisfile(db_id), "get_my_complete", db_id, odno, sell_buy_dvsn, macdlongshort, 0, CallBack);
    },    

    issue_access_token(db_id, CallBack)
    {        
        db_id_pre = db_id.split('_')[0];
        const mokstr = db_id.split('_')[1] === 'real' ? 'real':'mok';
        pyutil.DeleteToken(`token${db_id_pre}${mokstr}`);
        pyutil.PushShell(config.pythonfileabsolutepathheadkis, 'kis', 'issue_access_token', db_id, 0, 0, 0, 0, CallBack);
    },    
  
    stock_oldinfo_collect(db_id, ticker, CallBack)
    {
        pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'stock_oldinfo_collect', 'stock_oldinfo_collect', ticker, db_id, 0, 0, 0, CallBack);
        //pyutil.ShellExcute('stock_oldinfo_collect', 'stock_oldinfo_collect', ticker, 0, 0, 0, CallBack);
    },    
    stock_oldinfo_collect_plural(db_id, dailytopstocklist, gb, CallBack)
    {
        if (dailytopstocklist.length === 0)
            dailytopstocklist = 'emptystock'

        // if(dailytopstocklist.length > 600)
        // {
        //     const originlen = dailytopstocklist.length;
        //     dailytopstocklist = dailytopstocklist.split(',').slice(0, 600).join(',');
        //     console.log(`stock_oldinfo_collect_plural LENGTH CUT ${originlen} to ${dailytopstocklist.length}`);
        // }

        pyutil.ShellExcute('stock_oldinfo_collect', 'stock_oldinfo_collect_plural', 'x', gb, db_id, 0, 0, CallBack);
        //pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'stock_oldinfo_collect', 'stock_oldinfo_collect','all', 0, 0, 0, CallBack);
    },  
    stock_oldinfo_collect_all(db_id, dayname, CallBack)
    {
        pyutil.ShellExcute('stock_oldinfo_collect', 'stock_oldinfo_collect','all', dayname, db_id, 0, 0, CallBack);
        //pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'stock_oldinfo_collect', 'stock_oldinfo_collect','all', 0, 0, 0, CallBack);
    },
    resetcreon(db_id, CallBack)
    {
        // if(!consts.IsMainFetchBoy(defulatConfig.port))
        // {
        //     setTimeout(() => {
        //         CallBack();
        //       }, 60*2000);
        //     return;
        // }
        pyutil.ShellExcute('stock_oldinfo_collect', 'reconnect',0, 0, db_id, 0, 0, CallBack);
        //pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'stock_oldinfo_collect', 'reconnect',0, 0, 0, 0, CallBack);
    },
    stock_oldinfo_collect_market_capitalization(CallBack)
    {
        pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'stock_oldinfo_collect', 'market_capitalization','all', 0, 0, 0, 0, CallBack);
    },

    // nasminutestock_oldinfo_collect(ticker, CallBack)
    // {
        //pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'yahoo_nas_day_alltime', 'yahoo_nas_day_alltime', ticker, 0, 0, 0, (result)=>{
        //    pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'nasminutestock_oldinfo_collect', 'nasminutestock_oldinfo_collect', ticker, 0, 0, 0, CallBack);
        //});
    // },    
    
    // nasminutestock_oldinfo_collect_plural(dailytopstocklist, CallBack)
    // {
    //     pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'yahoo_nas_day_alltime', 'yahoo_nas_day_alltime_plural', dailytopstocklist, 0, 0, 0, (result)=>{
    //         pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'nasminutestock_oldinfo_collect', 'nasminutestock_oldinfo_collect_plural', dailytopstocklist, 0, 0, 0, ()=>{                
    //         });
    //     });
    //     CallBack('');
    // },        
    

    coinminute_oldinfo_collect(ticker, CallBack)
    {
        pyutil.ShellExecutePython(config.pythonfileabsolutepathhead, 'coinminute_oldinfo_collect', '', ticker, 0, 0, 0, 0, CallBack);
    },        
    
    

    // yahoo_nas_day_alltime(ticker, CallBack)
    // {
    //     // console.log("stock_oldinfo_collect Start");
    //     shell.exec(`yahoo_nas_day_alltime.bat yahoo_nas_day_alltime ${ticker} 0, 0`);
    //     // console.log("stock_oldinfo_collect End")
    // },        

    // calltemp(ticker, CallBack)
    // {    
    //     console.log("calltemp Start");
    //     shell.exec(`callpy.bat calltemp ${ticker} 0`)
    //     console.log("calltemp End")
    // },


    DeleteToken(tokenname)
    {      
        try {
            telegramapi.SendMessage(`DeleteToken`);

            const file = `C:\\Users\\user\\Documents\\GitHub\\react-multiasset-trader\\${tokenname}.dat`;
            const fsstat = fs.statSync(file);
            if(fsstat)
            {
                fs.unlinkSync(file);
            }
        } catch (error) {
        
            if(error.code == 'ENOENT'){
                console.log(`${tokenname} file not exist`);
            }
        }
    },


    // DeleteTokens()
    // {
    //     console.log("DeleteTokens");
    //     pyutil.DeleteToken('tokenTrue');
    //     pyutil.DeleteToken('tokenFalse');
    // },
}
module.exports = pyutil;