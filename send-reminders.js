// API: Kirim Pengingat Harian
// Dijalankan otomatis oleh Vercel Cron tiap hari jam 08:00 WIB
// Bisa juga dipanggil manual via GET /api/send-reminders

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const ORIGIN_LABELS = {
  ditjenim: 'Ditjenim',
  kanim_sampit: 'Kanim Sampit',
  kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar',
  kanwil: 'Kanwil Kemenkum'
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function getUrgency(hariSisa) {
  if (hariSisa === 0) return { emoji: '🚨', label: 'HARI INI' };
  if (hariSisa === 1) return { emoji: '⚠️', label: 'BESOK' };
  if (hariSisa === 7) return { emoji: '⏰', label: '1 MINGGU LAGI' };
  if (hariSisa === 14) return { emoji: '📌', label: '2 MINGGU LAGI' };
  if (hariSisa === 30) return { emoji: '📋', label: '1 BULAN LAGI' };
  return { emoji: '📅', label: `${hariSisa} HARI LAGI` };
}

function getTipeInfo(tipe) {
  const map = {
    pajak: { label: 'PAJAK TAHUNAN', icon: '💰', action: 'perpanjangan pajak' },
    stnk: { label: 'STNK (5 TAHUNAN)', icon: '📄', action: 'perpanjangan STNK' },
    service: { label: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan' },
  };
  return map[tipe] || { label: tipe.toUpperCase(), icon: '📌', action: tipe };
}

function buildPesanPJ(kendaraan, tipe, hariSisa) {
  const urgency = getUrgency(hariSisa);
  const tipeInfo = getTipeInfo(tipe);
  const dueDate = kendaraan.due_date;

  let pesan = `${urgency.emoji} *PENGINGAT ${tipeInfo.label}*\n\n`;
  pesan += `Halo, *${kendaraan.pj}* 👋\n\n`;

  if (hariSisa === 0) {
    pesan += `${tipeInfo.icon} ${tipeInfo.label} kendaraan dinas Anda *jatuh tempo HARI INI*:\n\n`;
  } else {
    pesan += `${tipeInfo.icon} ${tipeInfo.label} kendaraan dinas Anda akan jatuh tempo:\n\n`;
  }

  pesan += `📋 *Detail Kendaraan:*\n`;
  pesan += `• No. Polisi: \`${kendaraan.plate}\`\n`;
  pesan += `• Type: ${kendaraan.type}\n`;
  pesan += `• Jenis: ${kendaraan.jenis}\n`;
  pesan += `• Asal: ${ORIGIN_LABELS[kendaraan.asal] || kendaraan.asal}\n\n`;

  pesan += `📅 *Jatuh Tempo:*\n`;
  pesan += `${formatDate(dueDate)} *(${urgency.label})*\n\n`;

  if (tipe === 'service' && kendaraan.km) {
    pesan += `🛣 *Kilometer saat ini:* ${kendaraan.km.toLocaleString('id-ID')} km\n\n`;
  }

  pesan += `⚠️ Mohon segera proses ${tipeInfo.action} agar tidak terkena denda atau masalah operasional.\n\n`;
  pesan += `_— SIMOPAS Kanim_`;

  return pesan;
}

function buildPesanAdmin(items) {
  if (items.length === 0) {
    return `📊 *RINGKASAN HARIAN SIMOPAS*\n\n✅ Tidak ada kendaraan yang perlu diingatkan hari ini.\n\n_— SIMOPAS Kanim_`;
  }

  let pesan = `📊 *RINGKASAN HARIAN SIMOPAS*\n\n`;
  pesan += `Total ${items.length} pengingat dikirim hari ini:\n\n`;

  const grouped = {};
  items.forEach(item => {
    const key = item.tipe;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  Object.keys(grouped).forEach(tipe => {
    const tipeInfo = getTipeInfo(tipe);
    pesan += `${tipeInfo.icon} *${tipeInfo.label}*\n`;
    grouped[tipe].forEach(item => {
      const urgency = getUrgency(item.hari_sisa);
      pesan += `• \`${item.plate}\` - ${item.pj} (${urgency.label})\n`;
    });
    pesan += `\n`;
  });

  pesan += `_— SIMOPAS Kanim_`;
  return pesan;
}

async function sendTelegram(chatId, text) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });
    const data = await res.json();
    return { success: data.ok, error: data.description };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default async function handler(req, res) {
  // Cek otorisasi: Vercel cron pakai header authorization
  const authHeader = req.headers.authorization;
  const isVercelCron = authHeader === `Bearer ${CRON_SECRET}`;
  const isManualCall = req.query.secret === CRON_SECRET;

  if (!isVercelCron && !isManualCall) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Ambil semua kendaraan yang due hari ini (H-30, H-14, H-7, H-1, hari-H)
    const { data: dueList, error: errDue } = await supabase
      .from('v_kendaraan_due_today')
      .select('*');

    if (errDue) throw errDue;

    const results = {
      total_due: dueList.length,
      sent_pj: 0,
      sent_admin: 0,
      skipped: 0,
      errors: [],
    };

    // Kirim ke setiap PJ
    for (const item of dueList) {
      // Skip kalau notifikasi Telegram tidak aktif
      if (!item.notif_tg) {
        results.skipped++;
        continue;
      }

      // Skip kalau tidak ada chat_id
      if (!item.telegram_chat_id) {
        results.errors.push(`${item.plate}: tidak ada Telegram Chat ID`);
        continue;
      }

      // Cek apakah sudah dikirim hari ini (avoid duplikat)
      const today = new Date().toISOString().split('T')[0];
      const { data: existingLog } = await supabase
        .from('notifikasi_log')
        .select('id')
        .eq('kendaraan_id', item.id)
        .eq('tipe', item.tipe_due)
        .eq('channel', 'telegram')
        .eq('status', 'sent')
        .gte('created_at', today + 'T00:00:00')
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        results.skipped++;
        continue;
      }

      // Kirim pesan
      const pesan = buildPesanPJ(item, item.tipe_due, item.hari_sisa);
      const result = await sendTelegram(item.telegram_chat_id, pesan);

      // Log hasilnya
      await supabase.from('notifikasi_log').insert({
        kendaraan_id: item.id,
        tipe: item.tipe_due,
        hari_ke: item.hari_sisa,
        channel: 'telegram',
        status: result.success ? 'sent' : 'failed',
        pesan: pesan,
        error_msg: result.error,
      });

      // Update last_sent di kendaraan
      if (result.success) {
        await supabase
          .from('kendaraan')
          .update({ last_sent: today })
          .eq('id', item.id);
        results.sent_pj++;
      } else {
        results.errors.push(`${item.plate}: ${result.error}`);
      }

      // Delay kecil supaya tidak rate limit Telegram (30 msg/detik)
      await new Promise(r => setTimeout(r, 100));
    }

    // Kirim ringkasan ke semua admin
    const { data: admins } = await supabase
      .from('admin_chats')
      .select('telegram_chat_id, nama')
      .eq('aktif', true);

    if (admins && admins.length > 0) {
      const pesanAdmin = buildPesanAdmin(dueList);
      for (const admin of admins) {
        const result = await sendTelegram(admin.telegram_chat_id, pesanAdmin);
        if (result.success) results.sent_admin++;
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });

  } catch (err) {
    console.error('Reminder error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
