const dayjs = require("dayjs");
const emailSender = require("../emailSender");

//建立訂單
const createOrder = async (db, data) => {
  const { orderId, MerchantOrderNo } = data;
  //確認訂單是否已經存在
  const isExist = await db
    .collection("ordercollection")
    .find({ orderId })
    .toArray();

  if (isExist.length > 0) {
    //update MerchantOrderNo
    MerchantOrderNo &&
      db.collection("ordercollection").updateOne(
        { orderId },
        {
          $set: {
            MerchantOrderNo,
          },
        }
      );
    return;
  }

  const orderData = {
    ...data,
    createAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
    paidAt: null,
  };

  db.collection("ordercollection")
    .insertOne(orderData)
    .then(async () => {
      const user = await db
        .collection("usercollection")
        .find({ userId: data.orderBy })
        .project({ token: 1, email: 1, name: 1, userId: 1 })
        .toArray();
      //寄信
      if (user[0]?.email)
        await emailSender({
          email: user[0]?.email,
          //TODO: EMAIL_PREFIX 吃不到？
          // subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 訂單成立通知`,
          subject: "訂單成立通知",
          html: `
        <div>
          <div style={{ margin:0 auto }}>
            <h2> Hi ${user[0].name}，您的訂單已成立，</h2> 
            <p> 請於 7 天內完成付款，逾期將自動取消訂單歐～</p>
            <p> 至以下網址查看訂單明細：${process.env.CLIENT_WWW_DOMAIN}/user/orders</p>
            <p>訂單編號：${orderData.orderId} </p> 
            <p>訂單金額：TWD ${orderData.totalAmount}</p>  
            <p>感謝您的購買，祝您有美好的一天！</p> 
            <p>如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
            <p>📷 PHOTO PACER 攝影小隊 </p> 
            <p>聯絡信箱： photopacer@gmail.com</p>
            <div>
              <p>官方Line：@774uebxu</p>
              <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
            </div>
          </div>
          <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
        </div>
        `,
        });
      return orderData;
    })
    .catch((error) => {
      console.log("add-error", error);
      return;
    });
};

const updateOrderPaidAt = async (db, orderId, transactionId, paymentMethod) => {
  db.collection("ordercollection").updateOne(
    {
      orderId,
    },
    {
      $set: {
        paidAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
        transactionId,
        paymentMethod,
      },
    }
  );
};

const sendSoldEmail = async (db, author, soldCount) => {
  const user = await db
    .collection("usercollection")
    .find({ userId: author })
    .project({ token: 1, email: 1, name: 1, userId: 1 })
    .toArray();
  //寄信
  try {
    if (user[0]?.email)
      await emailSender({
        email: user[0]?.email,
        // subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 照片售出通知🎉🎉🎉`,
        subject: "照片售出通知🎉🎉🎉",
        html: `
              <div>
                <div style={{ margin:0 auto }}>
                  <h2> Hi ${user[0].name}，您的照片已售出 ${soldCount}張照片，</h2> 
                  <p>查看更多細節 - 上傳紀錄頁：${process.env.CLIENT_WWW_DOMAIN}/photographer/records</p>
                  <p>很高興有機會幫助您賣出照片，期待您下次更多優秀作品！</p>
                  <p>⬇️⬇️ 如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
                  <p>📷 PHOTO PACER 攝影小隊 </p> 
                  <p>聯絡信箱： photopacer@gmail.com</p>
                  <div>
                    <p>官方Line：@774uebxu</p>
                    <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
                  </div>
                </div>
                <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
              </div>
              `,
      });
  } catch (error) {
    "sendSoldEmail-error", error;
  }
};

const updateUploadInfoSellInfo = async (db, orderId) => {
  const order = await db
    .collection("ordercollection")
    .find({ orderId })
    .toArray();

  const eventIdList = order[0].items.map((item) => item.eventId);
  //remove dulplicate eventId
  const eventIdListUnique = [...new Set(eventIdList)];
  const imagesList = order[0].items.map((item) => item.id);

  eventIdListUnique.forEach(async (eventId) => {
    const images = await db
      .collection(`imagecollection/${eventId}`)
      .find({ "image.id": { $in: imagesList } })
      .project({
        "image.id": 1,
        "image.author": 1,
        "image.watermarkedUrl": 1,
        "image.price": 1,
        "image.fileName": 1,
      })
      .toArray();

    //把 images 分類 by author
    const imagesByAuthor = images.reduce((acc, item) => {
      const author = item.image.author;
      if (!acc[author]) {
        acc[author] = [];
      }
      acc[author].push(item);
      return acc;
    }, {});

    const imagesByAuthorList = Object.keys(imagesByAuthor);

    imagesByAuthorList.forEach(async (author) => {
      const soldCount = imagesByAuthor[author].length;
      await sendSoldEmail(db, author, soldCount);

      //更新 uploadInfo
      await db.collection(`uploadInfocollection`).updateOne(
        {
          eventId,
          author,
        },
        {
          $inc: {
            soldCount,
          },
          //update sold images
          $push: {
            soldImages: {
              orderId,
              images: imagesByAuthor[author].map((item) => item.image),
              soldAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
            },
          },
        }
      );
    });

    //更新 image isSold = true
    await db.collection(`imagecollection/${eventId}`).updateMany(
      {
        "image.id": { $in: imagesList },
      },
      {
        $set: {
          isSold: true,
        },
      }
    );
  });
};

const sendOrderSuccessEmail = async (db, orderId) => {
  db.collection("ordercollection")
    .findOne({ orderId })
    .then(async (result) => {
      const { orderBy } = result;

      const user = await db
        .collection("usercollection")
        .find({ userId: orderBy })
        .project({ token: 1, email: 1, name: 1, userId: 1 })
        .toArray();
      //寄信
      try {
        if (user[0]?.email)
          await emailSender({
            email: user[0]?.email,
            // subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 訂單付款成功通知`,
            subject: "訂單付款成功通知",
            html: `
              <div>
                <div style={{ margin:0 auto }}>
                  <h2> Hi ${user[0].name}，您的訂單已付款成功，</h2> 
                  <p>即可到訂單查詢頁下載照片：${process.env.CLIENT_WWW_DOMAIN}/user/orders</p>
                  <p>感謝您的購買，期待下次我們賽道再相見！</p> 
                  <p>⬇️⬇️ 如有任何問題歡迎聯繫我們！ ⬇️⬇️</p>
                  <p>📷 PHOTO PACER 攝影小隊 </p> 
                  <p>聯絡信箱： photopacer@gmail.com</p>
                  <div>
                    <p>官方Line：@774uebxu</p>
                    <img src=${process.env.AWS_BUCKET_URL}/images/common/725ab7f17a21d4b310407e9312be8e12f2037bfdca3b559c83344e6151c1ad71-S_gainfriends_2dbarcodes_GW.png width="65px"/>
                  </div>
                </div>
                <img src=${process.env.AWS_BUCKET_URL}/images/common/e76d8b95013eff5cc00520fcd8233755c4d17450bf04d2d0a4111beda623f5a3-photo-pacer-high-resolution-logo+(3).png width="25%"/>
              </div>
            `,
          });
      } catch (error) {
        "sendOrderSuccessEmail-error", error;
      }
    });
};

module.exports = {
  createOrder,
  updateOrderPaidAt,
  updateUploadInfoSellInfo,
  sendOrderSuccessEmail,
};
