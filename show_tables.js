const db_stocklist = require('./server/config/db_stocklist');
db_stocklist((err, conn) => {
    if (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }
    const query = "SHOW TABLES";
    conn.query(query, (err, results) => {
        if (err) {
            console.error('Query failed:', err);
        } else {
            console.log('Tables:', results);
        }
        conn.release();
        process.exit(0);
    });
});
