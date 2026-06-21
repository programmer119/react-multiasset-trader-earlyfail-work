const dbpass = require('./dbpassword')
const mysql = require('mysql');

const pool = mysql.createPool({
    host : dbpass.host,
    user : dbpass.user,
    password : dbpass.password,
    database : 'minute_nasstocklist',
    connectionLimit: 1,
    idleTimeout: 10000
});
 
function db_minute_nasstocklist(callback) {
    pool.getConnection(function (err, conn) {
      if(!err) {
        callback(conn);
      }
    });
  }

module.exports = db_minute_nasstocklist;