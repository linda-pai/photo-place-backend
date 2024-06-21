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

module.exports = Object.freeze({
  IMAGE_STATUS,
  REMOVE_IMAGE_STATUS,
  PAYMENT_METHOD,
});
