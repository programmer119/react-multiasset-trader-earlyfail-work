const Topstocklist=async (today, db_id, callback)=>{             
    
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
    // const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${defulatConfig.validrightsdays ? defulatConfig.validrightsdays :  stockfilterdays+1}`;
    const sqldaily = `SELECT * FROM ?? where DATE(datetime) <= '${formattedDate}' ORDER BY DATE(datetime) DESC LIMIT ${stockfilterdays+1}`;        
    const sqlminute = `SELECT COUNT(*) as cnt FROM ?? WHERE DATE(datetime) <= ? AND DATE(datetime) >= ? AND TIME(datetime)>'09:00' AND TIME(datetime)<'16:00'`;

    const GetFilteredMinuteCount=(percent)=>{
        const onedayminuteMax = 390;
        return onedayminuteMax * (percent / 100);
    }
    const filterminuteleast = GetFilteredMinuteCount(filterpercent);//0=0%nofilter, 30%, 40% 195=50%, 270=70%, 310=80%  _ 理쒕? 390媛?
    
    const SendCallBack=(valid, ticker, vaildvolumes, dataslength, etcinfo)=>{
        let validticcker = false;     
        if(valid){
            const day30countsAvr = vaildvolumes / stockfilterdays;
            validticcker = day30countsAvr > filterminuteleast;
            if(validticcker)
            {
                // tickers.push(ticker);

                // ?숆린???뚯뒪??: ?앸굹怨?遺??
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
                    // let validrights;

                    if(!err1 && data1)
                    {
                        validshare = true;
                        // data1 = data30.slice(0,2);
                        isvalidupdated = (data1 && data1.length > 1 && data1[0].date === today); 
                        statusstr = (data1 && data1[0]) ? data1[0].status : '';
                        validstatus = defulatConfig.autosimulation ? true : ValidStatus(statusstr);
                        // validrights = ValidRights(data30);
                    }    

                    globalval.savedtopstockliststatus = `Topstocklist4-2 ${isvalidupdated} ${statusstr} ${validstatus}`;

                    if(validshare && isvalidupdated && validstatus)// && validrights)
                    {
                        if(usememcached)
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
                            // ?ㅻ뒛?좎쭨???쒖쇅?섍퀬 ?댁젣?좎쭨源뚯???遺꾨큺留?怨꾩궛?섍린 ?꾪빐 1, -1瑜??댁???
                            const values = [data1[0].code, data1[1].date, data1[data1.length-1].date]; 
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
                            console.log(`${ticker}? ${formattedDate}???곹룓濡?留ㅼ닔 ?쒖쇅!`);
                        }
                        else 
                        {
                            if(!validstatus)
                            {
                                console.log(`${data1[0].code} ${data1[0].name} ? ${formattedDate}??愿由?以묒?/?뺤? 醫낅ぉ?쇰줈 留ㅼ닔 ?쒖쇅!`);
                            }
                            // if(!validrights)
                            // {
                            //     console.log(`${data1[0].code} ${data1[0].name} ? ${formattedDate}??理쒓렐 ${defulatConfig.validrightsdays}?쇨컙 沅뚮━/諛곕떦?쇰줈 媛寃⑹쇅怨? 留ㅼ닔 ?쒖쇅!`);
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