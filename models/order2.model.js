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
    data: {
      type: Object,
      required: true,
    },
  }, { timestamps: true });

const OrderModel2 = mongoose.model('OrderModel2', OrderSchema2);

export default { OrderModel2 };