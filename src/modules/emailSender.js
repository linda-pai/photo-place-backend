const nodemailer = require("nodemailer");

const emailSender = (data) => {
  console.log("data", data);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAILER_USERNAME,
      pass: process.env.MAILER_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.MAILER_FROM_USER + "攝影小隊",
    to: data.email,
    subject: data.subject,
    html: data.html,
    // html: "<h1>這是信件的內容 test</h1>",
  };

  try {
    transporter.sendMail(mailOptions);
    console.log("emailSender----success");
  } catch (err) {
    console.log("emailSender----err", err);
  }
  return;
};

module.exports = emailSender;
