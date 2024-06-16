const sharp = require("sharp");
const { uploadToS3, getS3Object } = require("../uploadModules");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

async function compositeImages(bucketKey) {
  try {
    return getS3Object(bucketKey).then(async (data) => {
      // return await sharp(file.buffer)
      return await sharp(data.Body)
        .rotate()
        .resize({
          width: 1500,
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

async function compositeFeaturedImages(bucketKey, watermarkedImage, position) {
  const watermark = await getS3Object(watermarkedImage);

  const watermarkedBuffer = watermark.Body;
  const watermarkedImageSize = await sharp(watermarkedBuffer)
    .metadata()
    .then((metadata) => {
      return {
        width: metadata.width,
        height: metadata.height,
      };
    });

  const watermarkedWithOpacity = await sharp(watermarkedBuffer)
    // .resize({
    //   width: 1500,
    // })
    .toFormat("png")
    .composite([
      {
        input: Buffer.from([0, 0, 0, 100]),
        raw: {
          width: 1,
          height: 1,
          channels: 4,
        },
        tile: true,
        blend: "dest-in",
      },
    ])
    .toBuffer();

  try {
    return getS3Object(bucketKey).then(async (data) => {
      const imageSize = await sharp(data.Body)
        .metadata()
        .then((metadata) => {
          return {
            width: metadata.width,
            height: metadata.height,
          };
        });

      const width = 1500;
      const resizeRatio = width / imageSize.width;

      const positionOptions = {
        southeast: {
          top:
            Math.round(imageSize.width * resizeRatio) +
            Math.round(watermarkedImageSize.height / resizeRatio) -
            100,
          left:
            Math.round(imageSize.height * resizeRatio) -
            Math.round(watermarkedImageSize.width * resizeRatio) -
            100,
        },
        northwest: {
          top: 50,
          left: 50,
        },
      };

      return await sharp(data.Body)
        .rotate()
        .resize({
          width: imageSize.width * resizeRatio,
          withoutEnlargement: true,
          fit: "outside",
        })
        .composite([
          {
            input: watermarkedWithOpacity, //浮水印圖片
            // gravity: "northwest", //浮水印位置 options: north, northeast, east, southeast, south, southwest, west, northwest, center, centre
            top: positionOptions[position].top,
            left: positionOptions[position].left,
          },
        ])
        .withMetadata()
        .toBuffer();
    });
  } catch (error) {
    console.log("compositeImagesWithoutTile-error", error);
    throw new Error(error);
  }
}

const getWatermarkedFeaturedImageUrl = async ({
  bucketKey,
  watermarkedImageUrl,
  position,
  path,
  fileName,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const watermarkedImage = await compositeFeaturedImages(
        bucketKey,
        watermarkedImageUrl,
        position || "southeast"
      );

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

const getWatermarkedImageUrl = async (bucketKey, path, fileName) => {
  return new Promise(async (resolve, reject) => {
    try {
      const watermarkedImage = await compositeImages(bucketKey);

      const orientation = await sharp(watermarkedImage)
        .metadata()
        .then(async (metadata) => {
          const { width, height } = metadata;
          if (width > height) {
            return "horizontal";
          } else if (width < height) {
            return "vertical";
          } else {
            return "square";
          }
        });

      const result = await uploadToS3(
        {
          mimetype: "image/jpg",
          originalname: "watermarked-" + fileName,
          buffer: watermarkedImage,
        },
        path
      );
      resolve({ watermarkedUrl: result.Location || "", orientation });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  getWatermarkedImageUrl,
  getWatermarkedFeaturedImageUrl,
};
