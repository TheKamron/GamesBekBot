import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./models/User.js";
import Media from "./models/Media.js";
import express from "express";
import moment from "moment-timezone";
dotenv.config();

const app = express();
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
await mongoose.connect(process.env.MONGO_URI);
const adminId = process.env.ADMIN_ID;
const ownerId = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

const tempSteps = new Map();
const tempSteps_2 = new Map();
const subChannels = new Set();

app.get("/", (req, res) => {
  res.send("Bot is running...");
});
// fake port 
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
console.log('Bot Started!')

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  const existingUser = await User.findOne({ userId: user.id });
  if (!existingUser) {
    await User.create({
      userId: user.id,
      first_name: user.first_name,
      username: user.username,
      language_code: user.language_code
    });

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const username = user.username ? `@${user.username}` : '—';
    await bot.sendMessage(adminId, `🆕 *Yangi foydalanuvchi qo‘shildi:*\n👤 Ism: ${fullName}\n🔗 Username: ${username}\n🆔 ID: ${user.id}`, {
      parse_mode: 'Markdown'
    });
    await bot.sendMessage(ownerId, `🆕 *Yangi foydalanuvchi qo‘shildi:*\n👤 Ism: ${fullName}\n🔗 Username: ${username}\n🆔 ID: ${user.id}`, {
      parse_mode: 'Markdown'
    });
  }

  bot.sendMessage(chatId, ` Assalomu alaykum 👋🏻\nGames Bek botiga xush kelibsiz 💪🏻 sizga kerakli kodni yuboring 🤝🏻\nKodlar ro’yxati: <a href="https://t.me/gamesbek_uz"><b>@gamesbek_uz</b></a>`, {parse_mode: "HTML"});
});

bot.onText(/\/kanal/, async (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;

  tempSteps.set(userId, { step: "awaiting_channel_username" });
  bot.sendMessage(userId, "📢 Iltimos, kanal username'ini yuboring. Masalan: `@gamesbek`", {
    parse_mode: "Markdown"
  });
});

bot.onText(/\/stop_kanal/, async (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;

  if (subChannels.size == 0) {
    return bot.sendMessage(userId, "📭 Obuna talab qilingan hech qanday kanal topilmadi.");
  }

  const buttons = [...subChannels].map(channel => ([{
    text: `❌ ${channel}`,
    callback_data: `remove_channel_${channel.replace('@', '')}`
  }]));

  await bot.sendMessage(userId, "Quyidagi kanallardan birini olib tashlang:", {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
});

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const text = msg.text?.trim();
  const temp = tempSteps.get(userId);
  const temp_2 = tempSteps_2.get(userId);

  if (temp?.step === "awaiting_channel_username") {
    if (!/^@[\w\d_]+$/.test(text)) {
      return bot.sendMessage(userId, "❌ Noto‘g‘ri format. Username '@' bilan boshlanishi va faqat harf, raqam yoki '_' dan iborat bo‘lishi kerak.");
    }
    subChannels.add(text);
    tempSteps.delete(userId);
    return bot.sendMessage(userId, `✅ ${text} kanali obuna kanallar ro‘yxatiga qo‘shildi.`);
  }

  const isAdmin = userId == adminId;
  const isOwner = userId == ownerId;
  const isPrivileged = isAdmin || isOwner;

  if (isPrivileged && text && !text.startsWith('/')) {
    if (temp?.step === 'awaiting_code') {
      if (!/^\d+$/.test(text)) return bot.sendMessage(userId, '❌ Kod faqat raqamlardan iborat bo‘lishi kerak.');
      const numericCode = Number(text);
      const exists = await Media.findOne({ code: numericCode });
      if (exists) return bot.sendMessage(userId, '⚠️ Bu kod allaqachon mavjud.');

      tempSteps.set(userId, { ...temp, code: numericCode, step: 'awaiting_description' });
      return bot.sendMessage(userId, '📝 Endi fayl uchun izoh yuboring:');
    }

    if (temp?.step === 'awaiting_description') {
      const { file_id, file_name, code } = temp;
      await Media.create({ code, file_id, file_name, caption: text });
      tempSteps.delete(userId);
      return bot.sendMessage(userId, `✅ Fayl saqlandi!\n📁 Kod: ${code}\n📎 Fayl: ${file_name}\n📝 Izoh: ${text}`);
    }

    if (temp_2?.step === 'awaiting_file_code') {
      const code = Number(text);
      const fileData = await Media.findOne({ code });
      if (!fileData) return bot.sendMessage(userId, '❌ Bu kodga mos fayl topilmadi.');
      await Media.deleteOne({ code });
      tempSteps_2.delete(userId);
      return bot.sendMessage(userId, `🗑 Fayl o‘chirildi!\n📁 Kod: ${code}\n📎 Fayl: ${fileData.file_name}`);
    }
  }

  if (text && !text.startsWith('/') && !msg.document && !temp && !temp_2) {
    const isSubscribed = await isSubscribedToAll(userId);
    if (!isSubscribed) {
      return bot.sendMessage(userId, `📢 Iltimos, quyidagi kanallarga obuna bo‘ling:`, {
        reply_markup: {
          inline_keyboard: [
            ...[...subChannels].map(c => [{ text: c, url: `https://t.me/${c.replace('@', '')}` }]),
            [{ text: "✅ Obunani tekshirish", callback_data: 'check_sub' }]
          ]
        }
      });
    }

    const media = await Media.findOne({ code: Number(text) });
    if (!media) return bot.sendMessage(userId, '❌ Bunday kod topilmadi.');
    return bot.sendDocument(userId, media.file_id, { caption: media.caption || `📁 Kod: ${media.code}` });
  }
});

bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const isSubscribed = await isSubscribedToAll(userId);
  const data = query.data

  if (data == 'check_sub') {
    await bot.answerCallbackQuery(query.id, { text: isSubscribed ? "✅ Obuna tasdiqlandi!" : "❌ Siz hali obuna bo‘lmadingiz!", show_alert: true });
    if (isSubscribed) {
      await bot.sendMessage(userId, "✅ Obunangiz tasdiqlandi. Endi kod yuborishingiz mumkin.");
    }
  }

  if (data.startsWith("remove_channel_")) {
    const username = '@' + data.replace("remove_channel_", "");

    if (subChannels.has(username)) {
      subChannels.delete(username);
      await bot.answerCallbackQuery(query.id, { text: `❌ ${username} o‘chirildi`, show_alert: true });
      await bot.sendMessage(userId, `✅ ${username} kanal obuna ro‘yxatidan olib tashlandi.`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: "⚠️ Kanal topilmadi.", show_alert: true });
    }
  }
});

bot.onText(/\/new/, async (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;
  tempSteps.set(userId, { step: 'awaiting_file' });
  bot.sendMessage(userId, '📤 Iltimos, faylni yuboring:');
});

bot.on('document', async (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;

  const current = tempSteps.get(userId);
  if (!current || current.step !== 'awaiting_file') return;

  const { file_id, file_name } = msg.document;
  tempSteps.set(userId, { step: 'awaiting_code', file_id, file_name });
  bot.sendMessage(userId, '✏️ Kod yuboring:');
});

bot.onText(/\/delete/, (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;
  tempSteps_2.set(userId, { step: 'awaiting_file_code' });
  bot.sendMessage(userId, '🗑 Fayl kodini yuboring:');
});

bot.onText(/\/list/, async (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;
  const medias = await Media.find();
  if (!medias.length) return bot.sendMessage(userId, '📭 Fayllar mavjud emas.');

  let text = '📂 Mavjud fayllar:\n\n';
  medias.forEach(media => {
    text += `🆔 Kod: \`${media.code}\`\n📎 Fayl: *${media.file_name}*\n📝 Izoh: ${media.caption || '—'}\n\n`;
  });
  bot.sendMessage(userId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/stats/, async (msg) => {
  const userId = msg.from.id;
  if (userId != adminId && userId != ownerId) return;

  const users = await User.find().sort({ createdAt: -1 });
  const media = await Media.find();
  const userCount = users.length;
  const mediaCount = media.length;

  let latestUserTime = "—";
  if (userCount > 0) {
    const latest = users[0].createdAt;
    latestUserTime = moment(latest).tz("Asia/Tashkent").format("HH:mm DD.MM.YYYY");
  }

  const text = `📊 <b>Statistika:</b>\n\n👥 Foydalanuvchilar soni: <b>${userCount}</b>\n📁 Jami fayllar: <b>${mediaCount}</b>\n🕓 Oxirgi start bosilgan vaqt: <b>${latestUserTime}</b>`;

  bot.sendMessage(userId, text, { parse_mode: "HTML" });
});


bot.onText(/\/cancel/, (msg) => {
  tempSteps.delete(msg.from.id);
  tempSteps_2.delete(msg.from.id);
  bot.sendMessage(msg.chat.id, '❌ Jarayon bekor qilindi.');
});

async function isSubscribedToAll(userId) {
  for (const channel of subChannels) {
    try {
      const member = await bot.getChatMember(channel, userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

