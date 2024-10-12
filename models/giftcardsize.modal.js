import mongoose from 'mongoose';

const GiftCardSizeSchema = new mongoose.Schema({
    size: { type: String, required: true }, 
    price: { type: Number, required: true },
}, { timestamps: true });

const GiftCardSize = mongoose.model('GiftCardSize', GiftCardSizeSchema);

// Export the model
export default GiftCardSize;
