// API: Test Kirim Notifikasi Manual (Telegram + Email)
// POST /api/test-send body: { kendaraan_id, tipe, channel }

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM_NAME = process.env.FROM_NAME || 'SIMOPAS Kanwil Ditjenim Kalteng';

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const ORIGIN_LABELS = {
  ditjenim: 'Sewa Sekjen',
  sewa_kanwil_ditjenim: 'Sewa Kanwil Ditjenim Kalteng',
  kanwil_ditjenim: 'Kanwil Ditjenim Kalteng',
  kanim_sampit: 'Kanim Sampit',
  kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar',
  kanwil: 'Kanwil Kemenkum',
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
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

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getUrgency(hariSisa) {
  if (hariSisa < 0)  return `SUDAH LEWAT ${Math.abs(hariSisa)} HARI`;
  if (hariSisa === 0) return 'HARI INI';
  if (hariSisa === 1) return 'BESOK';
  return `${hariSisa} HARI LAGI`;
}

// Service berbasis KM: interval otomatis Motor 3.000 / Mobil 10.000
function getServiceInterval(jenis) {
  if (!jenis) return 10000;
  return String(jenis).toLowerCase() === 'motor' ? 3000 : 10000;
}

function getKmInfo(k) {
  const interval = getServiceInterval(k.jenis);
  const kmTarget = (k.km_service_start || 0) + interval;
  const kmSisa = kmTarget - (k.km || 0);
  const urgency = kmSisa <= 0
    ? `SUDAH LEWAT ${Math.abs(kmSisa).toLocaleString('id-ID')} KM`
    : `SISA ${kmSisa.toLocaleString('id-ID')} KM LAGI`;
  return { interval, kmTarget, kmSisa, urgency };
}

function buildPesanTelegram(k, tipe) {
  const t = getTipeInfo(tipe);

  // === SERVICE: berbasis KM, bukan tanggal ===
  if (tipe === 'service') {
    const km = getKmInfo(k);
    const asalLabel = escHtml(ORIGIN_LABELS[k.asal] || k.asal);
    let p = `🔧 <b>PENGINGAT SERVICE BERKALA</b>\n\n`;
    p += `Kepada Yth.\n<b>Bapak/Ibu ${escHtml(k.pj)}</b>\n\nDengan hormat,\n\n`;
    p += `Kendaraan dinas yang Bapak/Ibu pegang perlu diperhatikan jadwal servicenya:\n\n`;
    p += `📋 <b>Detail Kendaraan:</b>\n`;
    p += `• No. Polisi: <code>${escHtml(k.plate)}</code>\n`;
    p += `• Kendaraan: ${escHtml(k.type)}\n`;
    p += `• Jenis: ${escHtml(k.jenis)}\n`;
    p += `• Asal: ${asalLabel}\n\n`;
    p += `🛣 <b>Status Kilometer:</b>\n`;
    p += `• KM Saat Ini: ${(k.km || 0).toLocaleString('id-ID')} km\n`;
    p += `• KM Target Service: ${km.kmTarget.toLocaleString('id-ID')} km\n`;
    p += `• Status: <b>${km.urgency}</b>\n\n`;
    p += `⚠️ Mohon segera jadwalkan service kendaraan.\n\n`;
    p += `<i>— Hormat kami, Tim SIMOPAS Kanwil Ditjenim Kalteng</i>`;
    return p;
  }

  const dueDate = k[t.dateKey];
  const hariSisa = daysUntil(dueDate);
  if (hariSisa === null) return null;
  const urgency = getUrgency(hariSisa);
  const asalLabel = escHtml(ORIGIN_LABELS[k.asal] || k.asal);

  let p = `🔔 <b>PENGINGAT ${t.label}</b>\n\n`;
  p += `Kepada Yth.\n<b>Bapak/Ibu ${escHtml(k.pj)}</b>\n\nDengan hormat,\n\n`;
  p += `${t.icon} ${t.label} kendaraan dinas yang Bapak/Ibu pegang:\n\n`;
  p += `📋 <b>Detail Kendaraan:</b>\n`;
  p += `• No. Polisi: <code>${escHtml(k.plate)}</code>\n`;
  p += `• Kendaraan: ${escHtml(k.type)}\n`;
  p += `• Jenis: ${escHtml(k.jenis)}\n`;
  p += `• Asal: ${asalLabel}\n\n`;
  p += `📅 <b>Jatuh Tempo:</b>\n${formatDate(dueDate)} <b>(${urgency})</b>\n\n`;
  if (tipe === 'service' && k.km) p += `🛣 <b>Kilometer saat ini:</b> ${k.km.toLocaleString('id-ID')} km\n\n`;
  p += `⚠️ Mohon segera proses ${t.action} agar tidak terkena denda atau masalah operasional.\n\n`;
  p += `<i>— Hormat kami, Tim SIMOPAS Kanwil Ditjenim Kalteng</i>`;
  return p;
}

function buildEmailHtml(k, tipe) {
  const t = getTipeInfo(tipe);
  let urgency, uc, dueDateRow, kmRow = '';

  if (tipe === 'service') {
    // === SERVICE: berbasis KM ===
    const km = getKmInfo(k);
    urgency = km.urgency;
    uc = km.kmSisa <= 0 ? '#DC2626' : km.kmSisa <= Math.round(km.interval * 0.1) ? '#F59E0B' : '#059669';
    dueDateRow = `<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;font-weight:600;">KM Target Service</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:700;color:${uc};">${km.kmTarget.toLocaleString('id-ID')} km</td></tr>`;
    kmRow = `<tr><td style="padding:10px 0;color:#6b7280;font-size:12px;font-weight:600;">KM Saat Ini</td><td style="padding:10px 0;font-size:14px;font-weight:600;">${(k.km || 0).toLocaleString('id-ID')} km</td></tr>`;
  } else {
    const dueDate = k[t.dateKey];
    const hariSisa = daysUntil(dueDate);
    if (hariSisa === null) return null;
    urgency = getUrgency(hariSisa);
    uc = hariSisa < 0 ? '#DC2626' : hariSisa <= 7 ? '#F59E0B' : '#059669';
    dueDateRow = `<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;font-weight:600;">Jatuh Tempo</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:700;color:${uc};">${formatDate(dueDate)}</td></tr>`;
  }

  const asalLabel = escHtml(ORIGIN_LABELS[k.asal] || k.asal);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#f4f4f5;line-height:1.6;">
<div style="max-width:620px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
<div style="background:linear-gradient(135deg,#1E3A8A,#4338ca);padding:32px 24px;color:white;text-align:center;">
<div style="font-size:36px;margin-bottom:8px;">${t.icon}</div>
<h1 style="margin:0;font-size:24px;font-weight:700;">Pengingat ${t.label}</h1>
<div style="margin-top:8px;font-size:13px;opacity:0.9;">SIMOPAS — Kanwil Ditjenim Kalteng</div></div>
<div style="background:${uc};color:white;text-align:center;padding:14px;font-weight:700;font-size:14px;">⚠️ ${urgency}</div>
<div style="padding:32px 28px;color:#1f2937;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;">Kepada Yth.</p>
<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1E3A8A;">Bapak/Ibu ${escHtml(k.pj)}</p>
<p style="margin:0 0 14px;font-size:14px;">Dengan hormat,</p>
<p style="margin:0 0 14px;font-size:14px;text-align:justify;">${t.label} kendaraan dinas yang Bapak/Ibu pegang akan segera jatuh tempo.</p>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin:20px 0;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;font-weight:600;width:140px;">No. Polisi</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;"><span style="background:white;border:2px solid #000;padding:6px 12px;font-family:monospace;font-weight:700;letter-spacing:2px;border-radius:4px;font-size:16px;">${escHtml(k.plate)}</span></td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;font-weight:600;">Kendaraan</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;">${escHtml(k.type)}</td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;font-weight:600;">Asal</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;">${asalLabel}</td></tr>
${dueDateRow}
${kmRow}
</table></div>
<p style="margin:18px 0;font-size:14px;text-align:justify;">Mohon segera proses ${t.action} agar tidak terkena denda atau kendala operasional.</p>
<div style="margin-top:32px;font-size:14px;"><div>Demikian, terima kasih.</div><div style="margin-top:16px;color:#6b7280;">Hormat kami,</div><div style="font-weight:700;color:#1E3A8A;margin-top:2px;">Tim SIMOPAS Kanwil Ditjenim Kalteng</div></div></div>
<div style="background:#f9fafb;padding:18px 24px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;">Email otomatis dari <strong style="color:#1E3A8A;">SIMOPAS</strong></div>
</div></body></html>`;
}

async function sendTelegram(chatId, text) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const data = await res.json();
    return { success: data.ok, error: data.description };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendEmail(to, subject, html) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to, subject, html,
    });
    return { success: true };
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { kendaraan_id, tipe, channel = 'telegram' } = req.body;

  if (!kendaraan_id || !tipe) return res.status(400).json({ error: 'kendaraan_id dan tipe wajib diisi' });
  if (!['pajak', 'stnk', 'service'].includes(tipe)) return res.status(400).json({ error: 'tipe harus pajak, stnk, atau service' });
  if (!['telegram', 'email'].includes(channel)) return res.status(400).json({ error: 'channel harus telegram atau email' });

  try {
    const { data: k, error: errK } = await supabase
      .from('kendaraan').select('*').eq('id', kendaraan_id).single();
    if (errK || !k) return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });

    const tipeInfo = getTipeInfo(tipe);
    const hariSisa = daysUntil(k[tipeInfo.dateKey]);

    let result;
    let pesanLog;

    if (channel === 'telegram') {
      if (!k.telegram_chat_id) {
        return res.status(400).json({ error: 'PJ belum punya Telegram Chat ID. Minta PJ chat bot dulu.' });
      }
      const pesan = buildPesanTelegram(k, tipe);
      if (!pesan) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi` });
      result = await sendTelegram(k.telegram_chat_id, pesan);
      pesanLog = pesan;
    } else {
      // EMAIL
      if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        return res.status(500).json({ error: 'Email belum dikonfigurasi. Set GMAIL_USER dan GMAIL_APP_PASSWORD di Vercel.' });
      }
      if (!k.email) {
        return res.status(400).json({ error: 'Kendaraan ini belum punya Email PJ. Edit kendaraan dan isi email dulu.' });
      }
      const html = buildEmailHtml(k, tipe);
      if (!html) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi` });
      const urgencyLabel = tipe === 'service' ? getKmInfo(k).urgency : getUrgency(hariSisa);
      const subject = `Pengingat ${tipeInfo.label}: ${k.plate} (${urgencyLabel})`;
      result = await sendEmail(k.email, subject, html);
      pesanLog = subject;
    }

    await supabase.from('notifikasi_log').insert({
      kendaraan_id: k.id,
      tipe,
      hari_ke: hariSisa,
      channel,
      status: result.success ? 'sent' : 'failed',
      pesan: pesanLog,
      error_msg: result.error,
    });

    if (result.success) {
      await supabase.from('kendaraan')
        .update({ last_sent: new Date().toISOString().split('T')[0] })
        .eq('id', k.id);

      // === CC KE SEMUA ADMIN AKTIF ===
      const { data: admins } = await supabase
        .from('admin_chats')
        .select('*')
        .eq('aktif', true);

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          // CC via Telegram ke admin
          if (admin.telegram_chat_id) {
            const tgId = String(admin.telegram_chat_id).replace(/^ID:\s*/i, '').trim();
            if (tgId) {
              const pesanAdmin = buildPesanTelegram(k, tipe);
              if (pesanAdmin) await sendTelegram(tgId, pesanAdmin);
              await new Promise(r => setTimeout(r, 100));
            }
          }
          // CC via Email ke admin
          if (admin.email && GMAIL_USER && GMAIL_APP_PASSWORD) {
            const htmlAdmin = buildEmailHtml(k, tipe);
            if (htmlAdmin) {
              const subjAdmin = `${tipeInfo.icon} [CC Admin] Pengingat ${tipeInfo.label}: ${k.plate} → ${k.pj}`;
              await sendEmail(admin.email, subjAdmin, htmlAdmin);
              await new Promise(r => setTimeout(r, 300));
            }
          }
        }
      }

      return res.status(200).json({ success: true, message: `Pengingat ${tipe} terkirim via ${channel} ke ${k.pj}` });
    } else {
      return res.status(500).json({ success: false, error: result.error || `Gagal kirim ${channel}` });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
