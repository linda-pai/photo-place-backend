const express = require("express");
const router = express.Router();

const newebPay = require("../modules/newebpay/newebPay");
const createSesDecrypt = require("../modules/newebpay/createSesDecrypt");
const createShaEncrypt = require("../modules/newebpay/createShaEncrypt");
const {
  createOrder,
  updateOrderPaidAt,
  updateUploadInfoSellInfo,
  sendOrderSuccessEmail,
} = require("../modules/order/orderModules");
const { PAYMENT_METHOD } = require("../lib/constants");

router.post("/request", async (req, res) => {
  const db = req.app.db;
  const data = req.body;
  //確認是否已經付款
  const isPaid = await db
    .collection("ordercollection")
    .find({
      orderId: data.orderId,
      //paidAt不等於null
      paidAt: { $ne: null },
    })
    .toArray();

  if (isPaid.length > 0) {
    return res.send({ status: "paid", result: isPaid });
  }
  const encryptOrder = await newebPay(data);

  createOrder(db, {
    ...data,
    ...encryptOrder,
    paymentMethod: PAYMENT_METHOD.NEWEB_PAY,
  });

  res.send({
    status: "success",
    result: encryptOrder,
    url: process.env.NEWEBPAY_PGW_URL,
  });
});

router.post("/decrypt", async (req, res) => {
  const data = createSesDecrypt(req.body.TradeInfo);
  if (data.Status === "SUCCESS") {
    res.send({ status: "success", ...data });
  } else {
    res.send({ status: "fail", ...data });
  }
});

router.post("/notify", async (req, res) => {
  // 解密交易內容
  const db = req.app.db;
  const response = req.body;
  const data = createSesDecrypt(response.TradeInfo);
  // 使用 HASH 再次 SHA 加密字串，確保比對一致（確保不正確的請求觸發交易成功）
  const thisShaEncrypt = createShaEncrypt(res.TradeInfo);
  if (!thisShaEncrypt === res.TradeSha) {
    console.log("付款失敗：TradeSha 不一致");
    return res.end();
  }

  //查詢訂單資訊
  if (data.Status === "SUCCESS") {
    const { MerchantOrderNo, TradeNo } = data.Result;
    const order = await db
      .collection("ordercollection")
      .find({ MerchantOrderNo: Number(MerchantOrderNo) })
      .toArray();

    const orderId = order?.[0]?.orderId;
    if (!orderId) return res.end();
    await updateOrderPaidAt(db, orderId, TradeNo, PAYMENT_METHOD.NEWEB_PAY);
    await updateUploadInfoSellInfo(db, orderId);

    await sendOrderSuccessEmail(db, orderId);

    res.send({ status: "success", ...data });
  }

  return res.end();
});

module.exports = router;
