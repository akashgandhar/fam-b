import mongoose from 'mongoose';
import { stringType, booleanType, orderStatusType, cartType, numberType, joinSchema, dateType,addressType } from './common/commonTypes.js';
const OrderSchema = mongoose.model('orders', new mongoose.Schema({
    orderId: stringType,
    receiptId: stringType,
    shiprocket: {
        orderId: stringType,
        shipmentId: stringType,
        awbCode: stringType
    },
    coupon  : joinSchema('offers'),
    orderId: stringType,
    user: joinSchema('users'),
    cart: cartType,
    promo: joinSchema('promos'),
    paymentType : stringType, 
    payment: booleanType,
    totalPrice: numberType,
    data: stringType,
    address  : addressType,
    status: orderStatusType,
    refrence : stringType,
    complete : booleanType,
    isDeleted: dateType
}, { timestamps: true }))

export { OrderSchema };
