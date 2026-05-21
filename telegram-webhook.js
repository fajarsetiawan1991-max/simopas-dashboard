// API: Telegram Webhook
// Dipanggil oleh Telegram saat ada user chat bot
// Setup: POST ke https://api.telegram.org/bot<TOKEN>/setWebhook
//        dengan url=https://your-vercel-app.vercel.app/api/telegram-webhook

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Telegram Webhook SIMOPAS - OK');
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  try {
    const update = req.body;
    const message = update.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const firstName = message.chat.first_name || 'Sahabat';
    const text = message.text.toLowerCase();

    let reply = '';

    if (text === '/start' || text === '/mulai') {
      reply = `👋 Selamat datang di *SIMOPAS Bot*, ${firstName}!\n\n`;
      reply += `Bot ini akan mengirim pengingat otomatis terkait:\n`;
      reply += `💰 Pajak tahunan kendaraan\n`;
      reply += `📄 STNK 5 tahunan\n`;
      reply += `🔧 Service berkala\n\n`;
      reply += `📋 *Chat ID Anda:*\n\`${chatId}\`\n\n`;
      reply += `📝 *Cara daftar:*\n`;
      reply += `1. Copy Chat ID di atas (tap kotak di atas untuk auto-copy)\n`;
      reply += `2. Kirim Chat ID tersebut ke admin SIMOPAS\n`;
      reply += `3. Admin akan input ke sistem\n`;
      reply += `4. Anda akan otomatis dapat pengingat\n\n`;
      reply += `Ketik /chatid kapan saja untuk lihat Chat ID lagi.\n`;
      reply += `Ketik /help untuk daftar perintah.`;
    } else if (text === '/chatid' || text === '/id') {
      reply = `📋 *Chat ID Anda:*\n\`${chatId}\`\n\n`;
      reply += `Tap kotak di atas untuk auto-copy, lalu kirim ke admin SIMOPAS.`;
    } else if (text === '/help' || text === '/bantuan') {
      reply = `🤖 *Perintah Bot SIMOPAS:*\n\n`;
      reply += `/start - Mulai & dapatkan Chat ID\n`;
      reply += `/chatid - Lihat Chat ID Anda\n`;
      reply += `/help - Bantuan\n\n`;
      reply += `Bot ini hanya mengirim pengingat. Untuk pertanyaan lain, hubungi admin SIMOPAS.`;
    } else {
      reply = `Halo ${firstName}! 👋\n\n`;
      reply += `Bot ini khusus untuk pengingat otomatis SIMOPAS.\n\n`;
      reply += `Ketik /start untuk dapatkan Chat ID Anda, atau /help untuk daftar perintah.`;
    }

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: reply,
        parse_mode: 'Markdown',
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
