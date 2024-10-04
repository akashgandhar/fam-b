import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // Import uuid to generate unique filename

import ejs from 'ejs';
import { UserSchema } from '../../models/user.model.js';
import { OrderSchema } from '../../models/order.model.js';
import { PromoSchema } from '../../models/promo.model.js';
import moment from 'moment';
import {
    createErrorResponse,
    createSuccessResponse,
    encodeRequest,
    generateOrderId,
    generateOtp,
    generatePromoCode,
    generateToken,
    parseToMongoObjectID,
    signRequest,
    decodeStringToBase64
} from '../../helpers/utils.js';
import { statusCode } from '../../constant/statusCode.js';
import { messages } from '../../constant/message.js';
import { fileUplaodOnFirebase } from '../../helpers/firebaseHelper.js';
import { PromoOfferSchema } from '../../models/promoOffer.model.js';
import { calculateGrandTotal, calculateShippingWeight } from '../../helpers/mongooseHelper.js';
import { mailSender } from '../../helpers/mailHelper.js';
import { ContentSchema } from '../../models/content.model.js';
import { doPayment } from '../../helpers/stripe.js';
import { sendSMS } from '../../helpers/sms.js';
import { doShipment } from '../../helpers/shipment.js';
import { invoiceLogger, orderLogger } from '../../config/logger.js';
import { OfferSchema } from '../../models/offer.model.js';
import { createHash } from 'crypto';
import axios from 'axios';
import { DiscountSchema } from '../../models/discount.model.js';
import { doPaymentOnPhonePay, doPaymentPhonePay } from '../../helpers/phonePay.js';

import { fileURLToPath } from 'url';
import { uploadOnCloudinary } from '../../helpers/cloudnary.js';
import { url } from '../../helpers/backendUrl.js';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const CONTACT_US_EMAIL = process.env.CONTACT_US_EMAIL;


export const signUpWithSocial = async (req, res) => {
    const { data, loginType } = req.body;
    const { email, id, name, picture, deviceType, deviceToken } = data;
    const existUser = await UserSchema.findOne({ socialId: id });
    if (existUser) {
        const { _id, socialId, address } = existUser;
        existUser['deviceType'] = deviceType;
        existUser['deviceToken'] = deviceToken;
        existUser['loginType'] = loginType;
        existUser['email'] = email;
        if (picture) existUser['profile'] = picture;
        if (name) existUser['name'] = name;
        await existUser.save();
        const token = generateToken({ _id, socialId, deviceType, deviceToken, type: "user" })
        return res.status(statusCode.success).json(createSuccessResponse(messages.loginSuccess, { _id, token, socialId, name: existUser['name'], email, profile: existUser['profile'], loginType, address }))
    } else {
        const newData = Object.assign({});
        let address = Object.assign({});
        newData['socialId'] = id;
        newData['deviceType'] = deviceType;
        newData['deviceToken'] = deviceToken;
        newData['loginType'] = loginType;
        newData['email'] = email;
        if (picture) newData['profile'] = picture;
        if (name) newData['name'] = name;
        address['name'] = name.split(' ')[0] ?? '';
        address['lastName'] = name.split(' ')[1] ?? '';
        address['email'] = email;
        newData['address'] = address
        UserSchema(newData).save()
            .then(newUser => {
                const { socialId, name, email, profile, _id, address } = newUser;
                const token = generateToken({ _id, socialId, deviceType, deviceToken, type: "user" })
                return res.status(statusCode.success).json(createSuccessResponse(messages.loginSuccess, { _id, token, socialId, name, email, loginType, profile, address }))
            }).catch(error => {
                return res.status(statusCode.error).json(createErrorResponse(error?.message))
            })
    }
}

export const signUpWithPhone = async (req, res) => {
    const { number } = req.body;
    let existUser = await UserSchema.findOne({ number: number });
    if (!existUser) {
        let loginType = "phone";
        let name = "user"
        existUser = await new UserSchema({ number, loginType, name }).save();
    }
    const otp = generateOtp();
    sendSMS(`${number}`, otp)
        .then(async data => {
            existUser.otp = otp
            await existUser.save()
            return res.status(statusCode.success).json(createSuccessResponse(messages.otpSent))
        })
        .catch(err => {
            return res.status(statusCode.error).json(createSuccessResponse(err?.messages))
        })
}

export const verifyLogin = async (req, res) => {
    const { number, otp } = req.body;
    let verifyUser = await UserSchema.findOne({ number: number });
    if (verifyUser.otp == otp) {
        verifyUser.otp = null;
        await verifyUser.save()
        const { socialId, name, email, profile, _id, loginType, address, number } = verifyUser;
        const token = generateToken({ _id, socialId, deviceType: null, deviceToken: null, type: "user" })
        return res.status(statusCode.success).json(createSuccessResponse(messages.loginSuccess, { _id, token, socialId, name, email, loginType, profile, address, number }))
    }
    else {
        return res.status(statusCode.success).json(createErrorResponse(messages.otpNotMatch))
    }
}

export const profile = async (req, res) => {
    const { socialId, name, email, profile, _id, loginType, number } = req.user
    console.log(req.user, number);
    return res.status(statusCode.success).json(createSuccessResponse(messages.loginSuccess, { _id, socialId, name, email, profile, loginType, number }))
}

export const updateProfile = async (req, res) => {

    let { name, lastName, email, city, pincode, state, country, phone, street } = req.body;
    const address = Object.assign({});
    address['email'] = req.user.email;
    address['name'] = name;
    address['lastName'] = lastName;
    name = name + ' ' + lastName;

    if (req.user.loginType != 'phone') {
        address["phone"] = phone;
    }
    if (req.user.loginType == 'phone') {
        address["email"] = email;
    }

    // address['phone']        = req.user.number;
    address['city'] = city;
    address['pincode'] = pincode;
    address['state'] = state;
    address['country'] = country;
    address['street'] = street;

    try {
        let user = await UserSchema.findById(req.user._id);
        if (user) {
            user.address = address;
            user.name = name;
            if (req.user.loginType != 'phone') {
                user.number = phone;
            }
            if (req.user.loginType == 'phone') {
                user.email = email;
            }
            await user.save()
            return res.status(statusCode.success).json(createSuccessResponse(messages.updateProfile, user))
        }
        else {
            return res.status(statusCode.error).json(createSuccessResponse(messages?.userNotFound))
        }
    } catch (err) {
        return res.status(statusCode.error).json(createSuccessResponse(err?.messages))
    }

}

export const fileUpload = async (req, res) => {
    const files = req.files;
    if (files.length > 0) {
        const allPromises = [];
        for (let i of files) allPromises.push(fileUplaodOnFirebase(i))
        Promise.all(allPromises)
            .then(success => {
                return res.status(statusCode.success).json(createSuccessResponse(messages.fileUploadSuccess, success))
            }).catch(error => {
                return res.status(statusCode.error).json(createErrorResponse(error?.message))
            })
    } else return res.status(statusCode.error).json(createErrorResponse(messages.selectFile))
}

export const placeOrder = async (req, res) => {
    const { promo, products, token } = req.body;
    if (products.length > 0) {
        const orderFunc = async (promoDetail) => {
            const receiptId = generateOrderId();
            const grandTotal = await calculateGrandTotal(products, promoDetail?.offer)
            const { totalCost } = grandTotal;
            if (totalCost > 0) {
                doPayment(totalCost, token, 'Buy Frames', receiptId)
                    .then(async success => {
                        console.log('success', success)
                        await OrderSchema({
                            orderId: success?.id,
                            receiptId,
                            promo: promoDetail ? promoDetail._id : null,
                            cart: products,
                            user: req.user._id,
                            totalPrice: totalCost
                        }).save();
                        req.body = {
                            orderId: success?.id,
                            status: true,
                            data: success
                        }
                        orderStatusController(req, res)
                    })
                    .catch(err => {
                        console.log('err', err)
                        return res.status(statusCode.error).json(createErrorResponse(err.message))
                    })
            } else {
                await OrderSchema({
                    orderId: receiptId,
                    receiptId,
                    promo: promoDetail ? promoDetail._id : null,
                    cart: products,
                    user: req.user._id,
                    totalPrice: totalCost
                }).save();
                return res.status(statusCode.success).json(createSuccessResponse(messages.orderPlaced, { isFree: true, id: receiptId }))
            }
        }
        if (promo) {
            const checkPromo = await PromoSchema.findOne({ code: promo, isExpire: null }).populate('offer');
            if (!checkPromo) return res.status(statusCode.error).json(createErrorResponse(messages.wrongPromo))
            else orderFunc(checkPromo);
        } else orderFunc();
    } else return res.status(statusCode.error).json(createErrorResponse(messages.cartEmpty))
}
export const placeOrderPhonePay = async (req, res) => {
    const { promo, products, coupon, address, paymentType, refrence } = req.body;
    if (products.length > 0) {
        const orderFunc = async (promoDetail, couponV, couponErr = '') => {
            const grandTotal = await calculateGrandTotal(products, promoDetail?.offer, couponV, couponErr)
            const { totalCost } = grandTotal;

            if (totalCost > 0) {
                let status = paymentType == 'offline' ? 1 : 0;
                const order = await OrderSchema({ promo: promoDetail ? promoDetail._id : null, coupon: couponV ? couponV._id : null, payment: 0, cart: products, user: req.user._id, totalPrice: totalCost, address, paymentType, complete: status, refrence }).save();
                if (paymentType == 'offline') {
                    if (couponV?.oneTimeUsed == 1) {
                        couponV.status = 0
                        await couponV.save()
                    }
                    await freeOrderShipMent(order, 'COD')
                    return res.status(statusCode.success).json(createSuccessResponse(messages.orderPlaced, { isFree: true, id: order._id }))
                }
                else {
                    
                    doPaymentPhonePay(totalCost, order._id)
                        .then(async (response) => {
                            return res.status(statusCode.success).json(createSuccessResponse(messages.paymentInitiate, response.data))
                        })
                        .catch(err => {
                            console.log('err', err)
                            return res.status(statusCode.error).json(createErrorResponse(err.message))
                        })
                }
            } else {
                if (couponV?.oneTimeUsed == 1) {
                    couponV.status = 0
                    await couponV.save()
                }
                const order = await OrderSchema({
                    promo: promoDetail ? promoDetail._id : null,
                    cart: products,
                    user: req.user._id,
                    totalPrice: totalCost,
                    address: address,
                    payment: true,
                    paymentType: 'online',
                    coupon: couponV ? couponV._id : null,
                    complete: true,
                    refrence
                }).save();
                await freeOrderShipMent(order)
                return res.status(statusCode.success).json(createSuccessResponse(messages.orderPlaced, { isFree: true, id: order._id }))
            }
        }
        if (promo) {
            const checkPromo = await PromoSchema.findOne({ code: promo, isPayment: true, isExpire: null }).populate('offer');
            if (!checkPromo) return res.status(statusCode.error).json(createErrorResponse(messages.wrongPromo))
            else orderFunc(checkPromo);
        }
        else if (coupon) {
            let checkCoupon = await OfferSchema.findOne({ code: coupon });
            let couponErr = ''
            console.log(checkCoupon)
            if (checkCoupon && checkCoupon.status == 0) {
                checkCoupon = false;
                couponErr = "The coupon is currently inactive or has expired."
            }
            if (checkCoupon && checkCoupon.startDate > new Date()) {
                checkCoupon = false;
                couponErr = "Coupon is not active yet"
            }
            if (checkCoupon && checkCoupon.endDate < new Date()) {
                checkCoupon = false;
                couponErr = "Coupon is expired"
            }
            let promo = null;
            orderFunc(promo, checkCoupon, couponErr)
        }
        else orderFunc();
    } else return res.status(statusCode.error).json(createErrorResponse(messages.cartEmpty))
}

async function freeOrderShipMent(checkOrder, type = "Prepaid") {
    const frames = await DiscountSchema.findOne();
    let offer = '';
    if (checkOrder?.promo) {
        let promo = await PromoSchema.findOne({ _id: checkOrder?.promo }).populate('offer');
        if (promo) {
            if (promo.offer) offer = promo.offer;
        }
    }
    let coupon = '';
    if (checkOrder?.coupon) {
        let checkCoupon = await OfferSchema.findOne({ _id: checkOrder?.coupon });
        if (checkCoupon) {
            coupon = checkCoupon
        }
    }
    // let val = Math.ceil(checkOrder?.cart?.length / 4) * 700;
    let unit = Math.ceil(checkOrder?.cart?.length / 4) == 0 ? 1 : Math.ceil(checkOrder?.cart?.length / 4);
    // let weight = await calculateShippingWeight(val)
    // console.log(weight,"weight");
    // prince 
    let weight = await calculateShippingWeight(checkOrder?.cart?.length)
    console.log(weight, "weight");
    const orderPayload = {
        order_id: checkOrder?._id,
        order_date: moment().add(5, 'hour').format('YYYY-MM-DD HH:mm'),
        pickup_location: "Home-2",
        company_name: "Family Vibes",
        billing_customer_name: checkOrder?.address?.name,
        billing_last_name: checkOrder?.address?.lastName,
        billing_address: checkOrder?.address?.street,
        billing_city: checkOrder?.address?.city,
        billing_pincode: checkOrder?.address?.pincode,
        billing_state: checkOrder?.address?.state,
        billing_country: checkOrder?.address?.country,
        billing_email: checkOrder?.address?.email,
        billing_phone: checkOrder?.address?.phone,
        shipping_is_billing: 1,
        order_items: [
            {
                name: "Frames",
                sku: "001",
                units: unit,
                selling_price: frames?.framePrice,
                discount: 0
            }
        ],
        payment_method: type,
        sub_total: checkOrder?.totalPrice,
        length: 20,
        breadth: 20,
        height: 2.5 * checkOrder?.cart?.length,
        weight: weight
    }
    orderLogger.info('New order', { payload: orderPayload, orderId: checkOrder._id, userId: checkOrder.user })
    doShipment(orderPayload)
        .then(async shipment => {
            if (shipment.success) {
                await OrderSchema.updateOne({ _id: checkOrder._id }, {
                    shiprocket: {
                        orderId: shipment?.data?.response?.data?.order_id,
                        shipmentId: shipment?.data?.response?.data?.shipment_id,
                        awbCode: shipment?.data?.response?.data?.awb_code
                    }
                });
                const grandTotalInfo = await calculateGrandTotal(checkOrder.cart, offer, coupon)
                let discount = grandTotalInfo?.promo ? grandTotalInfo?.promo?.discount : grandTotalInfo?.coupon ? grandTotalInfo?.coupon : 0;

                fs.readFile('html/invoice.html', 'utf-8', async (err, data) => {
                    if (err) {
                        console.log(err)
                    }
                    else {
                        let images = "";
                        images += checkOrder?.cart.map((item) => {


                            // const imageLink = `data:image/jpeg;base64,${fileData}`;
                            let ImageLink = `${url}/public/products/${item.frame}`


                            // 'http://localhost:8000/public/offer/1705637051401-171788312.webp';
                            return '<img src="' + ImageLink + '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
                        }).join("")
                        console.log(images, "imaages===============================================")
                        let couponVal = grandTotalInfo?.couponN ? `[${grandTotalInfo?.couponN}]` : ''
                        let templete = data
                            .replace(/CLIENT_NAME/g, checkOrder?.address?.name + " " + checkOrder?.address?.lastName)
                            .replace(/TOTAL_COST/g, "₹ " + checkOrder?.totalPrice)
                            .replace(/INVOICE_DATE/g, moment().format('MM/DD/YYYY'))
                            .replace(/CLIENT_ADDRESS/g, checkOrder?.address?.street)
                            .replace(/CITY/g, checkOrder?.address?.city)
                            .replace(/STATE/g, checkOrder?.address?.state)
                            .replace(/COUNTRY/g, checkOrder?.address?.country)
                            .replace(/PINCODE/g, checkOrder?.address?.pincode)
                            .replace(/INVOICE_NUMBER/g, checkOrder?._id)
                            .replace(/QUANTITY/g, checkOrder?.cart?.length)
                            .replace(/GST_VAL/g, grandTotalInfo?.gst)
                            .replace(/FRAME_COST/g, "₹ " + grandTotalInfo?.framePrice)
                            .replace(/ACTUAL_COST/g, "₹ " + grandTotalInfo?.framePrice * checkOrder?.cart?.length)
                            .replace(/SUB_TOTAL/g, "₹ " + grandTotalInfo?.cost)
                            .replace(/DISCOUNT_CH/g, "₹ " + discount + couponVal)
                            .replace(/SHIPPING_CHARGES/g, grandTotalInfo?.shippingCharges > 0 ? "₹ " + grandTotalInfo?.shippingCharges : "Free")
                            .replace(/IMAGES/g, images)
                            .replace(/PAID_AMOUNT/g, checkOrder?.paymentType == 'offline' ? 'UNPAID' : 'PAID')
                            .replace(/PAYMENT_MODE/g, checkOrder?.paymentType == 'offline' ? 'OFFLINE' : 'ONLINE')
                            .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))

                        mailSender([checkOrder?.address?.email, CONTACT_US_EMAIL], "Inovice", templete)
                            .then(success => {
                                console.log('sucess', success)
                                invoiceLogger.info('Success', { payload: orderPayload, orderId: checkOrder._id })
                            })
                            .catch(err => {
                                console.log('error', err)
                                invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, error: err?.message })
                            })
                    }
                })
                return true
            } else {
                return false
            }
        })
        .catch(error => {
            return false
        })
}

export const orderCompleteController = async (req, res) => {

    const { response } = req.body
    const decodeString = decodeStringToBase64(response)
    const frames = await DiscountSchema.findOne();
    const { code } = decodeString;
    if (code === 'PAYMENT_SUCCESS') {
        const { data } = decodeString
        const { merchantTransactionId, paymentInstrument } = data
        const checkOrder = await OrderSchema.findOne({ _id: merchantTransactionId, isDeleted: null })
        if (!checkOrder) return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
        if (paymentInstrument) checkOrder['data'] = JSON.stringify(paymentInstrument);
        checkOrder['payment'] = 1;
        checkOrder['complete'] = 1;
        await checkOrder.save();
        let offer = '';
        if (checkOrder?.promo) {
            let promo = await PromoSchema.findOne({ _id: checkOrder?.promo }).populate('offer');
            if (promo) {
                if (promo.offer) offer = promo.offer;
                promo['isExpire'] = new Date();
                await promo.save();
            }
        }
        let coupon = '';
        if (checkOrder?.coupon) {
            let checkCoupon = await OfferSchema.findOne({ _id: checkOrder?.coupon });
            if (checkCoupon) {
                coupon = checkCoupon
                checkCoupon.status = 0
                await checkCoupon.save()
            }
        }
        let val = Math.ceil(checkOrder?.cart?.length / 4) * 700;
        let unit = Math.ceil(checkOrder?.cart?.length / 4) == 0 ? 1 : Math.ceil(checkOrder?.cart?.length / 4);
        // let weight = await calculateShippingWeight(val)
        let weight = await calculateShippingWeight(checkOrder?.cart?.length)
        console.log(weight, "oy pase hop");
        const orderPayload = {
            order_id: checkOrder?._id,
            order_date: moment().add(5, 'hour').format('YYYY-MM-DD HH:mm'),
            pickup_location: "Home-2",
            company_name: "Family Vibes",
            billing_customer_name: checkOrder?.address?.name,
            billing_last_name: checkOrder?.address?.lastName,
            billing_address: checkOrder?.address?.street,
            billing_city: checkOrder?.address?.city,
            billing_pincode: checkOrder?.address?.pincode,
            billing_state: checkOrder?.address?.state,
            billing_country: checkOrder?.address?.country,
            billing_email: checkOrder?.address?.email,
            billing_phone: checkOrder?.address?.phone,
            shipping_is_billing: 1,
            order_items: [
                {
                    name: "Frames",
                    sku: "001",
                    units: unit,
                    selling_price: frames?.framePrice,
                    discount: 0
                }
            ],
            payment_method: "Prepaid",
            sub_total: checkOrder?.totalPrice,
            length: 20,
            breadth: 20,
            height: 2.5 * checkOrder?.cart?.length,
            weight: weight
        }

        orderLogger.info('New order', { payload: orderPayload, orderId: checkOrder._id, userId: checkOrder.user })
        doShipment(orderPayload)
            .then(async shipment => {
                if (shipment.success) {
                    await OrderSchema.updateOne({ _id: checkOrder._id }, {
                        shiprocket: {
                            orderId: shipment?.data?.response?.data?.order_id,
                            shipmentId: shipment?.data?.response?.data?.shipment_id,
                            awbCode: shipment?.data?.response?.data?.awb_code
                        }
                    });
                    const grandTotalInfo = await calculateGrandTotal(checkOrder.cart, offer, coupon)
                    let discount = grandTotalInfo?.promo ? grandTotalInfo?.promo?.discount : grandTotalInfo?.coupon ? grandTotalInfo?.coupon : 0;

                    fs.readFile('html/invoice.html', 'utf-8', async (err, data) => {
                        if (err) invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id, error: err?.message })
                        else {
                            let images = "";
                            images += checkOrder?.cart.map((item) => {
                                let ImageLink = `${url}/public/products/${item.frame}`

                                return '<img src="' + ImageLink + '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
                            }).join("")
                            let couponVal = grandTotalInfo?.couponN ? `[${grandTotalInfo?.couponN}]` : ''
                            let totalprice_ = (grandTotalInfo?.framePrice * checkOrder?.cart?.length) + grandTotalInfo?.shippingCharges;
                            let templete = data
                                .replace(/CLIENT_NAME/g, checkOrder?.address?.name + " " + checkOrder?.address?.lastName)
                                .replace(/TOTAL_COST/g, "₹ " + checkOrder?.totalPrice)
                                .replace(/INVOICE_DATE/g, moment().format('MM/DD/YYYY'))
                                .replace(/CLIENT_ADDRESS/g, checkOrder?.address?.street)
                                .replace(/CITY/g, checkOrder?.address?.city)
                                .replace(/STATE/g, checkOrder?.address?.state)
                                .replace(/COUNTRY/g, checkOrder?.address?.country)
                                .replace(/PINCODE/g, checkOrder?.address?.pincode)
                                .replace(/INVOICE_NUMBER/g, checkOrder?._id)
                                .replace(/QUANTITY/g, checkOrder?.cart?.length)
                                .replace(/GST_VAL/g, grandTotalInfo?.gst)
                                .replace(/FRAME_COST/g, "₹ " + grandTotalInfo?.framePrice)
                                .replace(/ACTUAL_COST/g, "₹ " + grandTotalInfo?.framePrice * checkOrder?.cart?.length)
                                .replace(/SUB_TOTAL/g, "₹ " + grandTotalInfo?.cost)
                                .replace(/DISCOUNT_CH/g, "₹ " + discount + couponVal)
                                .replace(/SHIPPING_CHARGES/g, grandTotalInfo?.shippingCharges > 0 ? "₹ " + grandTotalInfo?.shippingCharges : "Free")
                                .replace(/IMAGES/g, images)
                                .replace(/PAID_AMOUNT/g, checkOrder?.paymentType == 'offline' ? 'UNPAID' : 'PAID')
                                .replace(/PAYMENT_MODE/g, checkOrder?.paymentType == 'offline' ? 'OFFLINE' : 'ONLINE')
                                .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))

                            mailSender([checkOrder?.address?.email, CONTACT_US_EMAIL], "Inovice", templete)
                                .then(success => {
                                    console.log('sucess', success)
                                    invoiceLogger.info('Success', { payload: orderPayload, orderId: checkOrder._id })
                                })
                                .catch(err => {
                                    console.log('error', err)
                                    invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, error: err?.message })
                                })
                        }
                    })
                    return res.status(statusCode.success).json(createSuccessResponse(messages.orderStatus))
                } else {
                    return res.status(statusCode.error).json(createErrorResponse(shipment?.message))
                }
            })
            .catch(error => {
                return res.status(statusCode.error).json(createErrorResponse(error?.message))
            })
    }
    else return res.status(statusCode.success).json(createSuccessResponse(messages.orderStatus))
}
export const myOrders = async (req, res) => {
    let { offset, limit } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 10
    const aggregation = [
        {
            $match: {
                complete: true,
                isDeleted: null,
                user: parseToMongoObjectID(req.user._id)
            }
        },
        {
            $lookup: {
                from: 'promos',
                let: { 'promoId': '$promo' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ['$_id', '$$promoId']
                            }
                        }
                    },
                    {
                        $project: {
                            code: 1,
                            type: 1,
                            discount: 10,
                            user: 1
                        }
                    }
                ],
                as: 'promo'
            }
        },
        {
            $unwind: {
                path: '$promo',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                totalPrice: 1,
                orderId: 1,
                _id: 1,
                receiptId: 1,
                user: 1,
                cart: 1,
                promo: { $cond: ['$promo', '$promo', null] },
                createdAt: 1,
                shiprocket: 1,
                status: 1
            }
        },
        { $sort: { createdAt: -1 } },
        { $skip: offset },
        { $limit: limit }
    ]
    const orders = await OrderSchema.aggregate(aggregation);
    return res.status(statusCode.success).json(createSuccessResponse(messages.ordersFetch, orders))
}

export const myGifts = async (req, res) => {
    let { offset, limit } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 10
    const aggregation = [
        {
            $match: {
                isPayment: true,
                user: parseToMongoObjectID(req.user._id)
            }
        },
        {
            $lookup: {
                from: 'promooffers',
                localField: "offer",
                foreignField: "_id",
                as: 'offer'
            }
        },
        {
            $unwind: {
                path: '$offer',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                code: 1,
                _id: 1,
                isExpire: 1,
                user: 1,
                offer: 1,
                createdAt: 1,
                senderEmail: 1,
                email: 1,
                isPayment: 1
            }
        },
        { $sort: { createdAt: -1 } },
        { $skip: offset },
        { $limit: limit }
    ]
    const promos = await PromoSchema.aggregate(aggregation);
    return res.status(statusCode.success).json(createSuccessResponse(messages.giftsFetch, promos))
}

export const viewAddress = async (req, res) => {
    return res.status(statusCode.success).json(createSuccessResponse(messages.viewAddress, req.user.address))
}

export const addAddress = async (req, res) => {
    const { email, name, country, street, phone, lastName, city, pincode, state } = req.body;
    req.user.address = {
        email: email ? email : null,
        name: name ? name : null,
        country: country ? country : null,
        street: street ? street : null,
        phone: phone ? phone : null,
        lastName: lastName ? lastName : null,
        city: city ? city : null,
        pincode: pincode ? pincode : null,
        state: state ? state : null,
    }
    await req.user.save();
    return res.status(statusCode.success).json(createSuccessResponse(messages.addressUpdated))
}

export const getPromoOrderId = async (req, res) => {
    const { id, token, email } = req.body;
    const checkOffer = await PromoOfferSchema.findOne({ _id: id });
    if (checkOffer) {
        const code = generatePromoCode();
        doPayment(checkOffer.discount, token, 'Buy Promo', code)
            .then(async success => {
                req.body = {
                    email,
                    id,
                    data: success
                }
                buyPromo(req, res)
            })
            .catch(err => {
                return res.status(statusCode.error).json(createErrorResponse(err.message))
            })
    } else return res.status(statusCode.error).json(createErrorResponse(messages.promoNotFound))
}

//arun
export const buyPromoOrderId = async (req, res) => {
    const { id, email, mobileNumber } = req.body;
    const checkOffer = await PromoOfferSchema.findOne({ _id: id });
    if (checkOffer) {
        const code = generatePromoCode();
        const userEmail = req.user.email;

        const promo = { code, email, senderEmail: userEmail, mobileNumber , user: req.user._id, offer: id, isPayment: 0 }
        const data = await new PromoSchema(promo).save();
        doPaymentOnPhonePay(checkOffer.discount, data._id)
            .then(async (response) => {
                return res.status(statusCode.success).json(createSuccessResponse(response.data))
            })
            .catch(err => {
                return res.status(statusCode.error).json(createErrorResponse(err.message))
            })
    } else return res.status(statusCode.error).json(createErrorResponse(messages.promoNotFound))
}

export const testingEmail = async (req, res) => {
    const checkOrder = await OrderSchema.findOne({ _id: "65047d1f1ae3b61e5af6bed9", isDeleted: null })
    fs.readFile('html/invoice.html', 'utf-8', async (err, data) => {
        if (err) invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id, error: err?.message })
        else {

            let images = "";
            images += checkOrder?.cart.map((item) => {
                let ImageLink = `${url}/public/products/${item.frame}`

                return '<img src="' + ImageLink + '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
            }).join("")


            let templete = data
                .replace(/CLIENT_NAME/g, checkOrder?.address?.name)
                .replace(/TOTAL_COST/g, checkOrder?.totalPrice)
                .replace(/INVOICE_DATE/g, moment().format('MM/DD/YYYY'))
                .replace(/CLIENT_ADDRESS/g, checkOrder?.address?.street)
                .replace(/CITY/g, checkOrder?.address?.city)
                .replace(/STATE/g, checkOrder?.address?.state)
                .replace(/COUNTRY/g, checkOrder?.address?.country)
                .replace(/PINCODE/g, checkOrder?.address?.pincode)
                .replace(/INVOICE_NUMBER/g, checkOrder?._id)
                .replace(/QUANTITY/g, checkOrder?.cart?.length)
                .replace(/ACTUAL_COST/g, 20)
                .replace(/DISCOUNT/g, 20)
                .replace(/SHIPPING_CHARGES/g, 20)
                .replace(/IMAGES/g, images)
                .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))

            mailSender("arunbeatum40@gmail.com", "Inovice", templete)
                .then(success => console.log('success'))
                .catch(err => invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id, error: err?.message }))
        }
    })
}

export const completePromoOrderId = async (req, res) => {
    const { response } = req.body
    const decodeString = decodeStringToBase64(response)
    const { code } = decodeString;
    if (code === 'PAYMENT_SUCCESS') {
        const { data } = decodeString
        const payment = { transactionId: data.transactionId, paymentInstrument: data.paymentInstrument }
        const promo = await PromoSchema.findOne({ _id: data?.merchantTransactionId });
        promo.isPayment = 1;
        promo.data = JSON.stringify(payment);
        promo.save()
        const { email, senderEmail: userEmail, offer } = promo
        const checkOffer = await PromoOfferSchema.findOne({ _id: offer });
        fs.readFile('html/promo.html', 'utf-8', async (err, data) => {
            if (err) return res.status(statusCode.error).json(createErrorResponse(messages.mailNotSent))
            else {
                let templete = data.replace(/COUPON/g, promo?.code)
                    .replace(/SENDEREMAIL/g, userEmail)
                    .replace(/FRAMES/g, checkOffer?.noOfFrames)
                    .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
                mailSender(email, "Promos", templete)
                    .then(success => {
                        if (userEmail !== email) {
                            fs.readFile('html/promoCopy.html', 'utf-8', async (err, data) => {
                                if (!err) {
                                    let templete = data.replace(/EMAIL/g, userEmail)
                                        .replace(/RECEIVER/g, email)
                                        .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
                                    mailSender(userEmail, "Promos", templete)
                                        .then(success => console.log('promo copy success'))
                                        .catch(err => console.log(err?.message))
                                }
                            })
                        }
                    })
                    .catch(err => { return res.status(statusCode.error).json(createErrorResponse(err?.message)) })
            }
        })

    }
    else return res.status(statusCode.error).json(createErrorResponse(messages.promoNotFound))
}


export const buyPromo = async (req, res) => {
    const { email, id, data } = req.body;
    const checkOffer = await PromoOfferSchema.findOne({ _id: id });
    if (checkOffer) {
        const code = generatePromoCode();
        const userEmail = req.user.email;
        const promo = { code, email, offer: id }
        if (data) promo['data'] = JSON.stringify(data)
        fs.readFile('html/promo.html', 'utf-8', async (err, data) => {
            if (err) return res.status(statusCode.error).json(createErrorResponse(messages.mailNotSent))
            else {
                await new PromoSchema(promo).save();
                let templete = data.replace(/EMAIL/g, email)
                    .replace(/PROMO/g, code)
                    .replace(/FRAMES/g, checkOffer.noOfFrames)
                    .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
                mailSender(email, "Promos", templete)
                    .then(success => {
                        if (userEmail !== email) {
                            fs.readFile('html/promoCopy.html', 'utf-8', async (err, data) => {
                                if (!err) {
                                    let templete = data.replace(/EMAIL/g, userEmail)
                                        .replace(/RECEIVER/g, email)
                                        .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
                                    mailSender(userEmail, "Promos", templete)
                                        .then(success => console.log('promo copy success'))
                                        .catch(err => console.log(err?.message))
                                }
                            })
                        }
                        return res.status(statusCode.success).json(createSuccessResponse(messages.promoPurchased))
                    })
                    .catch(err => { return res.status(statusCode.error).json(createErrorResponse(err?.message)) })
            }
        })
    } else return res.status(statusCode.error).json(createErrorResponse(messages.promoNotFound))
}

export const promoValidity = async (req, res) => {
    const { promo } = req.body;
    const checkPromo = await PromoSchema.findOne({ code: promo, isExpire: null });
    return res.status(statusCode.success).json(createSuccessResponse(messages.promoStatus, { isValid: checkPromo ? true : false }))
}

export const promoList = async (req, res) => {
    const { promo } = req.body;
    const promos = await PromoOfferSchema.find().select('noOfFrames discount')
    return res.status(statusCode.success).json(createSuccessResponse(messages.promoFetch, promos))
}

export const offerList = async (req, res) => {
    const { promo } = req.body;
    const promos = await PromoOfferSchema.find().select('noOfFrames discount')
    return res.status(statusCode.success).json(createSuccessResponse(messages.promoFetch, promos))
}

// export const checkOrderPrice = async (req, res) => {
//     const { promo, products, coupon } = req.body;
//     if (products.length > 0) {
//         const orderFunc = async (promoDetail, coupon, couponErr = '') => {
//             const grandTotal = await calculateGrandTotal(products, promoDetail?.offer, coupon, couponErr)
//             console.log('grandTotal', grandTotal)
//             return res.status(statusCode.success).json(createSuccessResponse(messages.orderCheck, grandTotal))
//         }
//         if (promo) {
//             const checkPromo = await PromoSchema.findOne({ code: promo, isExpire: null }).populate('offer');
//             if (!checkPromo) return res.status(statusCode.error).json(createErrorResponse(messages.wrongPromo))
//             else orderFunc(checkPromo);
//         }
//         else if (coupon) {
//             let checkCoupon = await OfferSchema.findOne({ code: coupon });
//             let couponErr = ''
//             if (checkCoupon && checkCoupon.status == 0) {
//                 checkCoupon = false;
//                 couponErr = "The coupon is currently inactive or has expired."
//             }
//             if (checkCoupon && checkCoupon.startDate > new Date()) {
//                 checkCoupon = false;
//                 couponErr = "Coupon is not active"
//             }
//             if (checkCoupon && checkCoupon.endDate < new Date()) {
//                 checkCoupon = false;
//                 couponErr = "Coupon is expired"
//             }

//             let promo = null;
//             orderFunc(promo, checkCoupon, couponErr)
//         }
//         else orderFunc();
//     } else return res.status(statusCode.error).json(createErrorResponse(messages.cartEmpty))
// }

export const getBasicInfo = async (req, res) => {
    const webInfo = await ContentSchema.aggregate([
        {
            $lookup: {
                from: 'faqs',
                pipeline: [
                    {
                        $project: {
                            answer: 1,
                            question: 1
                        }
                    }
                ],
                as: 'faq'
            }
        },
        {
            $lookup: {
                from: 'testimonials',
                pipeline: [
                    {
                        $project: {
                            media: 1,
                            text: 1,
                            createdAt: 1
                        }
                    }
                ],
                as: 'testimonial'
            }
        },
        {
            $lookup: {
                from: 'promoOffers',
                pipeline: [
                    {
                        $project: {
                            noOfFrames: 1,
                            discount: 1
                        }
                    }
                ],
                as: 'promoOffer'
            }
        },
        {
            $lookup: {
                from: 'discounts',
                pipeline: [
                    {
                        $project: {
                            freeDeliveryPrice: 1,
                            shippingCharge: 1,
                            framePrice: 1,
                            siteOfferPrice: 1,
                            siteOfferDiscount: 1
                        }
                    }
                ],
                as: 'discount'
            }
        },
        {
            $lookup: {
                from: 'offers',
                pipeline: [
                    {
                        "$match": {
                            "$and": [
                                {
                                    "isShowTopBar": 1
                                },
                                {
                                    "startDate": { $lte: new Date() }
                                },
                                {
                                    "endDate": { $gte: new Date() }
                                }
                            ]
                        }
                    },
                    {
                        $project: {
                            discountType: 1,
                            discountAmount: 1,
                            code: 1,
                            minimumAmount: 1,
                            startDate: 1,
                            endDate: 1
                        }
                    }
                ],
                as: 'offer'
            }
        },
        {
            $lookup: {
                from: 'popups',
                pipeline: [
                    {
                        $project: {
                            coupon: 1,
                            line1: 1,
                            line2: 1,
                            line3: 1,
                            image1: 1,
                            image2: 1
                        }
                    }
                ],
                as: 'popup'
            }
        },
        {
            $unwind: {
                path: '$popup',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $lookup: {
                from: 'homepages',
                pipeline: [
                    {
                        $project: {
                            firstContent: 1,
                            secondContent: 1,
                            thirdContent: 1,
                            forthContent: 1,
                            fifthContent: 1,
                            sixthContent: 1,
                            reviewHeading: 1,
                            workSection: 1,
                            instragram: 1,
                            twitter: 1,
                            facebook: 1,
                            youTube: 1,
                            pinterest: 1,
                            meta_tag: 1,
                            meta_description: 1,
                            popup: 1,
                            youTubeLink1:1,
                            youTubeLink2:1,
                            youTubeLink3:1,
                        }
                    }
                ],
                as: 'homepage'
            }
        },
        {
            $unwind: {
                path: '$homepage',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                content: {
                    term: '$term',
                    privacy: '$privacy'
                },
                discount: 1,
                homepage: 1,
                promoOffers: 1,
                offer: 1,
                faq: 1,
                testimonial: 1,
                popup: 1
            }
        }
    ])
    console.log(webInfo,"webInfo");

    return res.status(statusCode.success).json(createSuccessResponse(messages.webInfo, webInfo[0]))
}

export const orderStatusController = async (req, res) => {
    const { orderId, status, data } = req.body;
    const address = req.user.address;
    if (address?.email && address?.name && address?.lastName && address?.city && address?.pincode && address?.state && address?.phone && address?.country && address?.street) {
        const checkOrder = await OrderSchema.findOne({ orderId, user: req.user._id, isDeleted: null });
        if (!checkOrder) return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
        else {
            if (data) checkOrder['data'] = JSON.stringify(data);
            checkOrder['payment'] = status;
            await checkOrder.save();
            if (status) {
                let offer = '';
                if (checkOrder?.promo) {
                    let promo = await PromoSchema.findOne({ _id: checkOrder?.promo }).populate('offer');
                    if (promo) {
                        if (promo.offer) offer = promo.offer;
                        promo['isExpire'] = new Date();
                        await promo.save();
                    }
                }
                const orderPayload = {
                    order_id: checkOrder?.orderId,
                    order_date: moment().add(5, 'hour').format('YYYY-MM-DD HH:mm'),
                    pickup_location: "Home-2",
                    company_name: "Family Vibes",
                    billing_customer_name: address?.name,
                    billing_last_name: address?.lastName,
                    billing_address: address?.street,
                    billing_city: address?.city,
                    billing_pincode: address?.pincode,
                    billing_state: address?.state,
                    billing_country: address?.country,
                    billing_email: address?.email,
                    billing_phone: address?.phone,
                    shipping_is_billing: 1,
                    order_items: [
                        {
                            name: "Frames",
                            sku: "001",
                            units: checkOrder?.cart?.length || 1,
                            selling_price: "299",
                            discount: 0
                        }
                    ],
                    payment_method: "Prepaid",
                    sub_total: checkOrder?.totalPrice,
                    length: 20,
                    breadth: 20,
                    height: 2.5 * checkOrder?.cart?.length,
                    weight: 1
                }
                orderLogger.info('New order', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id })
                doShipment(orderPayload)
                    .then(async shipment => {
                        if (shipment.success) {
                            await OrderSchema.updateOne({ _id: checkOrder._id }, {
                                shiprocket: {
                                    orderId: shipment?.data?.response?.data?.order_id,
                                    shipmentId: shipment?.data?.response?.data?.shipment_id,
                                    awbCode: shipment?.data?.response?.data?.awb_code
                                }
                            });
                            const grandTotalInfo = await calculateGrandTotal(checkOrder.cart, offer)

                            fs.readFile('html/invoice.html', 'utf-8', async (err, data) => {
                                if (err) invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id, error: err?.message })
                                else {
                                    let templete = data
                                        .replace(/CLIENT_NAME/g, address?.name)
                                        .replace(/TOTAL_COST/g, checkOrder?.totalPrice)
                                        .replace(/INVOICE_DATE/g, moment().format('MM/DD/YYYY'))
                                        .replace(/CLIENT_ADDRESS/g, address?.street)
                                        .replace(/CITY/g, address?.city)
                                        .replace(/STATE/g, address?.state)
                                        .replace(/COUNTRY/g, address?.country)
                                        .replace(/PINCODE/g, address?.pincode)
                                        .replace(/INVOICE_NUMBER/g, orderId)
                                        .replace(/QUANTITY/g, checkOrder?.cart?.length)
                                        .replace(/ACTUAL_COST/g, grandTotalInfo?.framePrice * checkOrder?.cart?.length)
                                        .replace(/DISCOUNT/g, (grandTotalInfo?.framePrice * checkOrder?.cart?.length + grandTotalInfo?.shippingCharges) - checkOrder?.totalPrice)
                                        .replace(/SHIPPING_CHARGES/g, grandTotalInfo?.shippingCharges)
                                        .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
                                    mailSender([address?.email, CONTACT_EMAIL], "Inovice", templete)
                                        .then(success => invoiceLogger.info('Success', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id }))
                                        .catch(err => invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id, error: err?.message }))
                                }
                            })
                            return res.status(statusCode.success).json(createSuccessResponse(messages.orderStatus))
                        } else {
                            return res.status(statusCode.error).json(createErrorResponse(shipment?.message))
                        }
                    })
                    .catch(error => {
                        return res.status(statusCode.error).json(createErrorResponse(error?.message))
                    })
            } else return res.status(statusCode.success).json(createSuccessResponse(messages.orderStatus))
        }
    } else return res.status(statusCode.error).json(createErrorResponse(messages.completeAddress))
}

export const sendOtp = async (req, res) => {
    const { phone } = req.body;
    const otp = generateOtp();
    req.user.otp = otp;
    sendSMS(`${phone}`, otp)
        .then(async data => {
            await req.user.save();
            return res.status(statusCode.success).json(createSuccessResponse(messages.otpSent))
        })
        .catch(err => {
            return res.status(statusCode.error).json(createSuccessResponse(err?.messages))
        })
}

export const verifyOtp = async (req, res) => {
    const { otp } = req.body;
    if (req.user.otp == otp) {
        req.user.otp = null;
        await req.user.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.otpVerify))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.otpNotMatch))
}

export const contactUs = async (req, res) => {
    const { firstName, lastName, phone, email, message } = req.body;
    fs.readFile('html/contact.html', 'utf-8', async (err, data) => {
        if (err) return res.status(statusCode.error).json(createErrorResponse(messages.mailNotSent))
        else {
            let templete = data.replace(/FIRST_NAME/g, firstName)
                .replace(/LAST_NAME/g, lastName)
                .replace(/PHONE/g, phone)
                .replace(/EMAIL/g, email)
                .replace(/MESSAGE/g, message)
                .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
            mailSender(CONTACT_US_EMAIL, "Contact Us", templete)
                .then(success => {
                    return res.status(statusCode.success).json(createSuccessResponse(messages.contactSuccess))
                })
                .catch(err => { return res.status(statusCode.error).json(createErrorResponse(err?.message)) })
        }
    })

}



export const phonePayPaymentInitiate = async (req, res) => {
    const mainBody = {
        "merchantId": process.env.phonePayMerchant,
        "merchantTransactionId": "MT7850590068188404",
        "merchantUserId": "MUID123",
        "amount": req.body.amount,
        "redirectUrl": "https://localhost:8000/v1/api/user/payment/redirect_url",
        "redirectMode": "REDIRECT",
        "callbackUrl": "https://blood-donation.rapidekops.in/api/custom-hook",
        "paymentInstrument": {
            "type": "PAY_PAGE"
        }
    }
    const base64 = encodeRequest(mainBody)
    let sign = base64 + "/pg/v1/pay" + 1;
    const X_VERIFY = signRequest(sign) + "###" + process.env.phonePaySaltKey;
    const body = {
        "request": base64
    };
    const options = {
        method: 'POST',
        url: process.env.phonePayUrl,
        data: body,
        headers: { accept: 'application/json', 'Content-Type': 'application/json', 'X-VERIFY': X_VERIFY }
    };
    return axios
        .request(options)
        .then(function (response) {
            return res.status(statusCode.success).json(createSuccessResponse(response.data))
        })
        .catch(function (error) {
            return res.status(statusCode.error).json(createErrorResponse(error))
        });
}

export const paymentRedirectUrl = async (req, res) => {
    console.log(req)
    const { body } = req
    const { code, merchantId, transactionId, amount, providerReferenceId } = body;
    console.log("redirect Url ===> ", code, merchantId, transactionId, amount, providerReferenceId)


    // if(code === 'PAYMENT_SUCCESS') {

    // }

    //  console.log('requet1->',res)
    //  console.log('requet2->',res.ServerResponse)
    // console.log('responce->',res)
    return res.status(statusCode.success).json(createSuccessResponse(res))
}

export const paymentCompleteStatus = (req, res) => {
    const { response } = req.body
    if (response) {
        const decodeString = decodeStringToBase64(response)
        console.log(decodeString)
    }


    return res.status(statusCode.success).json(createSuccessResponse(req.body))

}


export const phoneCheckStatus = (req, res) => {
    const { transactionId } = req.body
    const endpoint = TRANSACTION_ENDPOINT + "/" + merchantId + "/" + transactionId;
    const sign = endpoint + saltKey;
    const X_VERIFY = signRequest(sign) + "###" + saltIndex;
    const X_MERCHANT_ID = merchantId
    const options = {
        method: 'GET',
        url: endpoint,
        headers: { accept: 'application/json', 'X-VERIFY ': X_VERIFY, 'X-MERCHANT-ID': X_MERCHANT_ID }
    };
    return axios
        .request(options)
        .then(function (response) {
            return res.status(statusCode.success).json(createSuccessResponse(response.data))
        })
        .catch(function (error) {
            return res.status(statusCode.error).json(createErrorResponse(error))
        });
}

export const orderInvoice = async (req, res) => {
    if (!req.user.email) {
        return res.status(statusCode.error).json(createErrorResponse("Please add email address to send the copy of this invoice"))
    }
    const email = req.user.email
    const checkOrder = await OrderSchema.findOne({ _id: req.body.order_id, isDeleted: null })
    if (!checkOrder) return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
    let offer = '';
    if (checkOrder?.promo) {
        let promo = await PromoSchema.findOne({ _id: checkOrder?.promo }).populate('offer');
        if (promo) {
            if (promo.offer) offer = promo.offer;
        }
    }
    let coupon = '';
    if (checkOrder?.coupon) {
        let checkCoupon = await OfferSchema.findOne({ _id: checkOrder?.coupon });
        if (checkCoupon) {
            coupon = checkCoupon
        }
    }
    const grandTotalInfo = await calculateGrandTotal(checkOrder.cart, offer, coupon)
    let discount = grandTotalInfo?.promo ? grandTotalInfo?.promo?.discount : grandTotalInfo?.coupon ? grandTotalInfo?.coupon : 0;
    fs.readFile('html/invoice.html', 'utf-8', async (err, data) => {
        if (err) invoiceLogger.error('Error', { payload: orderPayload, orderId: checkOrder._id, userId: req.user._id, error: err?.message })
        else {
            let images = "";
            images += checkOrder?.cart.map((item) => {
                let ImageLink = `${url}/public/products/${item.frame}`

                return '<img src="' + ImageLink + '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
            }).join("")
            let couponVal = grandTotalInfo?.couponN ? `[${grandTotalInfo?.couponN}]` : ''
            let totalprice_ = (grandTotalInfo?.framePrice * checkOrder?.cart?.length) + grandTotalInfo?.shippingCharges;
            let templete = data
                .replace(/CLIENT_NAME/g, checkOrder?.address?.name + " " + checkOrder?.address?.lastName)
                .replace(/TOTAL_COST/g, "₹ " + checkOrder?.totalPrice)
                .replace(/INVOICE_DATE/g, moment().format('MM/DD/YYYY'))
                .replace(/CLIENT_ADDRESS/g, checkOrder?.address?.street)
                .replace(/CITY/g, checkOrder?.address?.city)
                .replace(/STATE/g, checkOrder?.address?.state)
                .replace(/COUNTRY/g, checkOrder?.address?.country)
                .replace(/PINCODE/g, checkOrder?.address?.pincode)
                .replace(/INVOICE_NUMBER/g, checkOrder?._id)
                .replace(/QUANTITY/g, checkOrder?.cart?.length)
                .replace(/GST_VAL/g, grandTotalInfo?.gst)
                .replace(/FRAME_COST/g, "₹ " + grandTotalInfo?.framePrice)
                .replace(/ACTUAL_COST/g, "₹ " + grandTotalInfo?.framePrice * checkOrder?.cart?.length)
                .replace(/SUB_TOTAL/g, "₹ " + grandTotalInfo?.cost)
                .replace(/DISCOUNT_CH/g, "₹ " + discount + couponVal)
                .replace(/SHIPPING_CHARGES/g, grandTotalInfo?.shippingCharges > 0 ? "₹ " + grandTotalInfo?.shippingCharges : "Free")
                .replace(/IMAGES/g, images)
                .replace(/PAID_AMOUNT/g, checkOrder?.paymentType == 'offline' ? 'UNPAID' : 'PAID')
                .replace(/PAYMENT_MODE/g, checkOrder?.paymentType == 'offline' ? 'OFFLINE' : 'ONLINE')
                .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))

            mailSender([email], "Inovice", templete)
                .then(success => {
                    console.log('sucess', success)
                })
                .catch(err => {
                    console.log('error', err)
                })
            return res.status(statusCode.success).json(createSuccessResponse("order invoice send"))
        }
    })
}

export const orderInfo = async (req, res) => {
    const order = await OrderSchema.findById(req.body.id)
    return res.status(statusCode.success).json(createSuccessResponse(messages.orderInfo, order))
}


export const giftInfo = async (req, res) => {
    const gift = await PromoSchema.findById(req.body.id);
    return res.status(statusCode.success).json(createSuccessResponse(messages.giftInfo, gift))
}

//prince

// export const uploadPhoto = async (req, res) => {
//     // let url = uploadOnCloudinary(req.file.path)
//     const avatarLocalPath = req.files?.file?.[0]?.filename;
//     // console.log(req.files?.file?.[0])
//     if (!avatarLocalPath) {
//         res.status(400).json("Not Uploaded")
//     }
//     const outputFile = path.join(path.dirname(req.files?.file?.[0]?.path), `${path.basename(req.files?.file?.[0]?.path, path.extname(req.files?.file?.[0]?.path))}.webp`);


//     console.log(req.files?.file?.[0]?.path);
//     sharp(req.files?.file?.[0]?.path)
//         .toFormat('webp')
//         .toFile(outputFile,async  (err, info) => {
//             if (err) {
//                 console.error('Error converting image:', err);
//                 res.status(500).json({ error: 'Error converting image' });
//             } else {
//                 // Delete the original JPEG file
//                 const absoluteFilePath = path.join(__dirname, '..', '..', req.files?.file?.[0]?.path)
//                 console.log(absoluteFilePath);
//                 fs.access(absoluteFilePath, (err) => {
//                     if (err) {
//                         return res.status(404).json({ error: 'File not found at the specified path.' });

//                     } else {
//                         fs.unlink(absoluteFilePath, (err) => {
//                             console.log(err);
//                             if (err) return res.status(400).json({ error: 'Error unlinking file.' })

//                             res.json({ message: 'Image converted to WebP successfully!', outputFile });


//                         });
//                     }
//                 });


//                 console.log('Deleted:', req.files?.file?.[0]?.path);
//             }
//         });


//     // const url = sharp(req.file.buffer)
//     //     .toFormat('webp')
//     //     .toBuffer()
//     //     .then((data) => {
//     //         req.file.buffer = data; // Update the buffer with the WebP data
//     //         return res.status(200).json(avatarLocalPath)

//     //     })
//     //     .catch((err) => {
//     //         return res.status(500).send('Error processing file.');
//     //     });
//     // const url = await uploadOnCloudinary(avatarLocalPath);


// }
export const uploadPhoto = async (req, res) => {
    try {
        const inputFile = req.files?.file?.[0];


        const inputFilePath = inputFile.path;
        const outputFile = path.join(`${path.basename(inputFilePath, path.extname(inputFilePath))}.webp`);


        return res.status(200).json(outputFile)
    } catch (error) {
        console.error('Error converting image:', error);
        res.status(500).json({ error: 'Error converting image.' });
    }
};




export const unlinkPhoto = async (req, res) => {
    try {
        // Assuming the file path is sent in the request body as { "filePath": "/path/to/file" }
        const { filePath, folderName = "products" } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'File path is required in the request body.' });
        }
        const absoluteFilePath = path.join(__dirname, '..', '..', 'public', folderName, filePath)

        console.log(absoluteFilePath)

        fs.access(absoluteFilePath, (err) => {
            if (err) {
                return res.status(404).json({ error: 'File not found at the specified path.' });

            } else {
                fs.unlink(absoluteFilePath, (err) => {
                    console.log(err);
                    if (err) return res.status(400).json({ error: 'Error unlinking file.' })
                    return res.json({ success: true, message: `File at path ${absoluteFilePath} has been unlinked successfully.` });

                });
            }
        });


        // Respond with a success message
    } catch (error) {
        // Handle errors and respond with an error message
        console.error('Error unlinking file:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};


export const Confirmation = async (req, res) => {
    try {
        // Validate the incoming request body
        if (!req.body || !req.body.number || !req.body.orderNo) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const { number, orderNo } = req.body;

        // Basic validation for phone number format and order number existence
        if (!(number) || !(orderNo)) {
            return res.status(400).json({ error: "Invalid phone number or order number" });
        }

        const options = {
            method: 'POST',
            url: 'https://control.msg91.com/api/v5/flow/',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authkey: process.env.SMS_AUTH_KEY
            },
            data: {
                template_id: '65e16b44d6fc0505a83eab72',
                short_url: '0',
                recipients: [{ mobiles: number, order: orderNo }] // Fix the structure of recipients
            }
        };

        const response = await axios.request(options);
        console.log(response.data);
        res.status(200).json({ message: "Confirmation sent successfully" }); // Respond with success message
    } catch (error) {
        
            res.status(500).json({ error: error.message });
        
    }
};





