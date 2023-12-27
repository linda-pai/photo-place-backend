//  用在更新浮水印照片 url 的 (備而不用)

const sharp = require("sharp");
const { uploadToS3 } = require("./uploadModules");
require("dotenv").config();
const axios = require("axios");

async function compositeImages(imageUrl) {
  try {
    const input = await axios({ url: imageUrl, responseType: "arraybuffer" });
    const buffer = Buffer.from(input.data, "binary");

    return await sharp(buffer)
      .jpeg({ quality: 50 }) //壓縮
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

const getWatermarkedImageUrlFromRemote = async (imageUrl, path) => {
  return new Promise(async (resolve, reject) => {
    try {
      const watermarkedImage = await compositeImages(imageUrl);

      const result = await uploadToS3(
        {
          mimetype: "image/jpg",
          originalname: "watermarked-" + imageUrl + ".jpg",
          buffer: watermarkedImage,
        },
        path
      );
      console.log("result.Location", result.Location);
      resolve({ watermarkedUrl: result.Location || "" });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  getWatermarkedImageUrlFromRemote,
};
