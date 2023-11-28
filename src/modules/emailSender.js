const nodemailer = require("nodemailer");

const emailSender = (data) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.MAILER_FROM_USER,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.MAILER_REFRESH_TOKEN,
      accessToken: process.env.MAILER_ACCESS_TOKEN,
    },
  });

  const mailOptions = {
    from: process.env.MAILER_FROM_USER + "攝影小隊",
    to: data.email,
    subject: data.subject,
    html: data.html,
    // html: "<h1>這是信件的內容 test</h1>",
  };

  return transporter.sendMail(mailOptions);
};

module.exports = emailSender;
