const highorderCount = 0;
// const loworderprocessCount = 50;
const idcurl = '211.255.25.125';//'192.168.219.102';//;
//const flaskserver = '127.0.0.1:5000';
const flaskserver = `${idcurl}:5000`;

const KOR_LIVE_PORT = 4100;
const NAQ_LIVE_PORT = 4200;
const TEST_LIVE = 4071;
const kor_live_port_list = [KOR_LIVE_PORT, KOR_LIVE_PORT+1, KOR_LIVE_PORT+2, KOR_LIVE_PORT+3, KOR_LIVE_PORT+4, KOR_LIVE_PORT+5, KOR_LIVE_PORT+6, KOR_LIVE_PORT+7];
const naq_live_port_list = [NAQ_LIVE_PORT, NAQ_LIVE_PORT+1, NAQ_LIVE_PORT+2, NAQ_LIVE_PORT+3, NAQ_LIVE_PORT+4, NAQ_LIVE_PORT+5, NAQ_LIVE_PORT+6, NAQ_LIVE_PORT+7];
const IsKorLive=(port)=>{
    return kor_live_port_list.includes(port);
}
const IsNaqLive=(port)=>{
    return naq_live_port_list.includes(port);
}
const IsTestLive=(port)=>{
    return (port === TEST_LIVE);
}

const IsFetchBoy=(fetchboy)=>{
    return (fetchboy == 'fetchboy');
}

const IsMainFetchBoy=(port, fetchboy)=>{
    return (port == KOR_LIVE_PORT || port == TEST_LIVE && fetchboy == 'fetchboy');
}

const IsSubFetchBoy=(port, fetchboy)=>{
    return (port != KOR_LIVE_PORT && port != TEST_LIVE && fetchboy == 'fetchboy');
}

// TELEGRAM
const botid = '6720540604:AAGWJk4s2tf-J3Zx6cZa_1MUBFswcC1BvWI'                  // 일반방
const botidMaintenance = '7190824539:AAGGoqcvcqBUnDmCX3__5kH_1I06pcRt5LY';      // 점검방 : 
const botidSellBuy = {real:'7666842456:AAHfQgYY-2x6_rmWYJZgyG_sERhKSxT5_Zw',    // 매매방 : buy, sell
                      mock:'7047087343:AAGZrnIGINtWpFEY2gl2EzT9wcinZieRPqs'};   
const botidErrorMessage = '7657276281:AAEKCX-CI3OzkMiU78T6EN_A-2yKjA5ZcAc'      // 에러방 : shutdown
const chatid ='66528728';
const maintenance_chatid ='-4526474288';
const guestchatid = '-1002187621749';
const paperchatid = '-5024634452';
const realchatid = '-5180854699';

module.exports = {
    highorderCount,
    // loworderprocessCount,
    idcurl,
    flaskserver,
    KOR_LIVE_PORT,
    NAQ_LIVE_PORT,
    IsKorLive,
    IsNaqLive,
    IsTestLive,
    IsFetchBoy,
    IsMainFetchBoy,
    IsSubFetchBoy,
    // TELEGRAM
    botid,
    botidMaintenance,
    botidSellBuy,
    botidErrorMessage,
    chatid,
    maintenance_chatid,
    guestchatid,
    paperchatid,
    realchatid,
};