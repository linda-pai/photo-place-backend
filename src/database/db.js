const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
const DATABASE_NAME = "photopacerdb";

const withDB = async (operations, res) => {
  try {
    const client = await MongoClient.connect(CONNECTION_STRING);
    const db = client.db(DATABASE_NAME);
    await operations(db);
    client.close();
  } catch (error) {
    res.status(500).json({ message: "Error connecting to db", error });
  }
};

module.exports = { withDB };
