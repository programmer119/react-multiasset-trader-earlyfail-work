const dbpass = require('./dbpassword')
const mysql = require('mysql'); 

const pool = mysql.createPool({
    host : dbpass.host,
    user : dbpass.user,
    password : dbpass.password,
    database : 'walletsnapshot',
    idleTimeout: 10000
});
 
function db_walletsnapshot(callback) {
    pool.getConnection(function (err, conn) {
      if(!err) {
        callback(conn);
      }
    });
  }

module.exports = db_walletsnapshot;