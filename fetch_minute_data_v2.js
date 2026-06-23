const mysql = require('mysql');
const dbpass = require('./server/config/dbpassword');

const connection = mysql.createConnection({
    host: dbpass.host,
    user: dbpass.user,
    password: dbpass.password,
    database: 'stocklist'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting: ' + err.stack);
        return;
    }
    
    // Ticker가 'a030000'이면 테이블 이름이 'a030000'일 가능성이 높습니다.
    const query = "SELECT * FROM a030000 WHERE date = '20221121' AND time >= '0900' ORDER BY time ASC LIMIT 10";
    
    connection.query(query, (error, results, fields) => {
        if (error) {
            console.error('Query failed:', error.message);
        } else {
            console.log('Results:', JSON.stringify(results, null, 2));
        }
        connection.end();
    });
});
