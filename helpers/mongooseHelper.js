import { DiscountSchema } from '../models/discount.model.js';

export const calculateGrandTotal = async (products, promoOffer, coupon, couponEr) => {
    const discountDetails = await DiscountSchema.findOne({});
    const promoDiscount = promoOffer?.discount ? promoOffer?.discount : 0;      
    if (discountDetails) {
        const { freeDeliveryPrice, shippingCharge, framePrice, siteOfferPrice, siteOfferDiscount, gst } = discountDetails;
        const couponDiscount = (products.length * framePrice) >= coupon?.minimumAmount ? coupon?.discountType == 'percentage' ? ((products.length * framePrice) * coupon?.discountAmount) / 100 : coupon?.discountAmount : 0;
        const couponErr = couponEr != '' ? couponEr : (products.length * framePrice) < coupon?.minimumAmount ? `You must add a minimum of ${coupon?.minimumAmount} to apply this coupon` : null;
        // const actualCost = (products.length * framePrice) > siteOfferPrice ? (framePrice * products.length) - (framePrice * products.length * (siteOfferDiscount) / 100) : products.length * framePrice;
        const couponN = coupon ? coupon?.code : null;
        const actualCost =  products.length * framePrice;
        const isShippingFree = actualCost > freeDeliveryPrice;
        const cost = isShippingFree ? actualCost : actualCost + shippingCharge
        const shippingC = isShippingFree ? 0 : shippingCharge
       
        let totalCost = cost >= promoDiscount ? cost - promoDiscount : 0;
        totalCost = totalCost -  couponDiscount < 0 ? 0 : totalCost -  couponDiscount;
        let discountAmount = cost < couponDiscount ? cost : couponDiscount;
        
       // let gstAmount = ((totalCost - shippingC) * gst) / 100 > 0 ? ((totalCost - shippingC) * gst) / 100 : 0;
        let gstAmount = ((totalCost  * gst) / (100 + gst)).toFixed(2)
       
       // totalCost = totalCost + gstAmount;
        return {
            framePrice,
            actualCost,
            promo: promoOffer ? promoOffer : null,
            coupon : couponDiscount,
            couponErr,
            couponN,
            discountAmount,
            isShippingFree,
            shippingCharges: isShippingFree ? 0 : shippingCharge,
            totalCost,
            cost,
            gst,
            isSiteOffer: (products.length * framePrice) > siteOfferPrice ? true : false,
            siteOfferDiscount
        }
    } else return false
}


export const calculateShippingWeight = async (numFrames) => {
    // weight = Math.max(0, Math.floor(weight));
    // const stepSize = 500;
    // const result = Math.ceil(weight / stepSize) * stepSize;  
    // return result / 1000;
    // prince
    const frameWeight = 175; // Weight of each frame in grams
    const totalWeight = numFrames * frameWeight;
    const totalWeightKg = totalWeight / 1000;
    const shipmentWeight = Math.ceil(totalWeightKg * 2) / 2;
    return shipmentWeight;
}

