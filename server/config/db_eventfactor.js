const dbpass = require('./dbpassword')
const mysql = require('mysql');

const db = mysql.createPool({
    host : dbpass.host,
    user : dbpass.user,
    password : dbpass.password,
    database : 'eventfactor',
    idleTimeout: 10000
});
 
module.exports = db;