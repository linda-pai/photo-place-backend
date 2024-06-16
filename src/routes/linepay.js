const express = require("express");
const router = express.Router();

const linePay = require("../modules/linePay/linePay");
const linePayConfirm = require("../modules/linePay/linePayConfirm");
const {
  createOrder,
  updateOrderPaidAt,
  updateUploadInfoSellInfo,
  sendOrderSuccessEmail,
} = require("../modules/order/orderModules");
const { PAYMENT_METHOD } = require("../lib/constants");

//line pay request
router.post("/request", async (req, res) => {
  const db = req.app.db;
  const { orderId, amount, items, isMobile, orderBy } = req.body;

  //確認是否已經付款
  const isPaid = await db
    .collection("ordercollection")
    .find({
      orderId: orderId,
      //paidAt不等於null
      paidAt: { $ne: null },
    })
    .toArray();

  if (isPaid.length > 0) {
    return res.send({ status: "paid", result: isPaid });
  }

  const refinedProducts = items.map((item) => ({
    id: item.id,
    name: item.eventName + " " + item.id,
    imageUrl: item.watermarkedUrl,
    quantity: 1,
    price: item.price,
  }));

  createOrder(db, {
    orderId,
    totalAmount: amount,
    items,
    orderBy,
    paymentMethod: PAYMENT_METHOD.LINE_PAY,
  });

  const linePayRequest = await linePay(
    orderId,
    amount,
    refinedProducts,
    isMobile
  );
  res.send({ status: "success", result: linePayRequest });
});

//linePay confirm
router.post("/confirm", async (req, res) => {
  const db = req.app.db;
  const { orderId, transactionId } = req.body;

  //查詢訂單金額
  const order = await db
    .collection("ordercollection")
    .find({ orderId })
    .toArray();

  const amount = order[0].totalAmount;

  const linePayResult = await linePayConfirm(transactionId, amount);

  try {
    if (linePayResult.returnCode === "0000") {
      await updateOrderPaidAt(
        db,
        orderId,
        transactionId,
        PAYMENT_METHOD.LINE_PAY
      );
      await updateUploadInfoSellInfo(db, orderId);

      await sendOrderSuccessEmail(db, orderId);

      res.send({ status: "success", result: linePayResult });
    }
  } catch (error) {
    res.send({ status: "fail", result: linePayResult });
  }
});

module.exports = router;
