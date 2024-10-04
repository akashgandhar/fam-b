import mongoose from 'mongoose';
import { stringType, booleanType } from './common/commonTypes.js';
const HomepageSchema = mongoose.model('homepages', new mongoose.Schema({
    firstContent    :   {
        links       : [stringType],
        title       : stringType,
        description : stringType,
        video       : stringType
    },
    secondContent   :   {
        links       : [stringType],
        title       : stringType,
        description : stringType,
    },
    thirdContent    :   {
        title       : stringType,
        heading     : stringType,
        description : stringType,
        Image       : stringType
    },   
    forthContent    :   {
        title       : stringType,
        heading     : stringType,
        description : stringType,
        Image       : stringType
    },   
    fifthContent    :   {
        title       : stringType,
        heading     : stringType,
        description : stringType,
        Image       : stringType
    },   
    // sixthContent    : {
    //     heading     : stringType,
    //     title       : stringType,
    //     line1       : stringType,
    //     line2       : stringType,
    //     line3       : stringType
    // },     
    sixthContent    : {
        title       : stringType,
        description : stringType,
        links       : [stringType],
    },
    reviewHeading   : stringType,
    workSection     :   stringType,
    meta_tag        : stringType,
    meta_description: stringType,
    instragram      : stringType,
    twitter         : stringType,
    facebook        : stringType,
    youTube         : stringType,
    pinterest       : stringType,
    youTubeLink1    : stringType,
    youTubeLink2    : stringType,
    youTubeLink3    : stringType,
    popup           : booleanType,
}, { timestamps     : true }))

export { HomepageSchema };
