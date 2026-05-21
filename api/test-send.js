// API: Test Kirim Notifikasi Manual
// Dipanggil dari dashboard saat klik tombol "Kirim Pengingat"
// POST /api/test-send dengan body: { kendaraan_id, tipe }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const ORIGIN_LABELS = {
  ditjenim: 'Ditjenim',
  kanim_sampit: 'Kanim Sampit',
  kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar',
  kanwil: 'Kanwil Kemenkum'
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
    stnk: { label: 'STNK (5 TAHUNAN)', icon: '📄', action: 'perpanjangan STNK', dateKey: 'stnk_date' },
    service: { label: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan', dateKey: 'service_date' },
  };
  return map[tipe] || null;
}

function buildPesan(kendaraan, tipe) {
  const tipeInfo = getTipeInfo(tipe);
  if (!tipeInfo) return null;

  const dueDate = kendaraan[tipeInfo.dateKey];
  const hariSisa = daysUntil(dueDate);

  let urgencyLabel = '';
  if (hariSisa === null) {
    return null;
  } else if (hariSisa < 0) {
    urgencyLabel = `SUDAH LEWAT ${Math.abs(hariSisa)} HARI`;
  } else if (hariSisa === 0) {
    urgencyLabel = 'HARI INI';
  } else if (hariSisa === 1) {
    urgencyLabel = 'BESOK';
  } else {
    urgencyLabel = `${hariSisa} HARI LAGI`;
  }

  let pesan = `🔔 *PENGINGAT ${tipeInfo.label}*\n\n`;
  pesan += `Halo, *${kendaraan.pj}* 👋\n\n`;
  pesan += `${tipeInfo.icon} ${tipeInfo.label} kendaraan dinas Anda:\n\n`;

  pesan += `📋 *Detail Kendaraan:*\n`;
  pesan += `• No. Polisi: \`${kendaraan.plate}\`\n`;
  pesan += `• Type: ${kendaraan.type}\n`;
  pesan += `• Jenis: ${kendaraan.jenis}\n`;
  pesan += `• Asal: ${ORIGIN_LABELS[kendaraan.asal] || kendaraan.asal}\n\n`;

  pesan += `📅 *Jatuh Tempo:*\n`;
  pesan += `${formatDate(dueDate)} *(${urgencyLabel})*\n\n`;

  if (tipe === 'service' && kendaraan.km) {
    pesan += `🛣 *Kilometer saat ini:* ${kendaraan.km.toLocaleString('id-ID')} km\n\n`;
  }

  pesan += `⚠️ Mohon segera proses ${tipeInfo.action}.\n\n`;
  pesan += `_— SIMOPAS Kanim (Test Pengingat)_`;

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
  // CORS untuk panggilan dari dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifikasi user login via Supabase JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Setelah user login terverifikasi, pakai service key untuk akses penuh
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { kendaraan_id, tipe } = req.body;

  if (!kendaraan_id || !tipe) {
    return res.status(400).json({ error: 'kendaraan_id dan tipe wajib diisi' });
  }

  if (!['pajak', 'stnk', 'service'].includes(tipe)) {
    return res.status(400).json({ error: 'tipe harus pajak, stnk, atau service' });
  }

  try {
    const { data: kendaraan, error: errK } = await supabase
      .from('kendaraan')
      .select('*')
      .eq('id', kendaraan_id)
      .single();

    if (errK || !kendaraan) {
      return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });
    }

    if (!kendaraan.telegram_chat_id) {
      return res.status(400).json({
        error: 'PJ belum mendaftar di bot Telegram. Minta PJ chat bot dulu untuk dapatkan Chat ID.'
      });
    }

    const pesan = buildPesan(kendaraan, tipe);
    if (!pesan) {
      return res.status(400).json({ error: `Tanggal ${tipe} belum diisi di kendaraan ini` });
    }

    const result = await sendTelegram(kendaraan.telegram_chat_id, pesan);

    await supabase.from('notifikasi_log').insert({
      kendaraan_id: kendaraan.id,
      tipe: tipe,
      hari_ke: daysUntil(kendaraan[getTipeInfo(tipe).dateKey]),
      channel: 'telegram',
      status: result.success ? 'sent' : 'failed',
      pesan: pesan,
      error_msg: result.error,
    });

    if (result.success) {
      await supabase
        .from('kendaraan')
        .update({ last_sent: new Date().toISOString().split('T')[0] })
        .eq('id', kendaraan.id);

      return res.status(200).json({
        success: true,
        message: `Pengingat ${tipe} terkirim ke ${kendaraan.pj}`
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Gagal kirim Telegram'
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
