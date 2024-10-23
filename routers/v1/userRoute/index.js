import express from "express";
const router = express.Router();

import asyncTryCatchMiddleware from "../../../middleware/async.js";
import { verifyUserJWTToken } from "../../../middleware/auth.js";
import validator from "../../../middleware/validator.js";
import { uploadP } from "../../../middleware/multer.js";
import * as validationSchema from "./validation.js";

import { uploadMedia } from "../../../helpers/multer.js";
const upload = uploadMedia.array("file", 10);

import * as UserController from "../../../controller/v1/user.controller.js";
import { converter } from "../../../middleware/convertor.js";

router.post(
  "/social-login",
  validator(validationSchema.socialValidation),
  asyncTryCatchMiddleware(UserController.signUpWithSocial)
);
router.post("/login", asyncTryCatchMiddleware(UserController.signUpWithPhone));
router.post(
  "/verify-login",
  asyncTryCatchMiddleware(UserController.verifyLogin)
);

router.get(
  "/profile",
  verifyUserJWTToken,
  asyncTryCatchMiddleware(UserController.profile)
);
router.put(
  "/update/profile",
  verifyUserJWTToken,
  asyncTryCatchMiddleware(UserController.updateProfile)
);
router.post(
  "/upload",
  verifyUserJWTToken,
  upload,
  asyncTryCatchMiddleware(UserController.fileUpload)
);

// router.post('/order/book', verifyUserJWTToken, validator(validationSchema.orderValidation), asyncTryCatchMiddleware(UserController.placeOrder))

router.post(
  "/order/book",
  verifyUserJWTToken,
  validator(validationSchema.orderMainValidation),
  asyncTryCatchMiddleware(UserController.placeOrderPhonePay)
);
router.post(
  "/order/complete",
  asyncTryCatchMiddleware(UserController.orderCompleteController)
);

router.post(
  "/order/cost",
  verifyUserJWTToken,
  validator(validationSchema.orderCheckValidation),
  asyncTryCatchMiddleware(UserController.checkOrderPrice)
);
router.post(
  "/order/list",
  verifyUserJWTToken,
  validator(validationSchema.orderListValidation),
  asyncTryCatchMiddleware(UserController.myOrders)
);
router.post(
  "/order/promo/list",
  verifyUserJWTToken,
  validator(validationSchema.giftListValidation),
  asyncTryCatchMiddleware(UserController.myGifts)
);
router.post(
  "/order/invoice",
  verifyUserJWTToken,
  validator(validationSchema.orderInvoiceValidation),
  asyncTryCatchMiddleware(UserController.orderInvoice)
);

router.post(
  "/order/info",
  validator(validationSchema.idValidation),
  asyncTryCatchMiddleware(UserController.orderInfo)
);
router.post(
  "/gift/info",
  validator(validationSchema.idValidation),
  asyncTryCatchMiddleware(UserController.giftInfo)
);

router.post(
  "/otp/send",
  verifyUserJWTToken,
  validator(validationSchema.sendOtpValidation),
  asyncTryCatchMiddleware(UserController.sendOtp)
);
router.post(
  "/otp/verify",
  verifyUserJWTToken,
  validator(validationSchema.verifyOtpValidation),
  asyncTryCatchMiddleware(UserController.verifyOtp)
);
router.get(
  "/address/view",
  verifyUserJWTToken,
  asyncTryCatchMiddleware(UserController.viewAddress)
);
router.put(
  "/address/edit",
  verifyUserJWTToken,
  validator(validationSchema.addAddressValidation),
  asyncTryCatchMiddleware(UserController.addAddress)
);

//router.post('/promo/orderId', verifyUserJWTToken, validator(validationSchema.buyPromoValidation), asyncTryCatchMiddleware(UserController.getPromoOrderId))

router.post(
  "/promo/orderId",
  verifyUserJWTToken,
  validator(validationSchema.buyPromoGiftValidation),
  asyncTryCatchMiddleware(UserController.buyPromoOrderId)
);
router.post(
  "/promo/payment/complete",
  asyncTryCatchMiddleware(UserController.completePromoOrderId)
);
router.post(
  "/promo/valid",
  verifyUserJWTToken,
  validator(validationSchema.promoValidValidation),
  asyncTryCatchMiddleware(UserController.promoValidity)
);
router.get("/promo/list", asyncTryCatchMiddleware(UserController.promoList));

router.get("/offer/list", asyncTryCatchMiddleware(UserController.promoList));

//payment
router.post(
  "/payment/initiate",
  asyncTryCatchMiddleware(UserController.phonePayPaymentInitiate)
);
router.get(
  "/payment/redirect_url",
  asyncTryCatchMiddleware(UserController.paymentRedirectUrl)
);
router.post(
  "/payment/complete",
  asyncTryCatchMiddleware(UserController.paymentCompleteStatus)
); //callback

router.post("/payment", asyncTryCatchMiddleware(UserController.phonePay));

router.get("/website", asyncTryCatchMiddleware(UserController.getBasicInfo));
router.post(
  "/contact",
  validator(validationSchema.contactValidation),
  asyncTryCatchMiddleware(UserController.contactUs)
);
router.post("/unlink-image", UserController.unlinkPhoto);

router.post(
  "/upload-frame",
  uploadP.fields([
    {
      name: "file",
      maxCount: 1,
    },
  ]),
  converter,
  UserController.uploadPhoto
);
router.post(
  "/order-confirm",
  verifyUserJWTToken,
  asyncTryCatchMiddleware(UserController.Confirmation)
);
// router.post('/order-confirm', asyncTryCatchMiddleware(UserController.Confirmation))

export { router };
