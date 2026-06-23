const mysql = require('mysql');
const dbpass = require('./server/config/dbpassword');

const pool = mysql.createPool({
    host: dbpass.host,
    user: dbpass.user,
    password: dbpass.password,
    database: 'stocklist'
});

pool.getConnection((err, conn) => {
    if (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }
    console.log('Connection successful. Querying...');
    const query = "SELECT * FROM minute_data WHERE ticker = 'a030000' AND date = '20221121' AND time >= '0900' ORDER BY time ASC LIMIT 10";
    conn.query(query, (err, results) => {
        if (err) {
            console.error('Query failed:', err);
        } else {
            console.log('Results:', JSON.stringify(results, null, 2));
        }
        conn.release();
        pool.end();
        process.exit(0);
    });
});
