const sharp = require("sharp");
const { uploadToS3 } = require("./uploadModules");
require("dotenv").config();

async function compositeImages(file) {
  try {
    return await sharp(file.buffer)
      .jpeg({ quality: 20 }) //壓縮
      .composite([
        {
          input: "src/assets/photo-pacer-810_410.png", //浮水印圖片
          tile: true, //平鋪
        },
      ])
      .withMetadata()
      .toBuffer();
  } catch (error) {
    console.log(error);
    throw new Error(error);
  }
}

const getWatermarkedImageUrl = async (originImage) => {
  console.log("originImage", originImage);
  return new Promise(async (resolve, reject) => {
    try {
      const watermarkedImage = await compositeImages(originImage);

      const result = await uploadToS3({
        mimetype: "image/jpg",
        originalname: "watermarked-" + originImage.originalname,
        buffer: watermarkedImage,
      });
      resolve({ watermarkedUrl: result.Location || "" });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  getWatermarkedImageUrl,
};
