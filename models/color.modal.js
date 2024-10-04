import mongoose from 'mongoose';

const ColorSchema = new mongoose.Schema({
  hex: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ } // Use 'hex' field
}, { timestamps: true });

const Color = mongoose.model('Color', ColorSchema);

export default Color;