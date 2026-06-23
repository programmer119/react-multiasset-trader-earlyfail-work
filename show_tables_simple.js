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
    console.log('Connected as id ' + connection.threadId);
    
    connection.query('SHOW TABLES', (error, results, fields) => {
        if (error) throw error;
        console.log('Tables:', results);
        connection.end();
    });
});
