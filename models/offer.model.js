import mongoose from 'mongoose';
import { numberType, stringType, dateType, couponType } from './common/commonTypes.js';
const OfferSchema = mongoose.model('offers', new mongoose.Schema({
    discountType        : couponType,
    discountAmount      : numberType,
    oneTimeUsed         : numberType,
    code                : stringType,
    minimumAmount       : numberType,
    startDate           : dateType,
    endDate             : dateType,
    isShowTopBar        : numberType,
    status              : numberType    
},
{ 
    timestamps: true 
}))

export { OfferSchema };
