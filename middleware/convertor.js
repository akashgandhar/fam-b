import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export const converter = async (req, res, next) => {
    console.log('Converter middleware');
    try {
        const inputFile = req.files?.file?.[0];
        if (!inputFile) {
            return res.status(400).json({ error: 'File not uploaded.' });
        }

        const inputFilePath = inputFile.path;
        const outputFile = path.join(path.dirname(inputFilePath), `${path.basename(inputFilePath, path.extname(inputFilePath))}.webp`);

        await sharp(inputFilePath)
            .toFormat('webp')
            .toFile(outputFile);

        

        next();
    } catch (error) {
        console.error('Conversion error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
