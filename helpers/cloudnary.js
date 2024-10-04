import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';




export const uploadOnCloudinary = async (localFilePath) => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    try {
        if (!localFilePath) {
            throw new Error('Local file path is missing.');
        }

        const response = await cloudinary.uploader.upload(localFilePath, {
            folder: 'customerImages', // Specify the folder in Cloudinary
            resource_type: 'auto',
            quality: 'auto', // You can add more optimization options here
        });

        console.log('File is uploaded on Cloudinary:', response.secure_url);
        fs.unlinkSync(localFilePath);
        return response?.secure_url;
    } catch (error) {
        console.error('Error uploading to Cloudinary:', error.message);

        if (fs.existsSync(localFilePath)) {
            // Remove the saved temporary file locally
            fs.unlinkSync(localFilePath);
            console.log('Removed the saved temporary file locally:', localFilePath);
        }

        throw error; // Re-throw the error for handling at a higher level if needed
    }
};

export const deleteFromCloudinary = async (imageUrl) => {
  try {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Extract public ID from Cloudinary URL
    const publicId = cloudinary.url(imageUrl).split('/').pop().replace(/\..+$/, '');

    // Delete image from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    console.log(`Image deleted from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error.message);
    // Handle the error accordingly
  }
};


