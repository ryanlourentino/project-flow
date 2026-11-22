// Notifications: short messages for a user (e.g. "The Admin removed your listing ...").
// They are stored now and shown on the Dashboard later.
// db can be the pool or a connection inside a transaction (both have execute()).
async function notify(db, userId, message) {
  if (!userId) return; // e.g. a catalog product from the source data has no seller to tell
  await db.execute('INSERT INTO Notifications (user_id, message) VALUES (?, ?)', [userId, String(message).slice(0, 500)]);
}

module.exports = { notify };
