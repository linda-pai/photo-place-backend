const express = require("express");
const router = express.Router();

const dotenv = require("dotenv");
dotenv.config();

const { withDB } = require("../database/db");

router.get("/users", (req, res) => {
  withDB(async (db) => {
    const users = await db.collection("usercollection").find({}).toArray();
    return res.status(200).json(users);
  }, res);
});

router.post("/createUser", (req, res) => {
  withDB(async (db) => {
    const user = req.body;
    //check if user already exists
    const userExist = await db
      .collection("usercollection")
      .find({ email: user.email })
      .toArray();

    console.log("userExist", userExist);

    if (userExist.length > 0) {
      const result = await db
        .collection("usercollection")
        .updateOne({ email: user.email }, { $set: { token: user.token } });
      return res.status(200).json(result);
    } else {
      const result = await db.collection("usercollection").insertOne(user);
      return res.status(200).json(result);
    }
  }, res);
});

router.get("/getUserInfo/:token", (req, res) => {
  //TODO: 用 withDB 速度會變慢，待解決
  withDB(async (db) => {
    const user = await db
      .collection("usercollection")
      .find({ token: req.params.token })
      .project({ token: 1, email: 1, name: 1 })
      .toArray();
    return res.status(200).json(user);
  }, res);
});

module.exports = router;
