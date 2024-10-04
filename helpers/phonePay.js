import axios from 'axios';
import {  encodeRequest,  signRequest, decodeStringToBase64 } from './utils.js';
const CHARGE_ENDPOINT = "/pg/v1/pay";
const saltIndex = process.env.live_phonePaySaltIndex
const saltKey = process.env.live_phonePaySaltKey
const TRANSACTION_ENDPOINT = process.env.live_phonePayUrl;
const merchantId = process.env.live_phonePayMerchant



export const doPaymentOnPhonePay = (amount, id) => {
    const mainBody = {
        "merchantId"            : merchantId,
        "merchantTransactionId" : id,
        "merchantUserId"        : "MUID123",
        "amount"                : amount * 100,
        "redirectUrl"           : "https://familyvibes.in/thank-you?type=gift-card",
        "redirectMode"          : "REDIRECT",
        "callbackUrl"           : "https://backend.familyvibes.in/v1/api/user/promo/payment/complete",
        "paymentInstrument"     : {
          "type"                : "PAY_PAGE"
        }
    } 
    const base64 = encodeRequest(mainBody)    
    let sign = base64 + CHARGE_ENDPOINT + saltKey;
    const X_VERIFY = signRequest(sign) + "###" +saltIndex;   
    const body = {
        "request" : base64
    };
    const options = {
        method: 'POST',
        url: TRANSACTION_ENDPOINT,
        data : body,
        headers: {accept: 'application/json', 'Content-Type': 'application/json', 'X-VERIFY': X_VERIFY}
    };   
    return axios.request(options);
}

export const doPaymentPhonePay = (amount, id) => {
    const mainBody = {
        "merchantId"            : merchantId,
        "merchantTransactionId" : id,
        "merchantUserId"        : "MUID123",
        "amount"                : amount * 100,
        "redirectUrl"           : "https://familyvibes.in/thank-you?type=order&&order_id="+id,
        "redirectMode"          : "REDIRECT",
        "callbackUrl"           : "https://backend.familyvibes.in/v1/api/user/order/complete",
        "paymentInstrument"     : {
          "type"                : "PAY_PAGE"
        }
    } 
    const base64 = encodeRequest(mainBody)    
    let sign = base64 + CHARGE_ENDPOINT + saltKey;
    const X_VERIFY = signRequest(sign) + "###" +saltIndex;   
    const body = {
        "request" : base64
    };
    const options = {
        method: 'POST',
        url: TRANSACTION_ENDPOINT,
        data : body,
        headers: {accept: 'application/json', 'Content-Type': 'application/json', 'X-VERIFY': X_VERIFY}
    };   
    return axios.request(options);
}
