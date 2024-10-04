import mongoose from 'mongoose';
import { stringType, emailType, numberType, joinSchema, booleanType, dateType } from './common/commonTypes.js';
const PromoSchema = mongoose.model('promos', new mongoose.Schema({
    code: stringType,
    data: stringType,
    offer: joinSchema('promoOffers'),
    user: joinSchema('users'),
    isExpire: dateType,
    isPayment : booleanType,
    email: emailType,
    senderEmail : emailType,
    mobileNumber : numberType,
    size: stringType,
}, { timestamps: true }))

export { PromoSchema };