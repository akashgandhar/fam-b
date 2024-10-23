import "./config/envirnoment.js";
import http from "http";
import https from "https";
import express from "express";
import mongoose from "mongoose";
import {
  createErrorResponse,
  escapeSpecialCharacter,
} from "./helpers/utils.js";
import router from "./routers/v1/index.js";
import cors from "cors";
import admin from "firebase-admin";
import { service } from "./integration/firebase.js";
import { statusCode } from "./constant/statusCode.js";
import { scheduleCron } from "./helpers/cron.js";
import { createAuth } from "./helpers/shipment.js";
import fs from "fs";

const PORT = process.env.PORT;
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

createAuth();
scheduleCron();

admin.initializeApp({
  credential: admin.credential.cert(service),
  storageBucket: "gs://ecommerce-5769b.appspot.com",
});
export const bucket = admin.storage().bucket();

import "./config/dbSetup.js";
import { ContentSchema } from "./models/content.model.js";
import { DiscountSchema } from "./models/discount.model.js";
import { FaqSchema } from "./models/faq.model.js";
import { HomepageSchema } from "./models/homepage.model.js";
import { OfferSchema } from "./models/offer.model.js";
import { PopupSchema } from "./models/popup.model.js";
import { TestimonialSchema } from "./models/testimonial.model.js";

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
// const server = https.createServer(options, app)
app.set("view engine", "ejs");
app.use("/v1/api/", router);
app.use((err, req, res, next) => {
  if (err) {
    return res.status(statusCode.error).send(createErrorResponse(err?.message));
  } else next();
});
app.use((req, res, next) => res.send("Family Vibes Server is running"));

// get data for homepage

app.get("/homepagenew", async (req, res) => {
  try {
    const content = await ContentSchema.find();
    const discount = await DiscountSchema.find();
    const faq = await FaqSchema.find();
    const homepage = await HomepageSchema.find();
    const offer = await OfferSchema.find();
    const popup = await PopupSchema.find();
    const testimonials = await TestimonialSchema.find();

    const data = {
      content,
      discount,
      faq,
      homepage,
      offer,
      popup,
      testimonials,
    };

    return res
      .status(statusCode.success)
      .json(createSuccessResponse(messages.homepage, data));
  } catch (err) {
    res.status(statusCode.error).json(createErrorResponse(err?.message));
  }
});

server.listen(PORT, () => {
  console.log(`Server is listing on PORT ${PORT}`);
});
