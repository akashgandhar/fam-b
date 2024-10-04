import { AdminSchema } from '../../models/admin.model.js';
import { UserSchema } from '../../models/user.model.js';
import { ContentSchema } from '../../models/content.model.js';
import { OrderSchema } from '../../models/order.model.js';
import fs from 'fs';
import moment from 'moment';
import { mailSender } from '../../helpers/mailHelper.js';
import { messages } from '../../constant/message.js';
import { comparePassword, createErrorResponse, createSuccessResponse, generateToken, hashPassword, paginationData, parseToMongoObjectID, uuidv4_10, verifyToken } from '../../helpers/utils.js';
import { statusCode } from '../../constant/statusCode.js';
import { FaqSchema } from '../../models/faq.model.js';
import { DiscountSchema } from '../../models/discount.model.js';
import { HomepageSchema } from '../../models/homepage.model.js';
import { TestimonialSchema } from '../../models/testimonial.model.js';
import { cancelOrder } from '../../helpers/shipment.js';
import { OfferSchema } from '../../models/offer.model.js';
import { PopupSchema } from '../../models/popup.model.js';
import { payloadLogger } from '../../config/logger.js';
import { createObjectCsvWriter } from 'csv-writer';
import puppeteer from 'puppeteer';
import { promises as fsPromises } from 'fs';
import { calculateGrandTotal } from '../../helpers/mongooseHelper.js';
import path from 'path';
import { url } from '../../helpers/backendUrl.js';
const PANEL_URL = process.env.PANEL_URL;

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
export const login = async (req, res) => {
    const { email, password } = req.body;
    const admin = await AdminSchema.findOne({ email })

    if (admin) {
        let passwordMatch = await comparePassword(password, admin.password)
        if (passwordMatch) {
            admin['deviceToken'] = uuidv4_10();
            await admin.save()
            const token = generateToken({ _id: admin._id, password: admin['password'], deviceToken: admin['deviceToken'], type: "admin" })
            return res.status(statusCode.success).json(createSuccessResponse(messages.loginSuccess, { token }))
        } else return res.status(statusCode.error).json(createErrorResponse(messages.invalidEmailAndPassword))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.invalidEmailAndPassword))
}

export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const admin = await AdminSchema.findOne({ email })
    if (admin) {
        const token = await generateToken({ userId: admin._id, time: Date.now() })
        admin['forgotPasswordToken'] = token
        admin['forgotPassword'] = true
        await admin.save()
        fs.readFile('html/forgot.html', 'utf-8', (err, data) => {
            if (err) return res.status(statusCode.error).json(createErrorResponse(messages.mailNotSent))
            else {
                let templete = data.replace(/TOKEN/g, token)
                    .replace(/URL/g, PANEL_URL)
                    .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
                mailSender(admin.email, "Reset Password", templete)
                    .then(success => { return res.status(statusCode.success).json(createSuccessResponse(messages.forgotPasswordLinkSent)) })
                    .catch(err => { return res.status(statusCode.error).json(createErrorResponse(err?.message)) })
            }
        })
    } else return res.status(statusCode.error).json(createErrorResponse(messages.emailNotRegistered))
}

export const resetPasswordLink = async (req, res) => {
    const { token } = req.body;
    const tokenDetails = await verifyToken(token)
    if (tokenDetails) {
        const admin = await AdminSchema.findOne({ _id: tokenDetails.userId, forgotPassword: true })
        if (admin) {
            const { forgotPassword, forgotPasswordToken } = admin;
            if (forgotPassword && (forgotPasswordToken == token) && parseInt(Date.now()) - parseInt(tokenDetails.time) < 600000) return res.status(statusCode.success).json(createSuccessResponse(messages.linkFetched, { show: true }))
            else return res.status(statusCode.error).json(createErrorResponse(messages.linkExpired, { show: false }))
        } else return res.status(statusCode.error).json(createErrorResponse(messages.linkExpired, { show: false }))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.linkExpired, { show: false }))
}

export const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    const tokenDetails = await verifyToken(token)
    if (tokenDetails) {
        const admin = await AdminSchema.findOne({ _id: tokenDetails.userId, forgotPassword: true })
        if (admin) {
            const { forgotPassword, forgotPasswordToken } = admin;
            if (forgotPassword && (forgotPasswordToken == token) && parseInt(Date.now()) - parseInt(tokenDetails.time) < 600000) {
                admin['forgotPassword'] = false
                admin['forgotPasswordToken'] = null
                admin['password'] = await hashPassword(password)
                await admin.save()
                return res.status(statusCode.success).json(createSuccessResponse(messages.passwordChanged))
            } else return res.status(statusCode.error).json(createErrorResponse(messages.linkExpired))
        } else return res.status(statusCode.error).json(createErrorResponse(messages.linkExpired))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.linkExpired))
}

export const changePassword = async (req, res) => {
    const { oldPassword, password } = req.body;
    const user = req.user
    const oldPasswordMatched = await comparePassword(oldPassword, user?.password)
    if (oldPasswordMatched) {
        user['password'] = await hashPassword(password)
        await user.save()
        return res.status(statusCode.success).json(createSuccessResponse(messages.passwordChanged))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.incorrectOldPassword))
}

export const dashboard = async (req, res) => {
    const adminId = req.user._id;
    const aggregation = [
        {
            $match: {
                _id: parseToMongoObjectID(adminId)
            }
        },
        {
            $lookup: {
                from: 'users',
                let: {},
                pipeline: [],
                as: "users"
            }
        },
        {
            $lookup: {
                from: 'orders',
                let: {},
                pipeline: [],
                as: "orders"
            }
        },
        {
            $project: {
                _id: 1,
                orders: 1,
                users: {
                    $cond: [
                        { $eq: [{ $size: '$users' }, 0] },
                        {
                            lastWeek: 0,
                            lastMonth: 0,
                            lastYear: 0,
                        },
                        {
                            lastWeek: {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "today",
                                        cond: {
                                            $and: [
                                                {
                                                    $gt: ["$$today.createdAt", new Date(moment().utc().startOf('isoWeek'))]
                                                }
                                            ]
                                        }
                                    }
                                }
                            },
                            lastMonth: {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "today",
                                        cond: {
                                            $and: [
                                                {
                                                    $gt: ["$$today.createdAt", new Date(moment().utc().startOf('month'))]
                                                }
                                            ]
                                        }
                                    }
                                }
                            },
                            lastYear: {
                                $size: {
                                    $filter: {
                                        input: "$users",
                                        as: "today",
                                        cond: {
                                            $and: [
                                                {
                                                    $gt: ["$$today.createdAt", new Date(moment().utc().startOf('year'))]
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    ]
                },
                orders: {
                    $cond: [
                        { $eq: [{ $size: '$orders' }, 0] },
                        {
                            lastWeek: 0,
                            lastMonth: 0,
                            lastYear: 0,
                        },
                        {
                            lastWeek: {
                                $cond: [
                                    { $eq: [{ $size: '$orders' }, 0] },
                                    0,
                                    {
                                        $size: {
                                            $filter: {
                                                input: "$orders",
                                                as: "today",
                                                cond: {
                                                    $and: [
                                                        {
                                                            $gt: ["$$today.createdAt", new Date(moment().utc().startOf('isoWeek'))]
                                                        },
                                                        { $eq: ["$$today.complete", true] },
                                                        { $eq: ["$$today.isDeleted", null] }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                ]
                            },
                            lastMonth: {
                                $size: {
                                    $filter: {
                                        input: "$orders",
                                        as: "today",
                                        cond: {
                                            $and: [
                                                {
                                                    $gt: ["$$today.createdAt", new Date(moment().utc().startOf('month'))]
                                                },
                                                { $eq: ["$$today.complete", true] },
                                                { $eq: ["$$today.isDeleted", null] }
                                            ]
                                        }
                                    }
                                }
                            },
                            lastYear: {
                                $size: {
                                    $filter: {
                                        input: "$orders",
                                        as: "today",
                                        cond: {
                                            $and: [
                                                {
                                                    $gt: ["$$today.createdAt", new Date(moment().utc().startOf('year'))]
                                                },
                                                { $eq: ["$$today.complete", true] },
                                                { $eq: ["$$today.isDeleted", null] }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        }
    ];
    const dashboard = await AdminSchema.aggregate(aggregation);
    return res.status(statusCode.success).json(createSuccessResponse(messages.dashboardFetched, dashboard[0]))
}

export const usersList = async (req, res) => {
    let { offset, limit, sort, order, search } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 10

    const aggregation = [
        {
            $project: {
                name: 1,
                profile: 1,
                email: 1,
                isBlock: 1,
                createdAt: 1,
                loginType: 1,
                address: 1,
                number: 1
            }
        },
        ...(search && search !== '' ? [{
            $match: {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            }
        }] : []),
        {
            $facet: {
                data: [
                    { $sort: { [sort ? sort : 'createdAt']: order ? order : -1 } },
                    { $skip: offset },
                    { $limit: limit }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        },
        {
            $unwind: {
                path: '$totalCount',
                preserveNullAndEmptyArrays: true
            }
        }
    ]
    const list = await UserSchema.aggregate(aggregation)
    const totalCount = list && list[0] && list[0].totalCount ? list[0].totalCount.count : 0
    const pagination = paginationData(totalCount, limit, offset)
    return res.status(statusCode.success).json(createSuccessResponse(messages.userListFetched, {
        list: list[0].data,
        pagination
    }))
}

export const userDetails = async (req, res) => {
    let details = await UserSchema.findOne({ _id: req.body.id }).select('name email isBlock profile loginType socialId createdAt')
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.userListFetched, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.userNotFound))
}

export const editUserProfile = async (req, res) => {
    const { id, name } = req.body;
    const user = await UserSchema.findOne({ _id: id })
    if (user) {
        if (name) user['name'] = name
        await user.save()
        return res.status(statusCode.success).json(createSuccessResponse(messages.userDetailsUpdated))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.userNotFound))
}

export const blockUnblockUser = async (req, res) => {
    const user = await UserSchema.findOne({ _id: req.body.id })
    if (user) {
        let message = user.isBlock ? messages.userUnblocked : messages.userBlocked
        user['isBlock'] = user.isBlock ? false : true
        await user.save()
        return res.status(statusCode.success).json(createSuccessResponse(message, { isBlock: user['isBlock'] }))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.userNotFound))
}

export const deleteUser = async (req, res) => {
    const user = await UserSchema.findOne({ _id: req.body.id })
    if (user) {
        await user.deleteOne()
        return res.status(statusCode.success).json(createSuccessResponse(messages.userDelete))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.userNotFound))
}

export const trashOrdersList = async (req, res) => {
    let { offset, limit, sort, order, search } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 5
    const allDeletedOrders = await OrderSchema.find({ isDeleted: { $exists: true, $ne: null } });
    const aggregation = [
        {
            $match: {
                complete: true,
                isDeleted: { $exists: true, $ne: null }
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
            $lookup: {
                from: 'users',
                let: { 'userId': '$user' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ['$_id', '$$userId']
                            }
                        }
                    },
                    {
                        $project: {
                            name: 1,
                            email: 1,
                            profile: 10
                        }
                    }
                ],
                as: 'user'
            }
        },
        {
            $unwind: {
                path: '$user',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                orderId: 1,
                receiptId: 1,
                cart: 1,
                user: 1,
                totalPrice: 1,
                status: 1,
                createdAt: 1,
                address: 1,
                paymentType: 1,
                isDeleted: 1,

            }
        },
        ...(search && search !== '' ? [{
            $match: {
                $or: [
                    { orderId: { $regex: search, $options: 'i' } },
                    { status: { $regex: search, $options: 'i' } }
                ]
            }
        }] : []),
        {
            $facet: {
                data: [
                    { $sort: { [sort ? sort : 'createdAt']: order ? order : -1 } },
                    { $skip: offset },
                    { $limit: limit }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        },
        {
            $unwind: {
                path: '$totalCount',
                preserveNullAndEmptyArrays: true
            }
        }
    ]

    const list = await OrderSchema.aggregate(aggregation)
    const totalCount = list && list[0] && list[0].totalCount ? list[0].totalCount.count : 0
    const pagination = paginationData(totalCount, limit, offset)
    return res.status(statusCode.success).json(createSuccessResponse(messages.ordersFetch, {
        list: list[0].data,
        pagination
    }))
}


export const ordersList = async (req, res) => {
    let { offset, limit, sort, order, search } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 10

    const aggregation = [
        {
            $match: {
                complete: true,
                isDeleted: null
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
            $lookup: {
                from: 'users',
                let: { 'userId': '$user' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ['$_id', '$$userId']
                            }
                        }
                    },
                    {
                        $project: {
                            name: 1,
                            email: 1,
                            profile: 10,
                            address: 1
                        }
                    }
                ],
                as: 'user'
            }
        },
        {
            $unwind: {
                path: '$user',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                orderId: 1,
                receiptId: 1,
                cart: 1,
                user: 1,
                promo: { $cond: ['$promo', '$promo', null] },
                totalPrice: 1,
                status: 1,
                createdAt: 1,
                address: 1,
                paymentType: 1,

            }
        },
        ...(search && search !== '' ? [{
            $match: {
                $or: [
                    { orderId: { $regex: search, $options: 'i' } },
                    { status: { $regex: search, $options: 'i' } }
                ]
            }
        }] : []),
        {
            $facet: {
                data: [
                    { $sort: { [sort ? sort : 'createdAt']: order ? order : -1 } },
                    { $skip: offset },
                    { $limit: limit }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        },
        {
            $unwind: {
                path: '$totalCount',
                preserveNullAndEmptyArrays: true
            }
        }
    ]
    const list = await OrderSchema.aggregate(aggregation)
    const totalCount = list && list[0] && list[0].totalCount ? list[0].totalCount.count : 0
    const pagination = paginationData(totalCount, limit, offset)
    return res.status(statusCode.success).json(createSuccessResponse(messages.ordersFetch, {
        list: list[0].data,
        pagination
    }))
}

export const orderDetails = async (req, res) => {
    let details = await OrderSchema.findOne({ _id: req.body.id, isDeleted: null })
        .select('orderId cart user promo status totalPrice createdAt shiprocket')
        .populate({ path: 'promo', select: 'code type discount user' })
        .populate({ path: 'user', select: 'name email address profile' })
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.ordersFetch, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
}

export const orderDelete = async (req, res) => {
    let details = await OrderSchema.findOne({ _id: req.body.id, isDeleted: null })
    if (details) {
        details['isDeleted'] = new Date();
        await details.save();
        if (details?.shiprocket?.orderId) cancelOrder(details.shiprocket.orderId).then().catch()
        return res.status(statusCode.success).json(createSuccessResponse(messages.ordersDelete))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
}

export const orderRecover = async (req, res) => {
    let details = await OrderSchema.findOne({ _id: req.body.id })
    if (details) {
        details['isDeleted'] = null;
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.ordersRecover))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
}

export const orderStatus = async (req, res) => {
    const { id, status } = req.body;
    let details = await OrderSchema.findOne({ _id: id, isDeleted: null });
    if (details) {
        details['status'] = status
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.orderStatus))
    }
    else return res.status(statusCode.error).json(createErrorResponse(messages.orderNotFound))
}

export const contentView = async (req, res) => {
    let details = await ContentSchema.findOne({}).select('privacy term');
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.contentFetch, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.contentNotFound))
}

export const contentEdit = async (req, res) => {
    const { privacy, term } = req.body;
    let details = await ContentSchema.findOne({});
    if (details) {
        details['privacy'] = privacy
        details['term'] = term
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.contentUpdate))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.contentNotFound))
}

export const faqAdd = async (req, res) => {
    const { question, answer } = req.body;
    await new FaqSchema({ question, answer }).save();
    return res.status(statusCode.success).json(createSuccessResponse(messages.faqAdd))
}

export const faqDetails = async (req, res) => {
    const { id } = req.body;
    let details = await FaqSchema.findOne({ _id: id }).select('question answer');
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.faqFetch, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.faqNotFound))
}

export const faqList = async (req, res) => {
    let { offset, limit, sort, order, search } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 10

    const aggregation = [
        {
            $project: {
                question: 1,
                answer: 1,
                createdAt: 1
            }
        },
        ...(search && search !== '' ? [{
            $match: {
                $or: [
                    { question: { $regex: search, $options: 'i' } },
                    { answer: { $regex: search, $options: 'i' } }
                ]
            }
        }] : []),
        {
            $facet: {
                data: [
                    { $sort: { [sort ? sort : 'createdAt']: order ? order : -1 } },
                    { $skip: offset },
                    { $limit: limit }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        },
        {
            $unwind: {
                path: '$totalCount',
                preserveNullAndEmptyArrays: true
            }
        }
    ]
    const list = await FaqSchema.aggregate(aggregation)
    const totalCount = list && list[0] && list[0].totalCount ? list[0].totalCount.count : 0
    const pagination = paginationData(totalCount, limit, offset)
    return res.status(statusCode.success).json(createSuccessResponse(messages.faqFetch, {
        list: list[0].data,
        pagination
    }))
}

export const faqRemove = async (req, res) => {
    const { id } = req.body;
    let details = await FaqSchema.findOne({ _id: id });
    if (details) {
        await details.deleteOne();
        return res.status(statusCode.success).json(createSuccessResponse(messages.faqRemove))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.faqNotFound))
}

export const faqUpdate = async (req, res) => {
    const { id, answer, question } = req.body;
    let details = await FaqSchema.findOne({ _id: id });
    if (details) {
        details['answer'] = answer
        details['question'] = question
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.faqUpdate))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.faqNotFound))
}

export const discountView = async (req, res) => {
    let details = await DiscountSchema.findOne({}).select('freeDeliveryPrice shippingCharge framePrice siteOfferPrice siteOfferDiscount gst');
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.discountFetch, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.discountNotFound))
}

export const discountEdit = async (req, res) => {
    const { freeDeliveryPrice, shippingCharge, framePrice, siteOfferPrice, siteOfferDiscount, gst } = req.body;
    let details = await DiscountSchema.findOne({});
    if (details) {
        details['freeDeliveryPrice'] = freeDeliveryPrice
        details['shippingCharge'] = shippingCharge
        details['framePrice'] = framePrice
        details['siteOfferPrice'] = siteOfferPrice
        details['siteOfferDiscount'] = siteOfferDiscount
        details['gst'] = gst
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.discountUpdate))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.discountNotFound))
}

export const homepageView = async (req, res) => {
    let details = await HomepageSchema.findOne({}).select('firstContent secondContent thirdContent forthContent fifthContent sixthContent instragram twitter facebook pinterest youTube meta_tag meta_description youTubeLink1 youTubeLink2 youTubeLink3 workSection reviewHeading popup');
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.homepageFetch, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.homepageNotFound))
}

export const homepageEdit = async (req, res) => {
    const { firstContent, secondContent, thirdContent, forthContent, fifthContent, sixthContent, instragram, twitter, facebook, pinterest, youTube, meta_description, meta_tag, youTubeLink1, youTubeLink2, youTubeLink3, workSection, reviewHeading, popup } = req.body;

    let details = await HomepageSchema.findOne({});
    if (details) {
        details['firstContent'] = firstContent
        details['secondContent'] = secondContent
        details['thirdContent'] = thirdContent
        details['forthContent'] = forthContent
        details['fifthContent'] = fifthContent
        details['sixthContent'] = sixthContent
        details['instragram'] = instragram
        details['twitter'] = twitter
        details['facebook'] = facebook
        details['pinterest'] = pinterest
        details['youTube'] = youTube
        details['meta_tag'] = meta_tag
        details['meta_description'] = meta_description
        details['youTubeLink1'] = youTubeLink1
        details['youTubeLink2'] = youTubeLink2
        details['youTubeLink3'] = youTubeLink3
        details['workSection'] = workSection
        details['reviewHeading'] = reviewHeading
        details['popup'] = popup
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.homepageUpdate))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.homepageNotFound))
}

export const testimonialAdd = async (req, res) => {
    const { media, text } = req.body;
    await new TestimonialSchema({ media, text }).save();
    return res.status(statusCode.success).json(createSuccessResponse(messages.testimonialAdd))
}

export const testimonialDetails = async (req, res) => {
    const { id } = req.body;
    let details = await TestimonialSchema.findOne({ _id: id }).select('text media createdAt');
    if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.testimonialFetch, details))
    else return res.status(statusCode.error).json(createErrorResponse(messages.testimonialNotFound))
}

export const testimonialList = async (req, res) => {
    let { offset, limit, sort, order, search } = req.body;
    offset = offset ? offset : 0
    limit = limit ? limit : 10

    const aggregation = [
        {
            $project: {
                media: 1,
                text: 1,
                createdAt: 1
            }
        },
        ...(search && search !== '' ? [{
            $match: {
                $or: [
                    { text: { $regex: search, $options: 'i' } },
                ]
            }
        }] : []),
        {
            $facet: {
                data: [
                    { $sort: { [sort ? sort : 'createdAt']: order ? order : -1 } },
                    { $skip: offset },
                    { $limit: limit }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        },
        {
            $unwind: {
                path: '$totalCount',
                preserveNullAndEmptyArrays: true
            }
        }
    ]
    const list = await TestimonialSchema.aggregate(aggregation)
    const totalCount = list && list[0] && list[0].totalCount ? list[0].totalCount.count : 0
    const pagination = paginationData(totalCount, limit, offset)
    return res.status(statusCode.success).json(createSuccessResponse(messages.testimonialFetch, {
        list: list[0].data,
        pagination
    }))
}

export const testimonialRemove = async (req, res) => {
    const { id } = req.body;
    let details = await TestimonialSchema.findOne({ _id: id });
    if (details) {
        await details.deleteOne();
        return res.status(statusCode.success).json(createSuccessResponse(messages.testimonialRemove))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.testimonialNotFound))
}

export const testimonialUpdate = async (req, res) => {
    const { id, media, text } = req.body;
    let details = await TestimonialSchema.findOne({ _id: id });
    if (details) {
        details['media'] = media
        details['text'] = text
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.testimonialUpdate))
    } else return res.status(statusCode.error).json(createErrorResponse(messages.testimonialNotFound))
}


export const couponList = async (req, res) => {
    // try {
    //     let { offset, limit, sort, order, search } = req.body;
    //     offset = offset ? offset : 0
    //     limit = limit ? limit : 10
    //     const aggregation = [
    //         {
    //             $project: {
    //                 createdAt: 0
    //             }
    //         },
    //         ...(search && search !== '' ? [{
    //             $match: {
    //                 $or: [
    //                     { text: { $regex: search, $options: 'i' } },
    //                 ]
    //             }
    //         }] : []),
    //         {
    //             $facet: {
    //                 data: [
    //                     { $sort: { [sort ? sort : 'createdAt']: order ? order : -1 } },
    //                     { $skip: offset },
    //                     { $limit: limit }
    //                 ],
    //                 totalCount: [
    //                     { $count: "count" }
    //                 ]
    //             }
    //         },
    //         {
    //             $unwind: {
    //                 path: '$totalCount',
    //                 preserveNullAndEmptyArrays: true
    //             }
    //         }
    //     ]
    //     let list = await OfferSchema.aggregate(aggregation);
    //     if (list.length > 0) {
    //         const totalCount = list && list[0] && list[0].totalCount ? list[0].totalCount.count : 0
    //         const pagination = paginationData(totalCount, limit, offset)
    //         return res.status(statusCode.success).json(createSuccessResponse(messages.offerList, {
    //             list: list[0].data,
    //             pagination
    //         }))
    //     } else res.status(statusCode.error).json(createErrorResponse(messages.offerNotFound))
    // } catch (err) {
    //     res.status(statusCode.error).json(createErrorResponse(err?.message))
    // }
    try {
        const allCoupons = await OfferSchema.find()
        console.log(allCoupons)
        return res.status(statusCode.success).json(createSuccessResponse(messages.offerList, {
            list: allCoupons,
        }))
    } catch (err) {
        res.status(statusCode.error).json(createErrorResponse(err?.message))
    }
}


export const couponAdd = async (req, res) => {
    let { discountType, discountAmount, code, startDate, endDate, minimumAmount, isShowTopBar, oneTimeUsed } = req.body;
    try {
        let existCode = await OfferSchema.findOne({ code: code });
        if (existCode) {
            return res.status(statusCode.error).json(createErrorResponse(messages.offerExist, {}))
        }
        if (isShowTopBar) {
            await OfferSchema.updateMany({ isShowTopBar: { $eq: 1 } }, { $set: { "isShowTopBar": 0 } });
        }
        let coupon = await new OfferSchema({ discountType, discountAmount, code, startDate, minimumAmount, endDate, isShowTopBar, status: 1, oneTimeUsed }).save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.offerAdd, coupon))
    } catch (err) {
        res.status(statusCode.error).json(createErrorResponse(err?.message))
    }
}

export const couponEdit = async (req, res) => {
    let { id, discountType, discountAmount, code, startDate, endDate, minimumAmount, isShowTopBar, status, oneTimeUsed } = req.body;
    try {
        let coupon = await OfferSchema.findById(id);
        if (!coupon) {
            return res.status(statusCode.error).json(createErrorResponse(messages.offerNotFound, {}))
        }
        const codeExist = await OfferSchema.find({ code })
        if (codeExist.length > 0 && coupon.code != code) {
            return res.status(statusCode.success).json(createErrorResponse("This code is already exist"))
        }
        // if(coupon.isShowTopBar == 0 && isShowTopBar == 1) {
        //     await OfferSchema.updateMany({ isShowTopBar: { $eq: 1 } },{ $set: { "isShowTopBar" : 0 } });
        // }
        coupon['discountType'] = discountType
        coupon['discountAmount'] = discountAmount
        coupon['startDate'] = startDate
        coupon['endDate'] = endDate
        coupon['code'] = code
        coupon['minimumAmount'] = minimumAmount
        coupon['isShowTopBar'] = isShowTopBar
        coupon['status'] = status
        coupon['oneTimeUsed'] = oneTimeUsed
        await coupon.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.offerUpdate, coupon))
    } catch (err) {
        res.status(statusCode.error).json(createErrorResponse(err?.message))
    }
}


export const couponDelete = async (req, res) => {
    const { id } = req.body;
    try {
        let coupon = await OfferSchema.findById(id);
        if (coupon) {
            await coupon.deleteOne();
            return res.status(statusCode.success).json(createSuccessResponse(messages.couponRemove))
        } else return res.status(statusCode.error).json(createErrorResponse(messages.offerNotFound))

    } catch (err) {
        res.status(statusCode.error).json(createErrorResponse(err?.message))
    }
}

export const popupView = async (req, res) => {
    try {
        let details = await PopupSchema.findOne();
        if (details) return res.status(statusCode.success).json(createSuccessResponse(messages.popupFetch, details))
        else return res.status(statusCode.error).json(createErrorResponse(messages.popupNotFound))

    } catch (err) {
        res.status(statusCode.error).json(createErrorResponse(err?.message))
    }
}

export const popupEdit = async (req, res) => {
    try {
        const { line1, line2, line3, coupon, image1, image2 } = req.body;
        let details = await PopupSchema.findOne();
        if (!details) {
            details = new PopupSchema();
        }
        details['line1'] = line1
        details['line2'] = line2
        details['line3'] = line3
        details['coupon'] = coupon
        details['image1'] = image1
        details['image2'] = image2
        await details.save();
        return res.status(statusCode.success).json(createSuccessResponse(messages.popupUpdate))


    } catch (err) {
        res.status(statusCode.error).json(createErrorResponse(err?.message))
    }
}

export const shiprocket_webhook = async (req, res) => {
    payloadLogger.info('payload recieved', req.body)
    console.log('Webhook received:', req.body);
    res.status(200).end();
}


export const export_user = async (req, res) => {
    const startDate = req.body.Payload.startDate;
    const endDate = req.body.Payload.endDate
    let query = {}
    if (startDate && endDate) {
        query = { createdAt: { $gte: startDate, $lte: endDate } }
    }
    const list = await UserSchema.find(query).select({ address: 1, loginType: 1, _id: 1, name: 1, email: 1, number: 1, createdAt: 1 });
    const data = list.map(item => ({
        name: item.name ?? item.address.name,
        email: item.email ?? item.address.email,
        loginType: item.loginType,
        country: item.address.country,
        state: item.address.state,
        phone: item.address.phone ?? item.number,
        date: new Date(item.createdAt).toDateString(),
    }));
    const csvWriter = createObjectCsvWriter({
        path: 'data.csv',
        header: Object.keys(data[0]).map(key => ({ id: key, title: key })),
    });
    await csvWriter.writeRecords(data);
    return res.download('data.csv', 'data.csv');
}


export const export_order = async (req, res) => {
    const startDate = req.body.Payload.startDate;
    const endDate = req.body.Payload.endDate
    let query = { complete: true }
    if (startDate && endDate) {
        query = { complete: true, createdAt: { $gte: startDate, $lte: endDate } }
    }

    const list = await OrderSchema.find(query).select({ address: 1, paymentType: 1, _id: 1, totalPrice: 1, cart: 1, number: 1, createdAt: 1 });
    const data = list.map(item => ({
        name: item.address.name,
        email: item.address.email,
        address: item.address.country + item.address.street + item.address.pincode,
        totalPrice: item.totalPrice,
        frames: item.cart.length,
        phone: item.address.phone,
        paymentMode: item.paymentType,
        date: new Date(item.createdAt).toDateString(),
    }));

    const csvWriter = createObjectCsvWriter({
        path: 'data.csv',
        header: Object.keys(data[0]).map(key => ({ id: key, title: key })),
    });
    await csvWriter.writeRecords(data);
    return res.download('data.csv', 'data.csv');
}

export const export_order_pdf = async (req, res) => {
    const browser =  await puppeteer.launch({
        headless:"new"
    })
    console.log(browser);
    const page = await browser.newPage();
    const filePath = 'html/invoice.html';
    let htmlContent = await fsPromises.readFile(filePath, 'utf8');
    const checkOrder = await OrderSchema.findOne({ _id: req.body.orderId, isDeleted: null })
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
        }
    }
    const grandTotalInfo = await calculateGrandTotal(checkOrder.cart, offer, coupon)
    let discount = grandTotalInfo?.promo ? grandTotalInfo?.promo?.discount : grandTotalInfo?.coupon ? grandTotalInfo?.coupon : 0;
    discount = discount > grandTotalInfo?.totalCost ? grandTotalInfo?.totalCost : discount
    let images = "";
    images += checkOrder?.cart.map((item) => {
        let ImageLink = `${url}/public/products/${item.frame}`

        return '<img src="' + ImageLink + '" alt="Frame" style="margin: 8px;width: 50px;height: 50px;">'
    }).join("")
    htmlContent = htmlContent.
        replace(/CLIENT_NAME/g, checkOrder?.address?.name + " " + checkOrder?.address?.lastName)
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
        .replace(/SUB_TOTAL/g, "₹ " + grandTotalInfo?.totalCost)
        // .replace(/PAY_MENT/g, checkOrder?.paymentType == 'offline' ? 'UNPAID' : 'PAID')
        .replace(/PAYMENT_MODE/g, checkOrder?.paymentType == 'offline' ? 'OFFLINE' : 'PHONEPE')
        .replace(/DISCOUNT_CH/g, "₹ " + discount + ` [${grandTotalInfo?.couponN ?? '-'}]`)
        .replace(/SHIPPING_CHARGES/g, grandTotalInfo?.shippingCharges > 0 ? "₹ " + grandTotalInfo?.shippingCharges : "Free")
        .replace(/IMAGES/g, images)
        .replace(/PAID_AMOUNT/g, checkOrder?.paymentType == 'offline' ? 'UNPAID' : 'PAID')
        .replace(/PAYMENT_MODE/g, checkOrder?.paymentType == 'offline' ? 'OFFLINE' : 'ONLINE')
        .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'))
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf();
    console.log(pdfBuffer,"buffer");
    await browser.close();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=output.pdf');
    return res.send(pdfBuffer);
}
//prince

export const sendFile = async (req, res) => {
    try {
        const imageName = req.query.imageName;

        if (!imageName) {
            return res.status(400).send('Image name is missing in the query parameters.');
        }
        let customer = req.headers.customer

        const filePath = path.join(process.cwd(), 'public', customer, imageName);
        if (!filePath) {
            return res.status(400).send('Image path is missing in the root.');

        }
        const fileData = fs.readFileSync(filePath);
        if (!fileData) {
            return res.status(400).send('Error in reading file.');
        }
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(fileData);
    } catch (error) {
        console.error('Error reading or sending file:', error);
        res.status(500).send('Internal Server Error');
    }
};

export const statusMail = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(id);
        const order = await OrderSchema.findById(id);

        fs.readFile('html/status.html', 'utf-8', async (err, data) => {
            if (err) {
                return res.status(500).send(err.message);
            }

            let template = data
                .replace(/CLIENT_NAME/g, order?.address?.name + " " + order?.address?.lastName)
                .replaceAll(/in_process_status/g, order?.status === "inProgress" ? order?.status : "")
                .replaceAll(/delivery_status/g, order?.status === "delivered" ? order?.status : "")
                .replace(/INVOICE_DATE/g, moment().format('MM/DD/YYYY'))
                .replace(/CLIENT_ADDRESS/g, order?.address?.street)
                .replace(/CITY/g, order?.address?.city)
                .replace(/STATE/g, order?.address?.state)
                .replace(/COUNTRY/g, order?.address?.country)
                .replace(/PINCODE/g, order?.address?.pincode)
                .replace(/INVOICE_NUMBER/g, order?._id)
                .replace(/CURRENT_YEAR/g, moment().utc().format('YYYY'));

            await mailSender([order?.address?.email, process.env.CONTACT_US_EMAIL], "Order Status", template);

            res.status(200).send('Email sent successfully');
        });
    } catch (error) {
        console.error('Error reading or sending file:', error);
        res.status(500).send('Internal Server Error');
    }
};
