const db_stocklist = require('./server/config/db_stocklist');

db_stocklist((err, conn) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Database connection successful!');
    conn.release();
    process.exit(0);
});
