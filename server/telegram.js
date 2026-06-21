const {defulatConfig} = require('./util');
const axios = require ('axios');
const {    
    botid,
    botidMaintenance,
    botidSellBuy,
    botidErrorMessage,
    chatid,
    maintenance_chatid,
    guestchatid,
    paperchatid,
    realchatid
} = require('./consts')
let _loginid = ''
//let oldeditmsgtime = 0;
//let editmsgmaxcool = 3;
let editmsgarrs = [];
let savededitmessage = ''
let g_shellExecutemsg = [];
const GetPreMSG=()=>{
    return `[${_loginid}] `
}

const GetChatID=()=>{
    return defulatConfig.ismock ? paperchatid : realchatid;
}

const TelegramAPI = 
{
    ExecuteProcess(){
        // return;
        const executeSeconds = 4.0//1.5;
        setInterval(() => {
            if(g_shellExecutemsg.length <= 0)
                return;
            
            const excutemsg = g_shellExecutemsg.shift();
            if(!excutemsg.url || !excutemsg.formData)
                return;

            axios.post((excutemsg.url), excutemsg.formData).then(res=>{
                if(excutemsg.Callback && typeof excutemsg.Callback === 'function')
                    excutemsg.Callback(res);
            }).catch(function (error) {
                console.log(error.toJSON());
            });

        }, executeSeconds * 1000);
    },
    SetPrevMSG(loginid){
        _loginid = loginid;

        TelegramAPI.ExecuteProcess();
    },
    SendMessage(message, botidentity, _chatid){
        let chat_id = botidentity===botidMaintenance ? maintenance_chatid : chatid;
        if(_chatid)
            chat_id = _chatid;
        
        const curDate = new Date();
        const datestring = TelegramAPI.DateToString(curDate);
        const sendmessage = `${GetPreMSG()}${message}`;
        const formData = {
            parse_mode:'HTML',
            chat_id:chat_id,
            text:sendmessage
        }

        const ProcessThen=(res)=>{
            let json = res.data;
            if(json['ok'])
            {
                let result = json['result'];
                let message_id = result['message_id'];
                editmsgarrs[message] = message_id;
            }
            else
            {
                console.log(`ProcessThen Err ${json}`)
            }
        }

        g_shellExecutemsg.push({
            url:`https://api.telegram.org/bot${botidentity ? botidentity : botid}/sendMessage`, 
            formData:formData,
            Callback:ProcessThen,
        })
    },

    EditMessageText(sourmessage, destmessage, botidentity, _chatid){
        const keymsg = sourmessage.split('-')[1];
        // const listupmsg = 'Daily ListUp';
        //const destmessage = `${header}\n${body}`;
        if(savededitmessage===destmessage)
        {
            console.log('SAME REQUEST RETURN');
            return;
        }
            
        let message_id = editmsgarrs[sourmessage];        
        if(!message_id || message_id === '')        
        {
            // console.log('WATING GET SendMessage Request');
            return;        
        }   
        
        savededitmessage = destmessage;
        let chat_id = botidentity===botidMaintenance ? '-4526474288' : chatid;
        if(_chatid)
            chat_id = _chatid;

        const curDate = new Date();        
        const datestring = TelegramAPI.DateToString(curDate);
        const sendmessage = `${GetPreMSG()}${savededitmessage}`;
        const formData = {
            parse_mode:'HTML',
            chat_id:chat_id,
            text:sendmessage,
            message_id:message_id,
        }     
        
  
        if(destmessage.includes(keymsg))
        {
            // 출처가 sendmessage이거나 다른그룹의 메시지 ( ex. 현재 nasdaq인데, kospi 메시지인경우 ) 만 전송. 나머지는 삭제
            filteredLst = g_shellExecutemsg.filter((element)=> !element.formData.message_id || !element.formData.text.includes(keymsg))
            g_shellExecutemsg = filteredLst;
        }

        g_shellExecutemsg.push({
            url:`https://api.telegram.org/bot${botidentity ? botidentity : botid}/editMessageText`, 
            formData:formData,
            Callback:(res)=>{},
        })
    },

    SendMessageSellBuy(header, body){
        let _chatid = GetChatID();
        let botidSB = defulatConfig.ismock ? botidSellBuy['mock'] : botidSellBuy['real'];
        // if(!defulatConfig.ismock)
        // {
        //     _chatid = '';
        // }

        TelegramAPI.SendMessage(header+body,  botidSB, _chatid);
        // TelegramAPI.SendMessage(header, body, botid, true);
        // TelegramAPI.SendMessage(header+body, botidSellBuy, guestchatid);
    },

    SendMessageErrorMSG(header, body){
        const _chatid = GetChatID();
        TelegramAPI.SendMessage(header+body, botidErrorMessage, _chatid);
        // TelegramAPI.SendMessage(header, body, botid, true);
    },    

    DateToString(date){        
        return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,0)}-${date.getDate().toString().padStart(2,0)} ${date.toLocaleTimeString()}`;
    }
}

module.exports = TelegramAPI;