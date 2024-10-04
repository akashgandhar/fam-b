import mongoose from 'mongoose';
import { number } from 'yup';

const GIftCardSchema = new mongoose.Schema({
    price: { type: Number, required: true }, 
    numberOfFrames: { type: Number, required: true },
    
}, { timestamps: true });

const GIftCard = mongoose.model('GIftCard', GIftCardSchema);

export default GIftCard;