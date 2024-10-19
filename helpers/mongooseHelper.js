import { DiscountSchema } from '../models/discount.model.js';
import FrameNumber from '../models/framenumber.model.js';
import  OrderModel2  from '../models/order2.model.js';

export const calculateGrandTotal = async (products, promoOffer, coupon, couponEr) => {
    const numberOfFrames = products.length;
    const discountDetails = await DiscountSchema.findOne({});
    const frames = await FrameNumber.findOne({ numberOfFrames });

    const promoDiscount = promoOffer?.discount ? promoOffer?.discount : 0;

    if (discountDetails) { // Check only discountDetails, not frames
        const { freeDeliveryPrice, shippingCharge, siteOfferPrice, siteOfferDiscount, gst } = discountDetails;

        // Access price from frames if it exists, otherwise from discountDetails
        const price = frames?.price || discountDetails.framePrice; // Assuming discountDetails has framePrice
        console.log('price:', price);

        const couponDiscount = (products.length * price) >= coupon?.minimumAmount
            ? coupon?.discountType == 'percentage'
                ? ((products.length * price) * coupon?.discountAmount) / 100
                : coupon?.discountAmount
            : 0;

        const couponErr = couponEr !== '' 
            ? couponEr 
            : (products.length * price) < coupon?.minimumAmount 
                ? `You must add a minimum of ${coupon?.minimumAmount} to apply this coupon`
                : null;

        const couponN = coupon ? coupon?.code : null;
        const actualCost = products.length * price;
        const isShippingFree = actualCost > freeDeliveryPrice;
        const cost = isShippingFree ? actualCost : actualCost + shippingCharge
        const shippingC = isShippingFree ? 0 : shippingCharge;

        let totalCost = cost >= promoDiscount ? cost - promoDiscount : 0;
        totalCost = totalCost - couponDiscount < 0 ? 0 : totalCost - couponDiscount;
        let discountAmount = cost < couponDiscount ? cost : couponDiscount;

        let gstAmount = (totalCost * (gst / 100));

        totalCost = totalCost + gstAmount;

        return {
            price,
            framePrice: frames?.price || discountDetails.framePrice,
            actualCost,
            promo: promoOffer ? promoOffer : null,
            coupon: couponDiscount,
            couponErr,
            couponN,
            discountAmount,
            isShippingFree,
            shippingCharges: isShippingFree ? 0 : shippingCharge,
            totalCost,
            cost,
            gstAmount,
            isSiteOffer: (products.length * price) > siteOfferPrice,
            siteOfferDiscount
        }
    } else {
        return false 
    }
}
export const calculateGrandTotalForProduct = async (products, promoOffer, coupon, couponEr) => {
   
    console.log("initiatingt calculateGrandTotalForProduct in mongooseHelper");
    console.log('products',products);
    console.log('products[0]._id',products._id);
    // const discountDetails = await DiscountSchema.findOne({});
    console.log('initiating FrameNumber.findOne')
    const product = await FrameNumber.findOne({_id:products._id});
    if(product){
        console.log("product found");
    }
    else{
        console.log("product not found");
    }
    // const promoDiscount = promoOffer?.discount ? promoOffer?.discount : 0;      
    if (product) {
        // const { freeDeliveryPrice, shippingCharge, siteOfferPrice, siteOfferDiscount, gst } = discountDetails;
        const { price } = product;
        const actualCost =  price;
        const gst = 18;
        
       let gstAmount = (price * (gst / 100));
       console.log('gstAmount',gstAmount);
       
       const totalCost = price + gstAmount;
         console.log('totalCost',totalCost);
         const discountAmount = 0;
         return {
            price,
            actualCost,
            discountAmount,
            gstAmount,
            totalCost,
         }
        // return {
        //     price,
        //     actualCost,
        //     // promo: promoOffer ? promoOffer : null,
        //     // coupon : couponDiscount,
        //     discountAmount,
        //     isShippingFree,
        //     shippingCharges: isShippingFree ? 0 : shippingCharge,
        //     totalCost,
        //     // cost,
        //     gstAmount,
        //     isSiteOffer: (products.length * price) > siteOfferPrice ? true : false,
        //     // siteOfferDiscount
        // }
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

