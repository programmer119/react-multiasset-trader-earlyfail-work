
const express = require('express')
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express()
const redisutil = require('./redisutil')

app.use(bodyParser.json()); 
app.use(cors({
    origin: '*', // 모든 출처 허용 옵션. true 를 써도 된다.
}));

envport = 4600
app.listen(envport, async() => {
    console.log(`redis server listen ${envport}`)
    redisutil.Initredis();
    await redisutil.Setredis('KOR', 'a000100', 30000);
    await redisutil.Setredis('USA', 'TSLA', 300);
    await redisutil.Setredis('KOR', 'a000020', 57000);
    redisutil.Getredis('KOR');
})