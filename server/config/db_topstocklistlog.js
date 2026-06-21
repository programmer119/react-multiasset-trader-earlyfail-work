const dbpass = require('./dbpassword')
const mysql = require('mysql'); 
const {defulatConfig
} = require('../util');

const pool = mysql.createPool({
    host : dbpass.host,
    user : dbpass.user,
    password : dbpass.password,
    database : defulatConfig.usetemptopstocklistlog ? `topstocklistlog_${defulatConfig.usetemptopstocklistlog}` : 'topstocklistlog',
    idleTimeout: 10000
});        

function db_topstocklistlog(callback) {
    pool.getConnection(function (err, conn) {
      if(!err) {
        callback(conn);
      }
    });
  }

module.exports = db_topstocklistlog;
