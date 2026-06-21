const Memcached = require('memcached');
const globalval = require('./globalval');
const schedule = require('node-schedule');
const { defulatConfig } = require('./util');
// Memcached 서버에 연결 (서버 주소와 포트 번호 설정)

let memcached = null;
let resetjob;
const serveraddr = '211.255.25.123:11211';
const InitMemcached=()=>{
    // memcached = new Memcached(
    //     '211.255.25.123:11211',
    //     {
    //         timeout: 1000, // 타임아웃 시간 설정 (밀리초 단위)
    //         retries: 100000, // 재시도 횟수
    //         retry: 1000, // 재시도 간격 (밀리초 단위)
    //     }); 
        
    memcached = new Memcached(serveraddr, {
        timeout: 2000,
        retries: 3,
        retry: 1000,
        failures: 2,
        reconnect: 10000,
        // node-memcached가 내부적으로 사용하는 Jackpot 풀 설정 제어
        pool: {
            limit: 100,      // 이미지에 보인 'limit: 10'을 100으로 확장
            maxIdle: 60000
        },
        remove: false
    });

    // 이벤트 리스너 추가 (디버깅용)
    memcached.on('failure', (details) => {
        console.log("Memcached server failure:", details);
    });
    memcached.on('reconnecting', (details) => {
        console.log("Memcached reconnecting:", details);
    });
    memcached.on('error', (err) => { console.log("MC Error:", err); });

    // 소켓 망가졌는지 60초마다 체크
    if(initstat == 0)
    {
        // 1. 실행할 함수 정의 (기존 함수명을 유지하세요)
        function yourTargetFunction() {
            if(defulatConfig.autosimulation && !defulatConfig.usememcached)
                return;

            if(globalval.simstate == 'complete' && resetjob)
            {
                resetjob.cancel(); 
                console.log(`${resetcount} 회 리셋사용, 스케줄러가 성공적으로 종료되었습니다. ${defulatConfig.port}`);
            }

            const needreset = savebackkey == backkey;
            console.log(`needreset=${needreset} ${savebackkey} vs ${backkey}`, new Date().toLocaleTimeString());
            
            if(needreset)
            {
                ResetMemcache();
                savebackkey = '';
            }
            else
               savebackkey = backkey;
        }

        // 2. 스케줄 규칙 설정
        const rule = new schedule.RecurrenceRule();

        // // [0, 10, 20, 30, 40, 50]초에 실행되도록 설정
        // rule.second = [0, 10, 20, 30, 40, 50];
        rule.second = 0;

        // 3. 스케줄 시작
        resetjob = schedule.scheduleJob(rule, yourTargetFunction);

        console.log('스케줄러가 시작되었습니다.');
    }
    ++initstat;
}

let initstat = 0;
let savebackkey = '';
let backkey = 'x';
let backcallback;
let resetcount = 0;
const ResetMemcache=()=>{
    ++resetcount;
    memcached = null;
    GetMemcachedData(backkey, backcallback);
}

// 데이터 가져오기    
const GetMemcachedData=(key, callback)=>{
    backkey = key;
    backcallback = callback;
    globalval.savedtopstockliststatus = `GetMemcachedData 0 ${key} ${!memcached}`;
    
    if(!memcached)
        InitMemcached();

    const lowerkey = key.toLowerCase();
    
    // [보강] 서버가 응답 가능한 상태인지 내부 객체로 직접 확인
    // memcached.servers 배열의 첫 번째 서버 상태를 확인합니다.
    const serverAddress = serveraddr;
    const mgr = memcached.connections && memcached.connections[serverAddress];
    const pendingCount = mgr ? mgr.pending : 0;
   
    globalval.savedtopstockliststatus = `GetMemcachedData 1 ${lowerkey} ${!memcached} Pending:${pendingCount}`;
    memcached.get(lowerkey, function(err, data) {
        if (err) {
            globalval.savedtopstockliststatus = `GetMemcachedData 2-err ${err}`;
            console.log("Error getting value from Memcached:", err);
            // return;
        }
        else
        {
            globalval.savedtopstockliststatus = `GetMemcachedData 2-ok ${data}`;
            if (data === undefined) {
                // console.log("Key not found in cache");
            } else {
                //console.log("Data retrieved from Memcached:", data);
                //return data;
            }
        }

        let arr;
        // let arr = data ? JSON.parse(data.replace(/'/g, '"')) : null;
        // globalval.savedtopstockliststatus = `GetMemcachedData 3 ${arr}`;
        // callback(arr);
        try {
            arr = data ? JSON.parse(data.replace(/'/g, '"')) : null;
            globalval.savedtopstockliststatus = `GetMemcachedData 3-success`;
            // callback(arr);
        } catch (e) {
            globalval.savedtopstockliststatus = `GetMemcachedData 3-err ${e.message}`;
            console.log("JSON Parse Error:", e);
        }
        callback(arr);
    });
}

// 클라이언트 연결 종료
const ClearMemcached=()=>{
    memcached.end();
}

const GetMemcachedDataMulti = (keys, callback) => {
    if(!memcached)
        InitMemcached();

    const lowerKeys = keys.map(key => key.toLowerCase());

    memcached.getMulti(lowerKeys, function(err, dataMap) {
        if (err) {
            console.log("Error getting multi values from Memcached:", err);
            callback({});
            return;
        }

        const result = {};

        Object.entries(dataMap || {}).forEach(([key, data]) => {
            try {
                result[key] = data ? JSON.parse(data.replace(/'/g, '"')) : null;
            } catch (e) {
                console.log("JSON Parse Error:", key, e);
                result[key] = null;
            }
        });

        callback(result);
    });
};

module.exports = {
    GetMemcachedData,
    GetMemcachedDataMulti,
}
