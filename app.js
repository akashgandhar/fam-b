import "./config/envirnoment.js";
import http from "http";
import https from "https";
import express from "express";
import mongoose from "mongoose";
import {
  createErrorResponse,
  createSuccessResponse,
  escapeSpecialCharacter,
  generateOrderId,
  generatePromoCode,
} from "./helpers/utils.js";
import router from "./routers/v1/index.js";
import cors from "cors";
import admin from "firebase-admin";
import { service } from "./integration/firebase.js";
import { statusCode } from "./constant/statusCode.js";
import { scheduleCron } from "./helpers/cron.js";
import { createAuth, doShipment } from "./helpers/shipment.js";
import Frame from "./models/size.model.js";
import Colors from "./models/color.modal.js";
import GiftCard from "./models/giftcard.modal.js";
import FrameNumber from "./models/framenumber.model.js";
import fs from "fs";
import { body, check, validationResult } from "express-validator";
import { v2 as cloudinary } from "cloudinary";
// import Busboy from 'busboy';
import multer from "multer";

import crypto from 'crypto';


const upload = multer({ dest: "uploads/" });
const CONTACT_US_EMAIL = process.env.CONTACT_US_EMAIL;

const mongoDB = process.env.MONGO_CONNECTION_URL;
mongoose.connect(mongoDB, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  useCreateIndex: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB successfully"));

const PORT = process.env.PORT;
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("Family Vibes Server is running");
});

createAuth();
scheduleCron();

admin.initializeApp({
  credential: admin.credential.cert(service),
  storageBucket: "gs://ecommerce-5769b.appspot.com",
});
export const bucket = admin.storage().bucket();

import "./config/dbSetup.js";
import { OrderSchema } from "./models/order.model.js";
import { messages } from "./constant/message.js";
import {
  calculateGrandTotal,
  calculateGrandTotalForProduct,
  calculateShippingWeight,
} from "./helpers/mongooseHelper.js";
import { doPaymentOnPhonePay, doPaymentPhonePay } from "./helpers/phonePay.js";
import { PromoSchema } from "./models/promo.model.js";
import { OfferSchema } from "./models/offer.model.js";
import asyncTryCatchMiddleware from "./middleware/async.js";
import { verifyUserJWTToken } from "./middleware/auth.js";
import * as validationSchema from "./routers/v1/userRoute/validation.js";
import validator from "./middleware/validator.js";
import { PromoOfferSchema } from "./models/promoOffer.model.js";
import  OrderModel2  from "./models/order2.model.js";
import { DiscountSchema } from "./models/discount.model.js";
import moment from "moment";
import { invoiceLogger, orderLogger } from "./config/logger.js";
import { mailSender } from "./helpers/mailHelper.js";
import { url } from "./helpers/backendUrl.js";
import GiftCardSize from "./models/giftcardsize.modal.js";
import GIftCard from "./models/giftcard.modal.js";
import { log } from "console";
import axios from "axios";

cloudinary.config({
  cloud_name: "dk2qptwnw",
  api_key: "934614925743276",
  api_secret: "S-WJyyUZils6hMbWYnr7YDLm4uc",
});

app.use("/public", express.static("public"));
app.use((req, res, next) => {
  if (req.body.offset && req.body.offset != "")
    req.body.offset = parseInt(req.body.offset);
  if (req.body.limit && req.body.limit != "")
    req.body.limit = parseInt(req.body.limit);
  if (req.body.search && req.body.search != "")
    req.body.search = escapeSpecialCharacter(req.body.search);

  next();
});

const server = http.createServer(app);
// const server = https.createServer(aoptions, app)
app.set("view engine", "ejs");
app.use("/v1/api/", router);
// app.use((req, res, next) => res.send('Family Vibes Server is running'));
app.use((err, req, res, next) => {
  if (err) {
    return res.status(statusCode.error).send(createErrorResponse(err?.message));
  } else next();
});

app.get("/getGiftCardFrames", async (req, res) => {
  try {
    const cardSize = await GiftCardSize.find({});
    res.status(200).json(cardSize);
  } catch (error) {
    res.status(500).json({ message: "Error fetching frames" });
  }
});

app.post("/updateGiftCardFrames", async (req, res) => {
  try {
    const { id, size } = req.body;
    const updatedFrame = await GiftCardSize.findByIdAndUpdate(
      id,
      {
        size,
      },
      { new: true }
    );
    if (!updatedFrame) {
      return res.status(404).json({ message: "Frame not found" });
    }
    res
      .status(200)
      .json({ message: "Frame updated successfully", updatedFrame });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/deleteGiftCardFrames/:id", async (req, res) => {
  try {
    const frameId = req.params.id;
    const deletedFrame = await GiftCardSize.findByIdAndDelete(frameId);
    if (!deletedFrame) {
      return res.status(404).json({ message: "Frame not found" });
    }
    res.status(200).json({ message: "Frame deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/addGiftCardFrames", async (req, res) => {
  try {
    const { size, price } = req.body;
    console.log("size", price);

    const newFrame = new GiftCardSize({ size, price });
    await newFrame.save();
    res.status(200).json({ message: "Frame size added successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/getAllFrames", async (req, res) => {
  try {
    const frames = await Frame.find({});
    res.status(200).json(frames);
  } catch (error) {
    res.status(500).json({ message: "Error fetching frames" });
  }
});
app.post("/updateFrame", async (req, res) => {
  try {
    const { id, size, colors } = req.body;
    console.log("colors", colors);
    const updatedFrame = await Frame.findByIdAndUpdate(
      id,
      { size: size, colors: colors ?? [] },
      { new: true }
    );
    if (!updatedFrame) {
      return res.status(404).json({ message: "Frame not found" });
    }
    res
      .status(200)
      .json({ message: "Frame updated successfully", updatedFrame });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.post("/addFrame", async (req, res) => {
  try {
    const { size, color } = req.body;
    const newFrame = new Frame({ size });
    await newFrame.save();
    res.status(200).json({ message: "Frame size added successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/getAllColors", async (req, res) => {
  try {
    const colors = await Colors.find({});
    res.status(200).json(colors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching frames" });
  }
});
app.post(
  "/updateColors",
  [
    body("id").isMongoId(),
    body("hex")
      .isString()
      .matches(/^#[0-9A-Fa-f]{6}$/), // Validate hex format
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id, hex } = req.body;
      const updatedColors = await Colors.findByIdAndUpdate(
        id,
        { hex },
        { new: true }
      ); // Update 'hex' field
      if (!updatedColors) {
        return res.status(404).json({ message: "Color not found" });
      }
      res
        .status(200)
        .json({ message: "Color updated successfully", updatedColors });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/addColors",
  [
    body("hex")
      .isString()
      .matches(/^#[0-9A-Fa-f]{6}$/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { color, hex } = req.body;
      const newColor = new Colors({ hex }); // Use 'hex' field
      await newColor.save();
      res.status(200).json({ message: "Color added successfully" });
    } catch (error) {
      console.error("Error adding color:", error);
      res.status(500).json({ message: "Error adding color" });
    }
  }
);

app.post("/addGiftCard", async (req, res) => {
  try {
    const { price, numberOfFrames } = req.body;
    const newGiftCard = new GiftCard({
      price,
      numberOfFrames,
    });
    await newGiftCard.save();
    res.status(201).json(newGiftCard);
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error adding gift card", error: error.message });
  }
});

app.post(
  "/updateGiftCard",
  [
    body("id").isMongoId(),
    body("price").optional().isNumeric(),
    body("numberOfFrames").optional().isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id, price, numberOfFrames } = req.body;
      let update = {};
      if (price !== undefined) update.price = price;
      if (numberOfFrames !== undefined) update.numberOfFrames = numberOfFrames;

      const updatedGiftCard = await GiftCard.findByIdAndUpdate(id, update, {
        new: true,
      });
      if (!updatedGiftCard) {
        return res.status(404).json({ message: "GiftCard not found" });
      }
      res
        .status(200)
        .json({ message: "GiftCard updated successfully", updatedGiftCard });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

app.get("/getAllGiftCards", async (req, res) => {
  try {
    const giftCards = await GiftCard.find({});
    res.status(200).json(giftCards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/deleteFrame/:id", async (req, res) => {
  try {
    const frameId = req.params.id;
    const deletedFrame = await Frame.findByIdAndDelete(frameId);
    if (!deletedFrame) {
      return res.status(404).json({ message: "Frame not found" });
    }
    res.status(200).json({ message: "Frame deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Color route
app.delete("/deleteColor/:id", async (req, res) => {
  try {
    const colorId = req.params.id;
    const deletedColor = await Colors.findByIdAndDelete(colorId);
    if (!deletedColor) {
      return res.status(404).json({ message: "Color not found" });
    }
    res.status(200).json({ message: "Color deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/deleteGiftCard/:id", async (req, res) => {
  try {
    const giftCardId = req.params.id;
    const deletedGiftCard = await GiftCard.findByIdAndDelete(giftCardId);
    if (!deletedGiftCard) {
      return res.status(404).json({ message: "GiftCard not found" });
    }
    res.status(200).json({ message: "GiftCard deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// const response = await axios.put(
//     `http://localhost:8000/addAdditionalImage/${frameNumberId}`,
//     { imageUrl: imgurl, index: currentImageLength }
//   );

app.post("/addAdditionalImage/:id", async (req, res) => {
  try {
    const { imageUrl, oldArray } = req.body;
    console.log("imageUrl:", imageUrl);

    const frameNumberId = req.params.id;

    console.log("frameNumberId:", frameNumberId);

    const frameNumber = await FrameNumber.findById(frameNumberId);
    console.log("frameNumber:", frameNumber);

    if (!frameNumber) {
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    console.log("oldArray:", oldArray);

    const updatedFrameNumber = await FrameNumber.findByIdAndUpdate(
      frameNumberId,
      {
        additionalImages: [
          ...oldArray,
          { url: imageUrl, index: oldArray?.length },
        ],
      },
      { new: true }
    );

    if (!updatedFrameNumber) {
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    res.status(200).json({
      message: "Additional image added successfully",
      updatedFrameNumber,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// const handleDeleteAdditionalImage = async (frameNumberId, index) => {
//     setIsLoading(true);
//     try {
//       const response = await axios.delete(
//         `http://localhost:8000/deleteAdditionalImage/${frameNumberId}/${index}`
//       );

//       setIsLoading(false);
//     } catch (error) {
//       console.error("Error deleting additional image:", error);
//       toast.error("Failed to delete additional image");
//       setIsLoading(false);
//     }
//     setIsLoading(false);
//   };

app.delete("/deleteAdditionalImage/:id/:index", async (req, res) => {
  try {
    const frameNumberId = req.params.id;
    const index = req.params.index;

    const frameNumber = await FrameNumber.findById(frameNumberId);

    if (!frameNumber) {
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    const updatedFrameNumber = await FrameNumber.findByIdAndUpdate(
      frameNumberId,
      {
        additionalImages: frameNumber.additionalImages.filter(
          (image, i) => i !== parseInt(index)
        ),
      },
      { new: true }
    );

    if (!updatedFrameNumber) {
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    res.status(200).json({
      message: "Additional image deleted successfully",
      updatedFrameNumber,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/addFrameNumber", upload.single("imageFile"), async (req, res) => {
  try {
    const {
      numberOfFrames,
      price,
      comparePrice,
      description,
      description2,
      type,
      name,
    } = req.body;

    // Access the uploaded file information
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    console.log("Uploaded image file:", imageFile);
    console.log("Number of frames:", numberOfFrames);
    console.log("Price:", price);
    console.log("Description:", description);
    console.log("Description:", description2);
    console.log("Type:", type);
    console.log("name:", name);

    // Upload image to Cloudinary
    console.log("Uploading image to Cloudinary...");
    const result = await cloudinary.uploader.upload(imageFile.path, {
      // Use imageFile.path
      folder: "frame_numbers",
    });
    console.log("Cloudinary upload result:", result);

    const newFrameNumber = new FrameNumber({
      imageUrl: result.secure_url,
      numberOfFrames,
      price,
      comparePrice,
      description,
      description2,
      type,
      name,
    });

    console.log("Saving new FrameNumber to database...");
    await newFrameNumber.save();
    console.log("FrameNumber saved successfully!");

    res.status(201).json(newFrameNumber);
  } catch (error) {
    console.error("Error adding frame number:", error);
    res
      .status(500)
      .json({ message: "Error adding frame number", error: error.message });
  }
});

// 2. Read (Get All) FrameNumbers
app.get("/getAllFrameNumbers", async (req, res) => {
  try {
    const fn = await FrameNumber.find({});
    res.status(200).json(fn);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/getFrameNumberById/:id", async (req, res) => {
  try {
    const frameNumberId = req.params.id;
    const frameNumber = await FrameNumber.findById(frameNumberId);

    if (!frameNumber) {
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    res.status(200).json(frameNumber);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. Update FrameNumber
app.put(
  "/updateFrameNumber/:id",
  [
    body("numberOfFrames").optional().isNumeric(),
    body("price").optional().isNumeric(),
  ],
  upload.single("imageFile"),
  async (req, res) => {
    console.log(
      "Received request to update FrameNumber with ID:",
      req.params.id
    );
    console.log("Request body:", req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const id = req.params.id; // Extract id from params
      const { numberOfFrames, price, comparePrice, description, description2 } =
        req.body;

      let update = {};
      if (numberOfFrames !== undefined) {
        update.numberOfFrames = numberOfFrames;
        console.log("Updating numberOfFrames to:", numberOfFrames);
      }
      if (price !== undefined) {
        update.price = price;
        console.log("Updating price to:", price);
      }
      if (comparePrice !== undefined) {
        update.comparePrice = comparePrice;
        console.log("Updating comparePrice to:", comparePrice);
      }
      if (description !== undefined) {
        update.description = description;
        console.log("Updating description to:", description);
      }
      if (description2 !== undefined) {
        update.description2 = description2;
        console.log("Updating description to:", description2);
      }

      // If a new image is uploaded, update Cloudinary image
      if (req.file) {
        console.log("New image uploaded. Uploading to Cloudinary...");

        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "frame_numbers",
        });

        if (result && result.secure_url) {
          update.imageUrl = result.secure_url;
          console.log(
            "Cloudinary upload successful. New imageUrl:",
            result.secure_url
          );
        } else {
          console.error("Error uploading to Cloudinary:", result); // Log any Cloudinary errors
          return res
            .status(500)
            .json({ message: "Error uploading image to Cloudinary" });
        }
      }

      const updatedFrameNumber = await FrameNumber.findByIdAndUpdate(
        id,
        update,
        { new: true }
      );

      if (!updatedFrameNumber) {
        console.error("FrameNumber not found with ID:", id);
        return res.status(404).json({ message: "FrameNumber not found" });
      }

      console.log("FrameNumber updated successfully!");
      res.status(200).json({
        message: "FrameNumber updated successfully",
        updatedFrameNumber,
      });
    } catch (error) {
      console.error("Error updating frame number:", error);
      res
        .status(500)
        .json({ message: "Error updating frame number", error: error.message });
    }
  }
);

// 4. Delete FrameNumber
app.delete("/deleteFrameNumber/:id", async (req, res) => {
  console.log("Received request to delete FrameNumber with ID:", req.params.id);

  try {
    const frameNumberId = req.params.id;

    const frameNumberToDelete = await FrameNumber.findById(frameNumberId);

    if (!frameNumberToDelete) {
      console.error("FrameNumber not found with ID:", frameNumberId);
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    // Correct way to delete the document
    await frameNumberToDelete.deleteOne();

    if (frameNumberToDelete.imageUrl) {
      const publicId = frameNumberToDelete.imageUrl
        .split("/")
        .pop()
        .split(".")[0];

      console.log("Deleting image from Cloudinary with public ID:", publicId);

      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          console.error("Error deleting image from Cloudinary:", error);
          // You might choose to still return a success message here,
          // but log the Cloudinary deletion error for further investigation
        } else {
          console.log("Image deleted successfully from Cloudinary:", result);
        }
      });
    }

    console.log("FrameNumber deleted successfully!");
    res.status(200).json({ message: "FrameNumber deleted successfully" });
  } catch (error) {
    console.error("Error deleting frame number:", error);
    res
      .status(500)
      .json({ message: "Error deleting frame number", error: error.message });
  }
});

app.get("/getFrameNumberImage/:id", async (req, res) => {
  try {
    const frameNumberId = req.params.id;
    const frameNumber = await FrameNumber.findById(frameNumberId);

    if (!frameNumber) {
      return res.status(404).json({ message: "FrameNumber not found" });
    }

    res.status(200).json({ imageUrl: frameNumber.imageUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/getorders", async (req, res) => {
  try {
    const frameNumber = await OrderSchema.find();
    res.status(200).json(frameNumber);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function freeOrderShipMent(checkOrder, type = "Prepaid") {
  console.log("freeOrderShipMent Called");
  console.log("checkOrder", checkOrder);
  let offer = "";
  if (checkOrder?.promo) {
    let promo = await PromoSchema.findOne({ _id: checkOrder?.promo }).populate(
      "offer"
    );
    if (promo) {
      if (promo.offer) offer = promo.offer;
    }
  }
  let coupon = "";
  if (checkOrder?.coupon) {
    let checkCoupon = await OfferSchema.findOne({ _id: checkOrder?.coupon });
    if (checkCoupon) {
      coupon = checkCoupon;
    }
  }
  // let val = Math.ceil(checkOrder?.cart?.length / 4) * 700;
  let unit =
    Math.ceil(checkOrder?.cart?.length / 4) == 0
      ? 1
      : Math.ceil(checkOrder?.cart?.length / 4);
  // let weight = await calculateShippingWeight(val)
  // console.log(weight,"weight");
  // prince
  let weight = await calculateShippingWeight(checkOrder?.cart?.length);

  const orderPayload = {
    order_id: checkOrder?.cart[0]?._id,
    order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
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
        units: 1,
        selling_price: checkOrder?.totalPrice,
        discount: 0,
      },
    ],
    payment_method: type,
    sub_total: checkOrder?.totalPrice,
    length: 20,
    breadth: 20,
    height: 2.5 * checkOrder?.cart?.length,
    weight: weight,
  };
  orderLogger.info("New order", {
    payload: orderPayload,
    orderId: checkOrder._id,
    userId: checkOrder.user,
  });
  console.log("orderPayload", orderPayload);
  doShipment(orderPayload)
    .then(async (shipment) => {
      console.log("shipment", shipment);
      if (shipment.success) {
        await OrderSchema.updateOne(
          { _id: checkOrder._id },
          {
            shiprocket: {
              orderId: shipment?.data?.response?.data?.order_id,
              shipmentId: shipment?.data?.response?.data?.shipment_id,
              awbCode: shipment?.data?.response?.data?.awb_code,
            },
          }
        );
        const grandTotalInfo = await calculateGrandTotal(
          checkOrder.cart,
          offer,
          coupon
        );
        let discount = grandTotalInfo?.promo
          ? grandTotalInfo?.promo?.discount
          : grandTotalInfo?.coupon
          ? grandTotalInfo?.coupon
          : 0;

        fs.readFile("html/invoice.html", "utf-8", async (err, data) => {
          if (err) {
            console.log(err);
          } else {
            let images = "";
            images += checkOrder?.cart
              .map((item) => {
                // const imageLink = `data:image/jpeg;base64,${fileData}`;
                let ImageLink = `${url}/public/products/${item.frame}`;

                // 'http://localhost:8000/public/offer/1705637051401-171788312.webp';
                return (
                  '<img src="' +
                  ImageLink +
                  '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
                );
              })
              .join("");
            let couponVal = grandTotalInfo?.couponN
              ? `[${grandTotalInfo?.couponN}]`
              : "";
            let templete = data
              .replace(
                /CLIENT_NAME/g,
                checkOrder?.address?.name + " " + checkOrder?.address?.lastName
              )
              .replace(/TOTAL_COST/g, "₹ " + checkOrder?.totalPrice)
              .replace(/INVOICE_DATE/g, moment().format("MM/DD/YYYY"))
              .replace(/CLIENT_ADDRESS/g, checkOrder?.address?.street)
              .replace(/CITY/g, checkOrder?.address?.city)
              .replace(/STATE/g, checkOrder?.address?.state)
              .replace(/COUNTRY/g, checkOrder?.address?.country)
              .replace(/PINCODE/g, checkOrder?.address?.pincode)
              .replace(/INVOICE_NUMBER/g, checkOrder?._id)
              .replace(/QUANTITY/g, checkOrder?.cart?.length)
              .replace(/GST_VAL/g, grandTotalInfo?.gst)
              .replace(/FRAME_COST/g, "₹ " + grandTotalInfo?.framePrice)
              .replace(
                /ACTUAL_COST/g,
                "₹ " + grandTotalInfo?.framePrice * checkOrder?.cart?.length
              )
              .replace(/SUB_TOTAL/g, "₹ " + grandTotalInfo?.cost)
              .replace(/DISCOUNT_CH/g, "₹ " + discount + couponVal)
              .replace(
                /SHIPPING_CHARGES/g,
                grandTotalInfo?.shippingCharges > 0
                  ? "₹ " + grandTotalInfo?.shippingCharges
                  : "Free"
              )
              .replace(/IMAGES/g, images)
              .replace(
                /PAID_AMOUNT/g,
                checkOrder?.paymentType == "offline" ? "UNPAID" : "PAID"
              )
              .replace(
                /PAYMENT_MODE/g,
                checkOrder?.paymentType == "offline" ? "OFFLINE" : "ONLINE"
              )
              .replace(/CURRENT_YEAR/g, moment().utc().format("YYYY"));

            mailSender(
              [checkOrder?.address?.email, CONTACT_US_EMAIL],
              "Inovice",
              templete
            )
              .then((success) => {
                console.log("sucess", success);
                invoiceLogger.info("Success", {
                  payload: orderPayload,
                  orderId: checkOrder._id,
                });
              })
              .catch((err) => {
                console.log("error", err);
                invoiceLogger.error("Error", {
                  payload: orderPayload,
                  orderId: checkOrder._id,
                  error: err?.message,
                });
              });
          }
        });
        return true;
      } else {
        return false;
      }
    })
    .catch((error) => {
      return false;
    });
}
async function freeOrderShipMentProduct(checkOrder, type = "Prepaid") {
  console.log("freeOrderShipmntProduct Called");
  // console.log('checkOrder', checkOrder)
  // let val = Math.ceil(checkOrder?.cart?.length / 4) * 700;
  let unit =
    Math.ceil(checkOrder?.cart?.length / 4) == 0
      ? 1
      : Math.ceil(checkOrder?.cart?.length / 4);
  // let weight = await calculateShippingWeight(val)
  // console.log(weight,"weight");
  // prince
  let weight = await calculateShippingWeight(checkOrder?.cart?.length);
  console.log("weight:", weight);

  const orderPayload = {
    order_id: checkOrder?.cart[0]?._id,
    order_date: moment().add(5, "hour").format("YYYY-MM-DD HH:mm"),
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
        selling_price: checkOrder.cart[0]?.price,
        discount: 0,
      },
    ],
    payment_method: type,
    sub_total: checkOrder.cart[0]?.price,
    length: 20,
    breadth: 20,
    height: 2.5 * checkOrder?.cart?.length,
    weight: weight,
  };
  // console.log('orderPayload', orderPayload)
  orderLogger.info("New order", {
    payload: orderPayload,
    orderId: checkOrder._id,
    userId: checkOrder.user,
  });
  doShipment(orderPayload)
    .then(async (shipment) => {
      if (shipment.success) {
        console.log("shipment", shipment);
        const updatedOrder = await OrderModel2.updateOne(
          { _id: checkOrder._id },
          {
            shiprocket: {
              orderId: shipment?.data?.response?.data?.order_id,
              shipmentId: shipment?.data?.response?.data?.shipment_id,
              awbCode: shipment?.data?.response?.data?.awb_code,
            },
          }
        );
        console.log("updated order", updatedOrder);
        console.log("initialting grandtotal");
        const grandTotalInfo = await calculateGrandTotalForProduct(
          checkOrder.cart[0]
        );
        console.log("came outside grandtotal");
        console.log("grandTotalInfo", grandTotalInfo);
        let discount = grandTotalInfo?.promo
          ? grandTotalInfo?.promo?.discount
          : grandTotalInfo?.coupon
          ? grandTotalInfo?.coupon
          : 0;
        const url = process.env.URL;
        const CONTACT_US_EMAIL = process.env.CONTACT_US_EMAIL;

        fs.readFile("html/invoice.html", "utf-8", async (err, data) => {
          if (err) {
            console.log(err);
          } else {
            let images = "";
            images += checkOrder?.cart
              .map((item) => {
                // const imageLink = `data:image/jpeg;base64,${fileData}`;
                let ImageLink = `${url}/public/products/${item.imageUrl}`;

                // 'http://localhost:8000/public/offer/1705637051401-171788312.webp';
                return (
                  '<img src="' +
                  ImageLink +
                  '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
                );
              })
              .join("");
            let couponVal = grandTotalInfo?.couponN
              ? `[${grandTotalInfo?.couponN}]`
              : "";
            console.log(data);
            let templete = data
              .replace(
                /CLIENT_NAME/g,
                checkOrder?.address?.name + " " + checkOrder?.address?.lastName
              )
              .replace(/TOTAL_COST/g, "₹ " + grandTotalInfo?.totalCost)
              .replace(/INVOICE_DATE/g, moment().format("MM/DD/YYYY"))
              .replace(/CLIENT_ADDRESS/g, checkOrder?.address?.street)
              .replace(/CITY/g, checkOrder?.address?.city)
              .replace(/STATE/g, checkOrder?.address?.state)
              .replace(/COUNTRY/g, checkOrder?.address?.country)
              .replace(/PINCODE/g, checkOrder?.address?.pincode)
              .replace(/INVOICE_NUMBER/g, checkOrder?._id)
              .replace(/QUANTITY/g, checkOrder?.cart?.length)
              .replace(/GST_VAL/g, 18)
              .replace(/FRAME_COST/g, "₹ " + grandTotalInfo?.price)
              .replace(/ACTUAL_COST/g, "₹ " + grandTotalInfo?.price)
              .replace(/SUB_TOTAL/g, "₹ " + grandTotalInfo?.price)
              .replace(/DISCOUNT_CH/g, "₹ 0")
              .replace(
                /SHIPPING_CHARGES/g,
                grandTotalInfo?.shippingCharges > 0
                  ? "₹ " + grandTotalInfo?.shippingCharges
                  : "Free"
              )
              .replace(/IMAGES/g, images)
              .replace(
                /PAID_AMOUNT/g,
                checkOrder?.paymentType == "offline" ? "UNPAID" : "PAID"
              )
              .replace(
                /PAYMENT_MODE/g,
                checkOrder?.paymentType == "offline" ? "OFFLINE" : "ONLINE"
              )
              .replace(/CURRENT_YEAR/g, moment().utc().format("YYYY"));
            console.log("template: ", templete);

            mailSender(
              [checkOrder?.address?.email, CONTACT_US_EMAIL],
              "Inovice",
              templete
            )
              .then((success) => {
                console.log("sucess", success);
                invoiceLogger.info("Success", {
                  payload: orderPayload,
                  orderId: checkOrder._id,
                });
              })
              .catch((err) => {
                console.log("error", err);
                invoiceLogger.error("Error", {
                  payload: orderPayload,
                  orderId: checkOrder._id,
                  error: err?.message,
                });
              });
          }
        });
        return true;
      } else {
        // console.log('shipment', shipment)
        return false;
      }
    })
    .catch((error) => {
      return false;
    });
}

app.get("/getProductOrders", async (req, res) => {
  try {
    const frameNumber = await OrderModel2.find();
    res.status(200).json(frameNumber);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/product-orders/:orderId/invoice", async (req, res) => {
  const orderId = req.params.orderId;

  try {
    // 1. Fetch the order details based on orderId from your database (e.g., using OrderModel2)
    const order = await OrderModel2.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2. Generate the invoice PDF (you'll need a PDF generation library like pdfmake or Puppeteer)
    // ... your PDF generation logic here ...

    // 3. Send the PDF as a response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice_${orderId}.pdf`
    );

    // ... stream the generated PDF to the response ...
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Download (assuming you want to download product images)
app.get("/api/product-orders/:orderId/download", async (req, res) => {
  const orderId = req.params.orderId;

  try {
    // 1. Fetch the order details and product image URLs
    const order = await OrderModel2.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const imageUrls = order.cart.map((item) => item.imageUrl);

    // 2. Create a zip file and add the images (you'll need a zip library like JSZip)
    // ... your zip file creation and image download logic here ...

    // 3. Send the zip file as a response
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=product_images_${orderId}.zip`
    );

    // ... stream the zip file to the response ...
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Change to delivered
app.put("/api/product-orders/:orderId/status", async (req, res) => {
  const orderId = req.params.orderId;
  const newStatus = req.body.status; // Assuming you send the new status in the request body

  try {
    // 1. Update the order status in your database
    const updatedOrder = await OrderModel2.findByIdAndUpdate(
      orderId,
      { status: newStatus },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(updatedOrder);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// Delete
app.delete("/api/product-orders/:orderId", async (req, res) => {
  const orderId = req.params.orderId;

  try {
    // 1. Delete the order from your database
    const deletedOrder = await OrderModel2.findByIdAndDelete(orderId);

    if (!deletedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/order/bookprod", async (req, res) => {
  const { product, address, paymentType } = req.body;
  product.price = product.price + (18 * product.price) / 100;
  // console.log('Received product:', product);
  // console.log('Received address:', address);
  // console.log('Received paymentType:', paymentType);

  if (!product) {
    // Check if product is provided
    return res
      .status(statusCode.error)
      .json(createErrorResponse(messages.productMissing));
  }

  try {
    console.log("Creating order...");

    await freeOrderShipMentProduct(order);

    console.log("Initiating payment...");
    try {
      const response = await doPaymentPhonePay(product.price, order._id); // Assuming product.price holds the total cost
      console.log("Payment initiated successfully:", response.data);

      // Check if the response contains redirect information
      if (
        response.data.instrumentResponse &&
        response.data.instrumentResponse.type === "PAY_PAGE"
      ) {
        const redirectInfo = response.data.instrumentResponse.redirectInfo;

        const d = {
          cart: [product], // Assuming a single product for now
          address: {
            email: address.email || "",
            name: address.name || "",
            lastName: address.lastName || "",
            city: address.city || "",
            pincode: address.pincode || "",
            state: address.state || "",
            phone: address.phone || "",
            country: address.country || "",
            street: address.street || "",
          },
          paymentType,
        };

        return res.status(statusCode.success).json(
          createSuccessResponse(
            messages.paymentInitiate,
            {
              redirectUrl: redirectInfo.url,
            },
            undefined,
            d
          )
        );
      } else {
        return res
          .status(statusCode.success)
          .json(createSuccessResponse(messages.paymentInitiate, response.data));
      }
    } catch (err) {
      console.log("Payment initiation error:", err);
      return res
        .status(statusCode.error)
        .json(createErrorResponse(err.message));
    }
  } catch (error) {
    console.log("Error in order processing:", error);
    return res
      .status(statusCode.error)
      .json(createErrorResponse(error.message));
  }
});

app.post("/order/checkOfferPrice", async (req, res) => {
  const { promo, products, coupon } = req.body;
  if (products.length > 0) {
    console.log("products:", products);
    const orderFunc = async (promoDetail, coupon, couponErr = "") => {
      const grandTotal = await calculateGrandTotal(
        products,
        promoDetail?.offer,
        coupon,
        couponErr
      );
      console.log("grandTotal:", grandTotal);
      return res
        .status(statusCode.success)
        .json(createSuccessResponse(messages.orderCheck, grandTotal));
    };
    if (promo) {
      const checkPromo = await PromoSchema.findOne({
        code: promo,
        isExpire: null,
      }).populate("offer");
      if (!checkPromo)
        return res
          .status(statusCode.error)
          .json(createErrorResponse(messages.wrongPromo));
      else orderFunc(checkPromo);
    } else if (coupon) {
      let checkCoupon = await OfferSchema.findOne({ code: coupon });
      let couponErr = "";
      if (checkCoupon && checkCoupon.status == 0) {
        checkCoupon = false;
        couponErr = "The coupon is currently inactive or has expired.";
      }
      if (checkCoupon && checkCoupon.startDate > new Date()) {
        checkCoupon = false;
        couponErr = "Coupon is not active";
      }
      if (checkCoupon && checkCoupon.endDate < new Date()) {
        checkCoupon = false;
        couponErr = "Coupon is expired";
      }

      let promo = null;
      orderFunc(promo, checkCoupon, couponErr);
    } else orderFunc();
  } else
    return res
      .status(statusCode.error)
      .json(createErrorResponse(messages.cartEmpty));
});

//original route for /order/book
// app.post('/order/book', verifyUserJWTToken, async (req, res) => {
//     const { promo, products, coupon, address, paymentType, refrence } = req.body;

//     if (products.length > 0) {
//         const orderFunc = async (promoDetail, couponV, couponErr = '') => {
//             const grandTotal = await calculateGrandTotal(products, promoDetail?.offer, couponV, couponErr);
//             var { totalCost } = grandTotal;

//             if (totalCost > 0) {
//                 let status = paymentType == 'offline' ? 1 : 0;
//                 const order = await OrderSchema({
//                     promo: promoDetail ? promoDetail._id : null,
//                     coupon: couponV ? couponV._id : null,
//                     payment: 0,
//                     cart: products,
//                     user: req.user._id,
//                     totalPrice: totalCost,
//                     address,
//                     paymentType,
//                     complete: status,
//                     refrence
//                 }).save();

//                 // Fetch the saved order to get the generated _id
//                 const savedOrder = await OrderSchema.findById(order._id);

//                 // Update the order ID field
//                 savedOrder.orderId = savedOrder._id;
//                 await savedOrder.save();

//                 if (paymentType == 'offline') {
//                     if (couponV?.oneTimeUsed == 1) {
//                         couponV.status = 0
//                         await couponV.save()
//                     }
//                     await freeOrderShipMent(savedOrder, 'COD');
//                     return res.status(statusCode.success).json(createSuccessResponse(messages.orderPlaced, { isFree: true, id: savedOrder._id }));
//                 } else {
//                     doPaymentPhonePay(totalCost, savedOrder._id)
//                         .then(async (response) => {
//                             return res.status(statusCode.success).json(createSuccessResponse(messages.paymentInitiate, response.data))
//                         })
//                         .catch(err => {
//                             return res.status(statusCode.error).json(createErrorResponse(err.message))
//                         })
//                 }
//             } else {
//                 if (couponV?.oneTimeUsed == 1) {
//                     couponV.status = 0
//                     await couponV.save()
//                 }
//                 const order = await OrderSchema({
//                     promo: promoDetail ? promoDetail._id : null,
//                     cart: products,
//                     user: req.user._id,
//                     totalPrice: totalCost,
//                     address: address,
//                     payment: true,
//                     paymentType: 'online',
//                     coupon: couponV ? couponV._id : null,
//                     complete: true,
//                     refrence
//                 }).save();

//                 // Fetch and update the order ID for zero-cost orders as well
//                 const savedOrder = await OrderSchema.findById(order._id);
//                 savedOrder.orderId = savedOrder._id;
//                 await savedOrder.save();

//                 await freeOrderShipMent(savedOrder);
//                 return res.status(statusCode.success).json(createSuccessResponse(messages.orderPlaced, { isFree: true, id: savedOrder._id }));
//             }
//         }

//         if (promo) {
//             const checkPromo = await PromoSchema.findOne({ code: promo, isPayment: true, isExpire: null }).populate('offer');
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
//                 couponErr = "Coupon is not active yet"
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
// })

//DIRECT PAYMENT ROUTE
app.post("/order/book", verifyUserJWTToken, async (req, res) => {
  console.log("req.body:", req.body);
  const { promo, products, coupon, address, paymentType, refrence } = req.body;
  console.log("products:", products);

  if (products.length > 0) {
    const orderFunc = async (promoDetail, couponV, couponErr = "") => {
      const grandTotal = await calculateGrandTotal(
        products,
        promoDetail?.offer,
        couponV,
        couponErr
      );
      var { totalCost } = grandTotal;

      try {
        const response = await doPaymentPhonePay(
          totalCost,
          Math.random(10000000, 99999999)
        ); // Assuming product.price holds the total cost
        console.log("Payment initiated successfully:", response.data);

        // Check if the response contains redirect information
        if (
          response.data.instrumentResponse &&
          response.data.instrumentResponse.type === "PAY_PAGE"
        ) {
          const redirectInfo = response.data.instrumentResponse.redirectInfo;

          const d = {
            cart: [products], // Assuming a single product for now
            address: {
              email: address.email || "",
              name: address.name || "",
              lastName: address.lastName || "",
              city: address.city || "",
              pincode: address.pincode || "",
              state: address.state || "",
              phone: address.phone || "",
              country: address.country || "",
              street: address.street || "",
            },
            paymentType,
          };

          if (res.status(statusCode.success)) {
            console.log(totalCost, "totalCost from order book");
            if (totalCost >= 0) {
              const order = await OrderSchema({
                promo: promoDetail ? promoDetail._id : null,
                coupon: couponV ? couponV._id : null,
                payment: false,
                cart: products,
                user: req.user._id,
                totalPrice: totalCost,
                address,
                paymentType: paymentType || "none",
                complete: true,
                refrence,
              }).save();

              const savedOrder = await OrderSchema.findById(order._id);
              savedOrder.orderId = savedOrder._id;
              await savedOrder.save();

              if (couponV?.oneTimeUsed == 1) {
                couponV.status = 0;
                await couponV.save();
              }

              if (totalCost > 0) {
                await freeOrderShipMent(savedOrder);
                return res.status(statusCode.success).json(
                  createSuccessResponse(messages.orderPlaced, {
                    isFree: true,
                    id: savedOrder._id,
                  })
                );
              } else {
                return res.status(statusCode.success).json(
                  createSuccessResponse(messages.orderPlaced, {
                    isFree: false,
                    id: savedOrder._id,
                  })
                );
              }
            } else {
              return res
                .status(statusCode.error)
                .json(createErrorResponse(messages.invalidOrder));
            }
          }

          if (promo) {
            const checkPromo = await PromoSchema.findOne({
              code: promo,
              isPayment: true,
              isExpire: null,
            }).populate("offer");
            if (!checkPromo)
              return res
                .status(statusCode.error)
                .json(createErrorResponse(messages.wrongPromo));
            else orderFunc(checkPromo);
          } else if (coupon) {
            let checkCoupon = await OfferSchema.findOne({ code: coupon });
            let couponErr = "";
            if (checkCoupon && checkCoupon.status == 0) {
              checkCoupon = false;
              couponErr = "The coupon is currently inactive or has expired.";
            }
            if (checkCoupon && checkCoupon.startDate > new Date()) {
              checkCoupon = false;
              couponErr = "Coupon is not active yet";
            }
            if (checkCoupon && checkCoupon.endDate < new Date()) {
              checkCoupon = false;
              couponErr = "Coupon is expired";
            }
            let promo = null;
            orderFunc(promo, checkCoupon, couponErr);
          } else orderFunc();

          return res.status(statusCode.success).json(
            createSuccessResponse(
              messages.paymentInitiate,
              {
                redirectUrl: redirectInfo.url,
              },
              undefined,
              d
            )
          );
        } else {
          return res
            .status(statusCode.success)
            .json(
              createSuccessResponse(messages.paymentInitiate, response.data)
            );
        }
      } catch (err) {
        console.log("Payment initiation error:", err);
        return res
          .status(statusCode.error)
          .json(createErrorResponse(err.message));
      }
    };
  } else
    return res
      .status(statusCode.error)
      .json(createErrorResponse(messages.cartEmpty));
});

app.post("/promo/orderId", verifyUserJWTToken, async (req, res) => {
  const { id, email, mobileNumber, size } = req.body;
  const checkOffer = await GiftCard.findOne({ _id: id });
  if (checkOffer) {
    const code = generatePromoCode();
    const userEmail = req.user.email;

    const promo = {
      code,
      email,
      senderEmail: userEmail,
      mobileNumber,
      user: req.user._id,
      offer: id,
      isPayment: 0,
      size,
    };
    const data = await new PromoSchema(promo).save();
    doPaymentOnPhonePay(checkOffer.price, data._id)
      .then(async (response) => {
        return res
          .status(statusCode.success)
          .json(createSuccessResponse(response.data));
      })
      .catch((err) => {
        console.log(err);
        return res
          .status(statusCode.error)
          .json(createErrorResponse(err.message));
      });
  } else
    return res
      .status(statusCode.error)
      .json(createErrorResponse(messages.promoNotFound));
});



app.post('/order', async (req, res) => {

  console.log("frames", req.body.frames);
  

  try {

      let merchantTransactionId = req.body.transactionId

      const data = {
          merchantId: process.env.phonePayMerchant,
          merchantTransactionId: merchantTransactionId,
          name: req.body.name,
          amount: req.body.amount * 100,
          redirectUrl: `http://localhost:8000/status?id=${merchantTransactionId}`,
          redirectMode: "POST",
          mobileNumber: req.body.phone,
          paymentInstrument: {
              type: "PAY_PAGE"
          }
      }


      const payload = JSON.stringify(data)
      const payloadMain = Buffer.from(payload).toString('base64')
      const keyIndex = 1
      const string = payloadMain + '/pg/v1/pay' + process.env.phonePaySaltKey;
      const sha256 = crypto.createHash('sha256').update(string).digest('hex');
      const checksum = sha256 + '###' + keyIndex;


      // const prod_URL = "https://api.phonepe.com/apis/hermes/pg/v1/pay"
      const prod_URL = process.env.phonePayUrl

      const options = {
          method: 'POST',
          url: prod_URL,
          headers: {
              accept: 'application/json',
              'Content-Type': 'application/json',
              'X-VERIFY': checksum
          },
          data: {
              request: payloadMain
          }
      }

      await axios(options).then(function (response) {

          console.log(response.data)
          return res.json(response.data)

      }).catch(function (error) {
          console.log(error)
      })




  } catch (error) {
      console.log(error)
  }


})


app.post('/status', async (req, res) => {

  const merchantTransactionId = req.query.id
  const merchantId = process.env.phonePayMerchant


  const keyIndex = 1
  const string = `/pg/v1/status/${merchantId}/${merchantTransactionId}` + process.env.phonePaySaltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  const checksum = sha256 + '###' + keyIndex;


  const options = {
      method: 'GET',
      url: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${merchantTransactionId}`,
      headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': `${merchantId}`
      }


  }


  axios.request(options).then(function (response) {
      if (response.data.success === true) {

        // create Order 

        const order = new OrderModel2({
          frames: req.body.frames,
          address: req.body.address,
          paymentType: req.body.paymentType,
          transactionId: req.body.transactionId
        });





          const url = 'http://localhost:3000/success'
          return res.redirect(url)
      } else {
          const url = 'http://localhost:3000/fail'
          return res.redirect(url)
      }

  }).catch(function (error) {
      console.log(error)
  })


})


server.listen(PORT, () => {
  console.log(`Server is listing on PORT ${PORT}`);
});
