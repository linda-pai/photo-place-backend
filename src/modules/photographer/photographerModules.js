const getAuthorNameById = (db, author) => {
  return db.collection(`photographercollection`).findOne({ author });
};

module.exports = {
  getAuthorNameById,
};
