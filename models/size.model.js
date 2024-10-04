import mongoose from 'mongoose';

const FrameSchema = new mongoose.Schema({
    size: { type: String, required: true }, 
    colors: { type: Array, required: false },
}, { timestamps: true });

const Frame = mongoose.model('Frame', FrameSchema);

export default Frame;