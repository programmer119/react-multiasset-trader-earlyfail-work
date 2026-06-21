const {defulatConfig,    
} = require('./util');
const globalval = require('./globalval');
const { google } = require('googleapis');
const path = require('path');
const telegramapi = require(`./telegram`);
const {    
    
    paperchatid} = require('./consts')
// 1. 설정값
const SPREADSHEET_ID = '1RuUOSAo5pb433drb6Vn-A7fxFUiDFJBKNw1jgM3Tl0g'//'1ec9967069f73922475fe18e1a2a2a6735f1b86f';
const KEY_FILE_PATH = path.join(__dirname, 'credentials.json');
let lastSheetName;
async function getSheetDatas(sheets, sheetList, sheetorder) // -1 : last, -2 : penultimate
{
    let lastSheet;
    if(typeof sheetorder == 'number')
    {
    // 가장 마지막(오른쪽) 시트 선택
        lastSheet = sheetList[sheetList.length - (sheetorder+1)];
        lastSheetName = lastSheet.properties.title;
    }
    else
        lastSheet = sheetList.find(sheet=>sheet.properties.title==sheetorder);
    
    const tempSheetName = lastSheet.properties.title;

    // 3. 해당 시트의 데이터 읽기 (이미지 구조상 A2:B 범위)
    const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tempSheetName}!A2:N`, // 헤더를 제외한 TICKER, NAME 가져오기
    });

    
    const rows = response.data.values;
    return rows;
}

async function getReadySheetData(fromstr) {
    if(globalval.sheets)
        return globalval.sheets;

    telegramapi.SetPrevMSG(defulatConfig.db_id);
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    globalval.sheets = google.sheets({ version: 'v4', auth });

    // 2. 스프레드시트 메타데이터 가져오기 (시트 목록 확인)
    const metadata = await globalval.sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
    });
    globalval.sheetList = metadata.data.sheets;

    console.log(`getReadySheetData from ${fromstr?fromstr:''}`);
}

async function getValueSheetData() {
    if(globalval.excelvalues)
        return globalval.excelvalues;
    try{
        const valuesheet = 'value';
        const valuerows = await getSheetDatas(globalval.sheets, globalval.sheetList, valuesheet);
        
        const rowidx = defulatConfig.uplimitearlyvolume ? 2 : (defulatConfig.usebreakoutstocklist ? 1 : 0);
        const valuerow = valuerows[rowidx];
        
        const excelvalues = {
            SELSTARTTIME: (valuerow[1]),
            SELLUPRATE: Number(valuerow[2]),
            USESHBUY: (valuerow[3]),
            
            USESHSELL: (valuerow[4]),
            SONJULRATE: Number(valuerow[5]),
            DIVCOUNT: Number(valuerow[6]),
            TRYLONGCOUNTLIMIT:Number(valuerow[7]),
            BUYSTARTTIME:valuerow[8],
            BUYPRICERATE:Number(valuerow[9]),
            SELLOVERDAY:Number(valuerow[10]),
            UPLIMIT:Boolean(valuerow[11]),
            SELLMIDDAY:Number(valuerow[12]),
            BUYENDTIME:valuerow[13],
        };
        globalval.excelvalues = excelvalues;

    } catch (err) {
        console.error('에러 발생:', err);
    }
}

async function getLastSheetData() {
    if(globalval.persontickerlist && globalval.persontickerlist.length > 0)
        return globalval.persontickerlist;
    try {
        const rows = await getSheetDatas(globalval.sheets, globalval.sheetList, 0); 
        const successsheet = 'success';
        const successrows = await getSheetDatas(globalval.sheets, globalval.sheetList, successsheet);
        // const penultimaterows = await GetSheetDatas(sheets, sheetList, 1);

        if (!rows || rows.length === 0) {
            console.log('데이터가 없습니다.');
            return;
        }

        let totalcount = 0;
        let canbuycount = 0;
        let addsuccesscount = 0;
        // .success sheet
        if(successrows)
        {
            const successstockList = successrows.map(row => ({
                ticker: row[0],
                name: row[1],
                buylv: !row[2]?null:Number(row[2]),
                buy1: row[3],
                
                want1: row[5],
                want2: row[6],
                canbuy: false,
            }));
            globalval.successpersonstocklist = successstockList.reduce((acc, currentItem) => {
                // acc: 누산기 (이전 단계의 결과 객체)
                // currentItem: 현재 처리 중인 리스트 요소
                
                const { ticker, ...rest } = currentItem; // ticker를 분리하고 나머지 속성을 rest에 저장
                
                if(!defulatConfig.usepersonstocktrade)
                {       
                    // 누산기 객체에 ticker를 키로, 나머지 데이터를 값으로 할당
                    ++addsuccesscount; 
                }
                // ++totalcount;
                acc[ticker] = rest;
                return acc;
            }, {}); // 초기 값으로 빈 객체 {} 를 전달
        }
        // 4. 결과 출력 및 DB 작업 연동
        const stockList = rows.map(row => ({
            ticker: row[0],
            name: row[1],
            buylv: !row[2]?null:Number(row[2]),
            buy1: row[3],
            
            want1: row[5],
            want2: row[6],
            canbuy: row[10],
        }));
        globalval.personstocklist = stockList.reduce((acc, currentItem) => {
            // acc: 누산기 (이전 단계의 결과 객체)
            // currentItem: 현재 처리 중인 리스트 요소
            
            const { ticker, ...rest } = currentItem; // ticker를 분리하고 나머지 속성을 rest에 저장
            
            if(!defulatConfig.usepersonstocktrade || rest.canbuy)
            {       
                // 누산기 객체에 ticker를 키로, 나머지 데이터를 값으로 할당
                ++canbuycount; 
            }
            ++totalcount;
            acc[ticker] = rest;
            return acc;
        }, {}); // 초기 값으로 빈 객체 {} 를 전달
        
        
        const result = `Today Watching sheet ${lastSheetName}\n CANBUY:${canbuycount} / TOTAL:${totalcount}+SUCCESS:${addsuccesscount}`;

        console.log(result);
        const _chatid = paperchatid;
        
        telegramapi.SendMessage(result, '', _chatid);
        // console.log('오늘의 종목 리스트:', stockList);
        // 여기에 DB 갱신 로직을 추가하세요. (예: db.collection('stocks').update(...))
        globalval.persontickerlist = stockList.map(stock=>stock.ticker);
        return globalval.persontickerlist;

    } catch (err) {
        console.error('에러 발생:', err);
    }
}

module.exports ={
    getReadySheetData, getValueSheetData, getLastSheetData 
}