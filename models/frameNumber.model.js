import mongoose from 'mongoose';

const frameNumberSchema = new mongoose.Schema({
    'imageUrl': String,
    'name': String,
    'numberOfFrames': Number,
    'price': Number,
    'comparePrice': Number,
    'description': String,
    'description2': String,
    'additionalImages': [Object],
    'type': String,
}, { timestamps: true });

const FrameNumber = mongoose.model('FrameNumber', frameNumberSchema); // Create the model

export default FrameNumber; // Export the model
