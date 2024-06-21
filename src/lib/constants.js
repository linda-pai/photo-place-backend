const PAYMENT_METHOD = {
  LINE_PAY: 2,
  NEWEB_PAY: 3,
};

const IMAGE_STATUS = {
  IDENTIFYED: "3",
  UNIDENTIFYED: "4",
  MORE: "5",
  ALL: "1",
};

const REMOVE_IMAGE_STATUS = {
  REMOVE: "1",
  REPORTED: "2",
  FEATURED: "3",
};

const REPORT_TYPE_TRANS = {
  //照片涉及色情、暴力
  1: "照片涉及色情、暴力",
  //照片涉及侵權
  2: "照片涉及侵權",
  //照片涉及仇恨或惡意
  3: "照片涉及仇恨或惡意",
  //照片涉及騷擾
  4: "照片涉及騷擾",
};

module.exports = Object.freeze({
  IMAGE_STATUS,
  REMOVE_IMAGE_STATUS,
  PAYMENT_METHOD,
  REPORT_TYPE_TRANS,
});
