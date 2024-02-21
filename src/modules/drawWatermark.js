const sharp = require("sharp");
const { uploadToS3, getS3Object } = require("./uploadModules");
require("dotenv").config();

async function compositeImages(bucketKey) {
  try {
    return getS3Object(bucketKey).then(async (data) => {
      // return await sharp(file.buffer)
      return await sharp(data.Body)
        .resize({
          height: 1500,
          withoutEnlargement: true,
          fit: "outside",
        })
        .jpeg({ quality: 75 }) //壓縮
        .composite([
          {
            input: "src/assets/photo-pacer-976_500.png", //浮水印圖片
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
