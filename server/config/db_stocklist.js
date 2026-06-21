const dbpass = require('./dbpassword')
const mysql = require('mysql');

const pool = mysql.createPool({
    host : dbpass.host,
    user : dbpass.user,
    password : dbpass.password,
    database : 'stocklist',
    connectionLimit: 64,
    multipleStatements:true,
    idleTimeout: 10000
});

function db_stocklist(callback) {
    pool.getConnection(function (err, conn) {
      if(!err) {
        callback(conn);
      }
    });
  }
 
module.exports = db_stocklist;
