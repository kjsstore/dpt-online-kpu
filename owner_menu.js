module.exports = async function ownerMenu(
  bot,
  q,
  sendNewMessage,
  OWNER_ID
) {

  if (q.from.id !== OWNER_ID) {
    return bot.answerCallbackQuery(q.id, {
      text: "❌ Khusus owner",
      show_alert: true
    });
  }

  await bot.answerCallbackQuery(q.id);

  const caption = `👑 *MENU OWNER*

Pilih menu owner dibawah`;

  return sendNewMessage(q.message.chat.id, caption, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ ADD STOK", callback_data: "owner_addstok" }],
        [{ text: "🗑️ DELETE STOK", callback_data: "owner_delstok" }],
        [{ text: "📦 LIST STOK ADMIN", callback_data: "owner_listadmin" }],
        [{ text: "📢 BROADCAST", callback_data: "owner_broadcast" }],
        [{ text: "🖼️ BROADCAST FOTO", callback_data: "owner_broadcastfoto" }],
        [{ text: "📤 UPLOAD DATABASE", callback_data: "upload_db" }],
        [{ text: "🔙 BACK TO MAIN MENU", callback_data: "back_to_main" }]
      ]
    }
  }, "owner");
};