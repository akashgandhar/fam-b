import mongoose from 'mongoose';
import { stringType, booleanType, numberType, dateType } from './common/commonTypes.js';

const ProductSchema = new mongoose.Schema({
    _id: stringType,
    imageUrl: stringType,
    price: numberType,
    description: stringType,
    type: stringType,
    name: stringType,
    createdAt: dateType,
    updatedAt: dateType,
    __v: numberType
});

const OrderSchema2 = new mongoose.Schema({
    orderId: stringType,
    receiptId: stringType,
    shiprocket: {
        orderId: stringType,
        shipmentId: stringType,
        awbCode: stringType
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cart: [ProductSchema], // Array of products
    address: {
        email: stringType,
        name: stringType,
        lastName: stringType,
        city: stringType,
        pincode: numberType,
        state: stringType,
        phone: stringType,
        country: stringType,
        street: stringType
    },
    paymentType: stringType,
    payment: booleanType,
    totalPrice: numberType,
    status: stringType,
    reference: stringType,
    complete: booleanType,
    isDeleted: booleanType,
    createdAt: dateType,
    updatedAt: dateType
}, { timestamps: true });

const OrderModel2 = mongoose.model('OrderModel2', OrderSchema2);

export default { OrderModel2 };