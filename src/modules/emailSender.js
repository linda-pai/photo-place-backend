const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
  try {
    const oauth2Client = new OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.MAILER_REFRESH_TOKEN,
    });

    const accessToken = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) {
          console.log("*ERR: ", err);
          reject();
        }
        resolve(token);
      });
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      secure: false,
      auth: {
        type: "OAuth2",
        user: process.env.MAILER_FROM_USER,
        accessToken,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.MAILER_REFRESH_TOKEN,
      },
    });
    return transporter;
  } catch (err) {
    return err;
  }
};

const emailSender = async (data) => {
  try {
    const mailOptions = {
      from: process.env.MAILER_FROM_USER,
      to: data.email,
      subject: data.subject,
      html: data.html,
      // html: "<h1>這是信件的內容 test</h1>",
    };

    let emailTransporter = await createTransporter();
    await emailTransporter.sendMail(mailOptions);
  } catch (err) {
    console.log("ERROR: ", err);
  }
};

module.exports = emailSender;
