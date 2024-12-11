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

  const existingFiles = await db
    .collection("progresscollection")
    .find({ eventId, author, path: { $in: fileList.map((item) => item.path) } })
    .toArray();

  const existingFileNames = new Set(existingFiles.map((file) => file.path));

  // 過濾掉已存在的檔案
  const newUploadInfo = fileList
    .filter((item) => !existingFileNames.has(item.path))
    .map((item) => ({
      ...item,
      eventId,
      author,
      date: eventDate,
      uploaded: false,
      createAt: TimeStamp,
    }));

  if (newUploadInfo.length === 0) {
    return res.json({ message: "沒有新檔案需要新增" });
  }

  // 插入新的檔案資訊
  await db.collection("progresscollection").insertMany(newUploadInfo);
  res.json({ message: "新增成功" });
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
