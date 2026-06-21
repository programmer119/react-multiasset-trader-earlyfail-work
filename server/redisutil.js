const { createClient } = require ('redis');
const {defulatConfig
  } = require('./util');
let client = null;
const tradeboy = defulatConfig.tradeboy; 
const fetchdb = defulatConfig.fetchdb;
const fetchboy = defulatConfig.fetchboy;

const REDIS_CONFIGS = {
    KOR_4100_JSON : {
       host:'redis-15990.c16.us-east-1-3.ec2.redns.redis-cloud.com',
       username:'default',
       password:'SjUnVLAPNh1Bn28H77j5APIv6zXAeWf4',
       port:15990,
   },

    KOR_ALL_JSON : {
        host:'redis-15990.c16.us-east-1-3.ec2.redns.redis-cloud.com',
        username:'default',
        password:'SjUnVLAPNh1Bn28H77j5APIv6zXAeWf4',
        port:15990,
    },
   
    KOR_TICKERS : {
       host:'redis-15990.c16.us-east-1-3.ec2.redns.redis-cloud.com',
       username:'default',
       password:'SjUnVLAPNh1Bn28H77j5APIv6zXAeWf4',
       port:15990,
   },

    KOR_4101_JSON : {
       host:'redis-11983.c340.ap-northeast-2-1.ec2.cloud.redislabs.com',
       username:'default',
       password:'Nm3ZOD79pwECfEqMUYVlfhXiPByECkUC',
       port:11983,
   }
}

const Initredis=async(key)=>{
    if (!client)
    {
        const config = REDIS_CONFIGS[key];
        client = createClient({
            username: config.default,
            password: config.password,
            socket: {
                host: config.host,
                port: config.port
            }
        });

        client.on('error', err => console.log('Redis Client Error', err));
        await client.connect();
        console.log('ready to use redis')
    }
    
    if(fetchdb === 'redis' && fetchboy === 'fetchboy')
        DeleteKey(key);
}

const Setredis=async(key, field, value)=>{
    // let data = 
    // await client.set('foo', 'bar');
    // await client.hSet( key, field, value )
    try {
        // 성공하면 추가된 필드 수(1) 또는 업데이트 성공(0) 반환
        const result = await client.hSet(key, field, value);
        
        // 성공 시 결과값 반환 (보통 1 또는 0)
        return result; 
        
    } catch (err) {
        // 여기서 에러 로그를 남기면 디버깅이 훨씬 편합니다.
        console.error(`[Redis Error] Key: ${key}, Field: ${field} 저장 실패!`);
        console.error(err);
        
        // 실패 시 false나 null을 던져서 호출부에서 알게 합니다.
        return false; 
    }
}

const SetStockPrices = async (key, stocks) => {
    const stockData = {};
    stocks.forEach(({ code, close }) => {
        stockData[code] = close;
    });
    await client.hSet(key, stockData);
};

const GetStockPrices = async (key, stocks) => {
    if(!client)
        return {}

    const result = await client.hGetAll(key);
    return result;
};

const DeleteKey=async(key)=>{
    await client.del(key);
}

const Getredis=async(key)=>{
    const result = await client.hGetAll(key);
    // const result = await client.hGet(key, );
    console.log(result)  // >>> bar
}

module.exports = { Initredis, Setredis, Getredis, SetStockPrices, GetStockPrices}