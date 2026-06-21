// LOCAL MACHINE
//
//let absolutepath = 'C:/Users/user/Documents/GitHub/'
// C:/GitHub/
const db_serverinfo = require('./config/db_serverinfo')

// LIVE MACHINE
let absolutepath = process.cwd();
let pathroot = `${absolutepath}/../`;
let pyabsolutepath = `${pathroot}python-multiasset-trader`;

let config = {    
    // callpypath : `${absolutepath}/react-multiasset-trader/server/callpy.bat`,
    // stock_oldinfo_collect_path : `${absolutepath}/react-multiasset-trader/server/stock_oldinfo_collect.bat`,
    // batchfileabsolutepathhead :  `${absolutepath}/react-multiasset-trader/server/`,
    // pythonfileabsolutepathhead :  `${absolutepath}/python-multiasset-trader/`,
    // pythonfileabsolutepathheadkis :  `${absolutepath}/python-multiasset-trader/kis/`,
    // useConsoleLog : true,
    // useErrorLog : true,

    callpypath : `${absolutepath}/server/callpy.bat`,
    stock_oldinfo_collect_path : `${absolutepath}/server/stock_oldinfo_collect.bat`,
    batchfileabsolutepathhead :  `${absolutepath}/server/`,    
    pythonfileabsolutepathhead :  `${pyabsolutepath}/`,
    pythonfileabsolutepathheadkis :  `${pyabsolutepath}/kis/`,
    useConsoleLog : true,
    useErrorLog : true,    
}

// if(absolutepath === '')
// {
//     query = `SELECT status FROM maintenance WHERE NAME = 'workpath'`            
//     db_serverinfo.query(query, (err, data) => {
//     if(!err && data && data[0] && data[0].status !== '') {
//         absolutepath = data[0].status;
//         config.callpypath = `${absolutepath}/react-multiasset-trader/server/callpy.bat`;
//         config.stock_oldinfo_collect_path = `${absolutepath}/react-multiasset-trader/server/stock_oldinfo_collect.bat`;
//         config.batchfileabsolutepathhead =  `${absolutepath}/react-multiasset-trader/server/`;
//         config.pythonfileabsolutepathhead =  `${absolutepath}/python-multiasset-trader/`;
//         config.pythonfileabsolutepathheadkis =  `${absolutepath}/python-multiasset-trader/kis/`;
//     }})
// }
// else{
//     config.callpypath = `${absolutepath}/react-multiasset-trader/server/callpy.bat`;
//     config.stock_oldinfo_collect_path = `${absolutepath}/react-multiasset-trader/server/stock_oldinfo_collect.bat`;
//     config.batchfileabsolutepathhead =  `${absolutepath}/react-multiasset-trader/server/`;
//     config.pythonfileabsolutepathhead =  `${absolutepath}/python-multiasset-trader/`;
//     config.pythonfileabsolutepathheadkis =  `${absolutepath}/python-multiasset-trader/kis/`;
// }
module.exports = config;
