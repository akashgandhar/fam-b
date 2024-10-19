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



// first check if model is not already defined

const FrameNumber = mongoose.models.FrameNumber || mongoose.model('FrameNumber', frameNumberSchema);

export default FrameNumber; // Export the model
