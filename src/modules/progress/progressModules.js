const dayjs = require("dayjs");

//新增上傳紀錄
const writeUploadInfo = async (res, db, data) => {
  const TimeStamp = dayjs().utcOffset(8).format("YYYYMMDDHHmmss");

  const { eventId, author, fileList } = data;

  if (!author || fileList.length <= 0) return res.json({ message: "新增失敗" });
  const eventDate = await db
    .collection(`eventlistcollection`)
    .find({ eventId })
    .toArray();

  const uploadInfo = fileList.map((item) => ({
    ...item,
    eventId,
    author,
    date: eventDate[0]?.date,
    uploaded: false,
    createAt: TimeStamp,
  }));

  db.collection(`progresscollection`)
    .insertMany(uploadInfo)
    .then(() => {
      res.json({ message: "新增成功" });
    });
};

//當上傳完成後，更新上傳資訊
const updateUploadInfo = async (db, data) => {
  const TimeStamp = dayjs().utcOffset(8).format("YYYYMMDDHHmmss");

  const { eventId, author, fileName } = data;

  if (!fileName) return;
  db.collection(`progresscollection`).updateOne(
    { author, eventId, path: fileName },
    {
      $set: {
        uploaded: true,
        chargeAt: TimeStamp,
      },
    }
  );
};

module.exports = {
  writeUploadInfo,
  updateUploadInfo,
};
