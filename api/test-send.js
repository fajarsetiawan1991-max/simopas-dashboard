// API: Test Kirim Notifikasi Manual
// Dipanggil dari dashboard saat klik tombol "Kirim Notif"
// POST /api/test-send dengan body: { kendaraan_id, tipe }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ORIGIN_LABELS terbaru — sync dengan shared.js
const ORIGIN_LABELS = {
  ditjenim: 'Ditjenim Pusat',
  kanwil_ditjenim: 'Kanwil Ditjenim Kalteng',
  kanim_sampit: 'Kanim Sampit',
  kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar',
  kanwil: 'Kanwil Kemenkum',
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

function getTipeInfo(tipe) {
  const map = {
    pajak: { label: 'PAJAK TAHUNAN', icon: '💰', action: 'perpanjangan pajak', dateKey: 'pajak_date' },
    stnk:  { label: 'STNK (5 TAHUNAN)', icon: '📄', action: 'perpanjangan STNK', dateKey: 'stnk_date' },
    service: { label: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan', dateKey: 'service_date' },
  };
  return map[tipe] || null;
}

// Escape karakter khusus HTML untuk Telegram HTML mode
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildPesan(kendaraan, tipe) {
  const tipeInfo = getTipeInfo(tipe);
  if (!tipeInfo) return null;

  const dueDate = kendaraan[tipeInfo.dateKey];
  const hariSisa = daysUntil(dueDate);

  if (hariSisa === null) return null;

  let urgencyLabel;
  if (hariSisa < 0)      urgencyLabel = `SUDAH LEWAT ${Math.abs(hariSisa)} HARI`;
  else if (hariSisa === 0) urgencyLabel = 'HARI INI';
  else if (hariSisa === 1) urgencyLabel = 'BESOK';
  else                    urgencyLabel = `${hariSisa} HARI LAGI`;

  const asalLabel = escHtml(ORIGIN_LABELS[kendaraan.asal] || kendaraan.asal);

  // Gunakan HTML mode — jauh lebih aman dari Markdown
  let pesan = `🔔 <b>PENGINGAT ${tipeInfo.label}</b>\n\n`;
  pesan += `Kepada Yth.\n`;
  pesan += `<b>Bapak/Ibu ${escHtml(kendaraan.pj)}</b>\n\n`;
  pesan += `Dengan hormat,\n\n`;
  pesan += `${tipeInfo.icon} ${tipeInfo.label} kendaraan dinas yang Bapak/Ibu pegang:\n\n`;
  pesan += `📋 <b>Detail Kendaraan:</b>\n`;
  pesan += `• No. Polisi: <code>${escHtml(kendaraan.plate)}</code>\n`;
  pesan += `• Kendaraan: ${escHtml(kendaraan.type)}\n`;
  pesan += `• Jenis: ${escHtml(kendaraan.jenis)}\n`;
  pesan += `• Asal: ${asalLabel}\n\n`;
  pesan += `📅 <b>Jatuh Tempo:</b>\n`;
  pesan += `${formatDate(dueDate)} <b>(${urgencyLabel})</b>\n\n`;

  if (tipe === 'service' && kendaraan.km) {
    pesan += `🛣 <b>Kilometer saat ini:</b> ${kendaraan.km.toLocaleString('id-ID')} km\n\n`;
  }

  pesan += `⚠️ Mohon segera proses ${tipeInfo.action} agar tidak terkena denda atau masalah operasional.\n\n`;
  pesan += `<i>— Hormat kami, Tim SIMOPAS Kanwil Ditjenim Kalteng</i>`;

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
        parse_mode: 'HTML',  // HTML lebih aman dari Markdown
      }),
    });
    const data = await res.json();
    return { success: data.ok, error: data.description };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { kendaraan_id, tipe } = req.body;

  if (!kendaraan_id || !tipe) return res.status(400).json({ error: 'kendaraan_id dan tipe wajib diisi' });
  if (!['pajak', 'stnk', 'service'].includes(tipe)) return res.status(400).json({ error: 'tipe harus pajak, stnk, atau service' });

  try {
    const { data: kendaraan, error: errK } = await supabase
      .from('kendaraan').select('*').eq('id', kendaraan_id).single();

    if (errK || !kendaraan) return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });

    if (!kendaraan.telegram_chat_id) {
      return res.status(400).json({
        error: 'PJ belum mendaftar di bot Telegram. Minta PJ chat bot dulu untuk dapatkan Chat ID.'
      });
    }

    const pesan = buildPesan(kendaraan, tipe);
    if (!pesan) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi di kendaraan ini` });

    const result = await sendTelegram(kendaraan.telegram_chat_id, pesan);

    await supabase.from('notifikasi_log').insert({
      kendaraan_id: kendaraan.id,
      tipe,
      hari_ke: daysUntil(kendaraan[getTipeInfo(tipe).dateKey]),
      channel: 'telegram',
      status: result.success ? 'sent' : 'failed',
      pesan,
      error_msg: result.error,
    });

    if (result.success) {
      await supabase.from('kendaraan')
        .update({ last_sent: new Date().toISOString().split('T')[0] })
        .eq('id', kendaraan.id);

      return res.status(200).json({ success: true, message: `Pengingat ${tipe} terkirim ke ${kendaraan.pj}` });
    } else {
      return res.status(500).json({ success: false, error: result.error || 'Gagal kirim Telegram' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
