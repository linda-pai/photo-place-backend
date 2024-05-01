const getImageInfoByEventId = async (db, eventId, author) => {
  const allImageLength = await db
    .collection(`imagecollection/${eventId}`)
    .countDocuments({
      "image.author": author,
    });

  const featuredLength = await db
    .collection(`imagecollection/${eventId}`)
    .countDocuments({
      "image.author": author,
      isFeatured: true,
    });

  const removeImageLength = await db
    .collection(`imagecollection/${eventId}`)
    .countDocuments({
      "image.author": author,
      isRemoved: true,
    });

  const detectedImageLength = await db
    .collection(`imagecollection/${eventId}`)
    .countDocuments({
      "image.author": author,
      "image.watermarkedUrl": { $exists: true },
    });

  return {
    allImageLength: allImageLength || 0,
    featuredLength: featuredLength || 0,
    removeImageLength: removeImageLength || 0,
    detectedImageLength: detectedImageLength || 0,
  };
};

module.exports = { getImageInfoByEventId };
