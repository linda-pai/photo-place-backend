const sharp = require("sharp");
const { uploadToS3 } = require("./uploadModules");
require("dotenv").config();

async function compositeImages(file) {
  try {
    return await sharp(file.buffer)
      .jpeg({ quality: 20 }) //壓縮
      .composite([
        {
          input: "src/assets/watermark_source_200*111.png", //浮水印圖片
          tile: true, //平鋪
        },
      ])
      .toFormat("jpg", { mozjpeg: true }) //
      .toBuffer();
  } catch (error) {
    console.log(error);
  }
}

const getWatermarkedImageUrl = async (originImage) => {
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
