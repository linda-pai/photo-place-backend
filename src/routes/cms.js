const dayjs = require("dayjs");
const express = require("express");
const router = express.Router();

const { sendOrderSuccessEmail } = require("../modules/order/orderModules");

const emailSender = require("../modules/emailSender");
const { getImageInfoByEventId } = require("../modules/getImageModules");

const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

//update notifyRecord
const updateNotifyRecord = async (db, notifyId, eventId) => {
  await db.collection(`notifycollection`).updateOne(
    { notifyId, eventId },
    {
      $set: {
        status: "sent",
        notifyAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
      },
    }
  );
};

//上傳圖片完成通知
const ImagesUploadEmailNotify = async (email, eventName, notifyUrl) => {
  try {
    await emailSender({
      email,
      subject: `${process.env.EMAIL_PREFIX} PHOTO PACER 攝影小隊 - 照片上傳完成通知: ${eventName}`,
      html: `
        <div>
          <div style={{ margin:0 auto }}>
            <h2>${eventName} 的照片已上傳完成，</h2>
            <p>即可到 ${notifyUrl} 搜尋號碼布，尋找您的照片囉！</p>
            <p>感謝您使用本平台，祝您有美好的一天！我們下次賽道再相見！</p>
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

    return { status: "200" };
  } catch (error) {
    console.log("ImagesUploadEmailNotify-error", error);
    return { status: "500" };
  }
};
//get all uploadInfo
router.get("/getUploadInfo", async (req, res) => {
  const author = req.headers.authorization.split(" ")[1];
  if (author === process.env.ADMIN_PP_ID || author === process.env.ADMIN_ID) {
    const db = req.app.db;
    await db
      .collection(`uploadInfocollection`)
      .find({})
      .toArray((error, result) => {
        //group by same eventId
        const uploadInfo = result.reduce((acc, item) => {
          const eventId = item.eventId;
          if (!acc[eventId]) {
            acc[eventId] = {
              eventId,
              eventName: item.eventName,
              photographers: [],
            };
          }
          acc[eventId].photographers.push({
            author: item.author,
            authorName: item.name,
            createAt: item.createAt,
            lastEditTime: item.lastEditTime,
            soldCount: item.soldCount,
            soldImages: item.soldImages,
          });

          return acc;
        }, {});

        res.send(Object.values(uploadInfo));
      });
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

router.post("/getImageInfoByEventId/:eventId", async (req, res) => {
  const db = req.app.db;
  const { author } = req.body;
  const { eventId } = req.params;

  const {
    allImageLength,
    featuredLength,
    removeImageLength,
    detectedImageLength,
    emptyPathImageLength,
  } = await getImageInfoByEventId(db, eventId, author);

  res.send({
    allImageLength,
    featuredLength,
    removeImageLength,
    detectedImageLength,
    emptyPathImageLength,
  });
});

//取得 uploadInfo by eventId
router.get("/getUploadInfo/:eventId", async (req, res) => {
  const author = req.headers.authorization.split(" ")[1];
  if (author === process.env.ADMIN_PP_ID || author === process.env.ADMIN_ID) {
    const db = req.app.db;
    const eventId = req.params.eventId;
    const uploadInfo = await db
      .collection(`uploadInfocollection`)
      .find({ eventId })
      .toArray();

    res.send(uploadInfo);
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

//取得活動上傳完成通知資訊
router.get("/notifyRecord/:eventId", async (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;

  const notifyRecord = await db
    .collection(`notifycollection`)
    .find({ eventId })
    .toArray();

  res.send(notifyRecord);
});

//個別觸發上傳圖片完成通知
router.post("/sendEmail", async (req, res) => {
  const db = req.app.db;
  const { eventId, notifyId } = req.body;
  const notifyRecord = await db
    .collection(`notifycollection`)
    .find({ eventId, notifyId })
    .toArray();

  const { email, eventName, notifyUrl } = notifyRecord[0];

  try {
    const sendNotifyEmailRes = await ImagesUploadEmailNotify(
      email,
      eventName,
      notifyUrl
    );
    if (sendNotifyEmailRes.status === "200")
      await updateNotifyRecord(db, notifyId, eventId);

    res.send({ status: 200 });
  } catch (error) {
    console.log("ImagesUploadEmailNotify-error", error);
    res.send({ status: 500 });
  }
});

//一鍵觸發上傳圖片完成通知
router.post("/sendAllEmail/:eventId", async (req, res) => {
  const db = req.app.db;
  const eventId = req.params.eventId;
  const { isAll } = req.body;

  const notifyRecord = await db
    .collection(`notifycollection`)
    .find({ eventId, ...(!isAll ? { status: "pending" } : {}) })
    .toArray();

  //new Promise with Settimeout
  const notifyRecordPromise = notifyRecord.map(async (item, index) => {
    const { email, eventName, notifyUrl, notifyId } = item;
    try {
      await new Promise((resolve) =>
        setTimeout(async () => {
          const sendNotifyEmailRes = await ImagesUploadEmailNotify(
            email,
            eventName,
            notifyUrl
          );
          if (sendNotifyEmailRes.status === "200")
            await updateNotifyRecord(db, notifyId, eventId);

          resolve();
        }, 1000 * index)
      );
    } catch (error) {
      console.log("ImagesUploadEmailNotify-error", error);
    }
  });

  await Promise.all(notifyRecordPromise).then(() => {
    res.send({ status: "success" });
  });
});

router.get("/userList", async (req, res) => {
  const db = req.app.db;
  await db
    .collection("usercollection")
    .find({})
    .project({ token: 1, email: 1, name: 1, role: 1, userId: 1, createTime: 1 })
    .sort({ createTime: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//訂單列表
router.get("/orderList", async (req, res) => {
  const db = req.app.db;
  await db
    .collection("ordercollection")
    .find({})
    .sort({ createAt: -1 })
    .toArray((error, result) => {
      res.send(result);
    });
});

//付款 - 更新訂單
router.put("/updateOrder/:orderId", async (req, res) => {
  const db = req.app.db;
  db.collection("ordercollection")
    .updateOne(
      { orderId: req.params.orderId },
      {
        $set: {
          ...req.body,
          ...(req.body.paidAt === null && {
            paidAt: dayjs().utcOffset(8).format("YYYY-MM-DD HH:mm:ss"),
          }),
        },
      }
    )
    .then(async () => {
      await sendOrderSuccessEmail(db, req.params.orderId);

      res.json({ message: "更新成功" });
    })
    .catch((error) => {
      console.log("update-error", error);
      return res.json({ message: "更新失敗" });
    });
});

//刪除訂單
router.post("/deleteOrder/:orderId", (req, res) => {
  const db = req.app.db;
  db.collection("ordercollection")
    .deleteOne({ orderId: req.params.orderId })
    .then(() => res.json({ message: "刪除成功" }))
    .catch((error) => {
      console.log("delete-error", error);
      return res.json({ message: "刪除失敗" });
    });
});

module.exports = router;
