// API: Test Kirim Notifikasi Manual (Telegram atau Email via Gmail SMTP)

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM_NAME = process.env.FROM_NAME || 'SIMOPAS Kanim';

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const ORIGIN_LABELS = {
  ditjenim: 'Ditjenim', kanim_sampit: 'Kanim Sampit', kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar', kanwil: 'Kanwil Kemenkum'
};

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
  });
  return mailer;
}

function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'; }

function daysUntil(d) {
  if (!d) return null;
  const due = new Date(d), today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((due - today) / 86400000);
}

function getTipeInfo(tipe) {
  return {
    pajak: { label: 'PAJAK TAHUNAN', icon: '💰', action: 'perpanjangan pajak', dateKey: 'pajak_date' },
    stnk: { label: 'STNK (5 TAHUNAN)', icon: '📄', action: 'perpanjangan STNK', dateKey: 'stnk_date' },
    service: { label: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan', dateKey: 'service_date' },
  }[tipe];
}

function buildPesanTelegram(k, tipe) {
  const t = getTipeInfo(tipe);
  if (!t) return null;
  const dueDate = k[t.dateKey];
  const h = daysUntil(dueDate);
  let u = '-';
  if (h === null) return null;
  if (h < 0) u = `SUDAH LEWAT ${Math.abs(h)} HARI`;
  else if (h === 0) u = 'HARI INI';
  else if (h === 1) u = 'BESOK';
  else u = `${h} HARI LAGI`;

  let p = `🔔 *PENGINGAT ${t.label}*\n\nHalo, *${k.pj}* 👋\n\n${t.icon} ${t.label} kendaraan dinas Anda:\n\n`;
  p += `📋 *Detail Kendaraan:*\n• No. Polisi: \`${k.plate}\`\n• Type: ${k.type}\n• Jenis: ${k.jenis}\n• Asal: ${ORIGIN_LABELS[k.asal] || k.asal}\n\n`;
  p += `📅 *Jatuh Tempo:*\n${formatDate(dueDate)} *(${u})*\n\n`;
  if (tipe === 'service' && k.km) p += `🛣 *Kilometer:* ${k.km.toLocaleString('id-ID')} km\n\n`;
  p += `⚠️ Mohon segera proses ${t.action}.\n\n_— SIMOPAS Kanim (Test)_`;
  return p;
}

function buildEmailHTML(k, tipe) {
  const t = getTipeInfo(tipe);
  if (!t) return null;
  const dueDate = k[t.dateKey];
  const h = daysUntil(dueDate);
  let u = '-', uc = '#0284C7';
  if (h === null) return null;
  if (h < 0) { u = `LEWAT ${Math.abs(h)} HARI`; uc = '#DC2626'; }
  else if (h <= 1) { u = h === 0 ? 'HARI INI' : 'BESOK'; uc = '#DC2626'; }
  else if (h <= 7) { u = `${h} HARI LAGI`; uc = '#F59E0B'; }
  else u = `${h} HARI LAGI`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#f4f4f5;">
<div style="max-width:600px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
<div style="background:linear-gradient(135deg,#1E3A8A,#4338ca);padding:32px 24px;color:white;text-align:center;">
<h1 style="margin:0;font-size:26px;">${t.icon} Pengingat ${t.label}</h1>
<div style="margin-top:6px;font-size:13px;opacity:0.9;">SIMOPAS - Sistem Monitoring Kendaraan Dinas</div></div>
<div style="background:${uc};color:white;text-align:center;padding:12px;font-weight:700;font-size:15px;letter-spacing:1px;">⚠️ JATUH TEMPO ${u}</div>
<div style="padding:32px 24px;color:#333;line-height:1.6;">
<h2 style="margin:0 0 12px;font-size:18px;">Halo, ${k.pj}</h2>
<p>${t.label} kendaraan dinas Anda. Mohon segera proses ${t.action}.</p>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0;">
<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">No. Polisi</div><div style="margin-top:4px;"><span style="background:white;border:2px solid #000;padding:6px 12px;font-family:monospace;font-weight:700;letter-spacing:2px;border-radius:4px;font-size:16px;color:#000;">${k.plate}</span></div></div>
<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Kendaraan</div><div style="font-size:15px;font-weight:600;margin-top:4px;">${k.type}</div></div>
<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Jenis / Asal</div><div style="font-size:14px;margin-top:4px;">${k.jenis} • ${ORIGIN_LABELS[k.asal] || k.asal}</div></div>
<div style="padding:8px 0;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Jatuh Tempo</div><div style="font-size:15px;font-weight:600;color:${uc};margin-top:4px;">${formatDate(dueDate)} (${u})</div></div>
${tipe === 'service' && k.km ? `<div style="padding:8px 0;border-top:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Kilometer</div><div style="font-size:14px;margin-top:4px;">${k.km.toLocaleString('id-ID')} km</div></div>` : ''}
</div></div>
<div style="background:#f9fafb;padding:20px 24px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;"><strong style="color:#1E3A8A;">SIMOPAS Kanim</strong> (Test Pengingat)</div>
</div></body></html>`;
}

async function sendTelegram(chatId, text) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const data = await res.json();
    return { success: data.ok, error: data.description };
  } catch (err) { return { success: false, error: err.message }; }
}

async function sendEmail(to, subject, html) {
  const m = getMailer();
  if (!m) return { success: false, error: 'GMAIL_USER atau GMAIL_APP_PASSWORD belum di-set di Vercel' };
  if (!to || !to.includes('@')) return { success: false, error: 'Email tidak valid' };
  try {
    const info = await m.sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to: to, subject: subject, html: html,
    });
    return { success: true, id: info.messageId };
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
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { kendaraan_id, tipe, channel = 'telegram' } = req.body;

  if (!kendaraan_id || !tipe) return res.status(400).json({ error: 'kendaraan_id dan tipe wajib' });
  if (!['pajak','stnk','service'].includes(tipe)) return res.status(400).json({ error: 'tipe harus pajak/stnk/service' });
  if (!['telegram','email'].includes(channel)) return res.status(400).json({ error: 'channel harus telegram/email' });

  try {
    const { data: k, error: errK } = await supabase.from('kendaraan').select('*').eq('id', kendaraan_id).single();
    if (errK || !k) return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });

    let result;
    let pesan;

    if (channel === 'telegram') {
      if (!k.telegram_chat_id) return res.status(400).json({ error: 'PJ belum mendaftar di bot Telegram.' });
      pesan = buildPesanTelegram(k, tipe);
      if (!pesan) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi` });
      result = await sendTelegram(k.telegram_chat_id, pesan);
    } else {
      if (!k.email) return res.status(400).json({ error: 'Email PJ belum diisi' });
      const t = getTipeInfo(tipe);
      const h = daysUntil(k[t.dateKey]);
      if (h === null) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi` });
      let u = h === 0 ? 'HARI INI' : h === 1 ? 'BESOK' : h < 0 ? `LEWAT ${Math.abs(h)} HARI` : `${h} HARI LAGI`;
      const subject = `🔔 Pengingat ${t.label}: ${k.plate} (${u})`;
      const html = buildEmailHTML(k, tipe);
      if (!html) return res.status(400).json({ error: 'Gagal generate email' });
      result = await sendEmail(k.email, subject, html);
      pesan = subject;
    }

    await supabase.from('notifikasi_log').insert({
      kendaraan_id: k.id, tipe, hari_ke: daysUntil(k[getTipeInfo(tipe).dateKey]),
      channel, status: result.success ? 'sent' : 'failed', pesan, error_msg: result.error,
    });

    if (result.success) {
      await supabase.from('kendaraan').update({ last_sent: new Date().toISOString().split('T')[0] }).eq('id', k.id);
      return res.status(200).json({ success: true, message: `Pengingat ${tipe} terkirim via ${channel} ke ${k.pj}` });
    }
    return res.status(500).json({ success: false, error: result.error || 'Gagal kirim' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
