const sharp = require("sharp");
const { uploadToS3, getS3Object } = require("./uploadModules");
require("dotenv").config();

async function compositeImages(bucketKey) {
  try {
    return getS3Object(bucketKey).then(async (data) => {
      // return await sharp(file.buffer)
      return await sharp(data.Body)
        //等比resize
        // .resize({ width: 1025 })
        .jpeg({ quality: 25 }) //壓縮
        .composite([
          {
            input: "src/assets/photo-pacer-2000_1025.png", //浮水印圖片
            tile: true, //平鋪
          },
        ])
        .withMetadata()
        .toBuffer();
    });
  } catch (error) {
    console.log("compositeImages-error", error);
    throw new Error(error);
  }
}

const getWatermarkedImageUrl = async (bucketKey, path, fileName) => {
  return new Promise(async (resolve, reject) => {
    try {
      const watermarkedImage = await compositeImages(bucketKey);

      const result = await uploadToS3(
        {
          mimetype: "image/jpg",
          originalname: "watermarked-" + fileName,
          buffer: watermarkedImage,
        },
        path
      );
      resolve({ watermarkedUrl: result.Location || "" });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  getWatermarkedImageUrl,
};
