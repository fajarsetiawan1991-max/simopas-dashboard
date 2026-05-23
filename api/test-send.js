// API: Test Kirim Notifikasi Manual (Telegram atau Email via Gmail SMTP)
// Template email FORMAL resmi pemerintah

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

function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'; }

function daysUntil(d) {
  if (!d) return null;
  const due = new Date(d), today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((due - today) / 86400000);
}

function getTipeInfo(tipe) {
  return {
    pajak: { label: 'Pajak Tahunan', labelUp: 'PAJAK TAHUNAN', icon: '💰', action: 'perpanjangan pajak', dateKey: 'pajak_date', subject: 'Pajak Tahunan Kendaraan' },
    stnk: { label: 'STNK (5 Tahun)', labelUp: 'STNK (5 TAHUN)', icon: '📄', action: 'perpanjangan STNK', dateKey: 'stnk_date', subject: 'Perpanjangan STNK Kendaraan' },
    service: { label: 'Service Berkala', labelUp: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan', dateKey: 'service_date', subject: 'Service Berkala Kendaraan' },
  }[tipe];
}

function getUrgency(h) {
  if (h < 0) return { label: `JATUH TEMPO LEWAT ${Math.abs(h)} HARI`, sentence: `telah jatuh tempo ${Math.abs(h)} hari yang lalu`, color: '#DC2626' };
  if (h === 0) return { label: 'JATUH TEMPO HARI INI', sentence: 'jatuh tempo pada hari ini', color: '#DC2626' };
  if (h === 1) return { label: 'JATUH TEMPO BESOK', sentence: 'akan jatuh tempo besok', color: '#DC2626' };
  if (h <= 7) return { label: `JATUH TEMPO ${h} HARI LAGI`, sentence: `akan jatuh tempo dalam ${h} hari`, color: '#F59E0B' };
  return { label: `JATUH TEMPO ${h} HARI LAGI`, sentence: `akan jatuh tempo dalam ${h} hari`, color: '#0284C7' };
}

function getGreeting() {
  const now = new Date();
  const jakartaHour = (now.getUTCHours() + 7) % 24;
  if (jakartaHour < 11) return 'Selamat pagi';
  if (jakartaHour < 15) return 'Selamat siang';
  if (jakartaHour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function buildPesanTelegram(k, tipe) {
  const t = getTipeInfo(tipe);
  if (!t) return null;
  const dueDate = k[t.dateKey];
  const h = daysUntil(dueDate);
  if (h === null) return null;
  const u = getUrgency(h);

  let p = `🔔 *PENGINGAT ${t.labelUp}*\n\n`;
  p += `Kepada Yth.\n*Bapak/Ibu ${k.pj}*\n\n`;
  p += `Dengan hormat,\n\n`;
  p += `Bersama pesan ini, kami sampaikan pengingat bahwa ${t.label} kendaraan dinas yang Bapak/Ibu pegang ${u.sentence}.\n\n`;
  p += `📋 *Detail Kendaraan:*\n`;
  p += `• No. Polisi: \`${k.plate}\`\n`;
  p += `• Kendaraan: ${k.type}\n`;
  p += `• Jenis: ${k.jenis}\n`;
  p += `• Asal: ${ORIGIN_LABELS[k.asal] || k.asal}\n`;
  p += `• Jatuh Tempo: ${formatDate(dueDate)}\n`;
  if (tipe === 'service' && k.km) p += `• Kilometer: ${k.km.toLocaleString('id-ID')} km\n`;
  p += `\nMohon dapat segera diproses ${t.action} untuk menghindari denda dan menjaga kelancaran operasional.\n\n`;
  p += `Apabila ${t.action} telah dilakukan, mohon konfirmasi kepada admin SIMOPAS agar status pada sistem dapat diperbarui.\n\n`;
  p += `Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n\n`;
  p += `_Hormat kami,_\n_Tim SIMOPAS_\n\n`;
  p += `_(Pesan ini dikirim sebagai test dari admin SIMOPAS)_`;
  return p;
}

function buildEmailHTML(k, tipe) {
  const t = getTipeInfo(tipe);
  if (!t) return null;
  const dueDate = k[t.dateKey];
  const h = daysUntil(dueDate);
  if (h === null) return null;
  const u = getUrgency(h);
  const greeting = getGreeting();
  const kmRow = (tipe === 'service' && k.km)
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;width:140px;">Kilometer</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;">${k.km.toLocaleString('id-ID')} km</td></tr>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;line-height:1.6;">
<div style="max-width:620px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">

<div style="background:linear-gradient(135deg,#1E3A8A,#4338ca);padding:32px 24px;color:white;text-align:center;">
<div style="font-size:36px;margin-bottom:8px;">${t.icon}</div>
<h1 style="margin:0;font-size:24px;font-weight:700;">Pengingat ${t.label}</h1>
<div style="margin-top:8px;font-size:13px;opacity:0.9;">SIMOPAS - Sistem Monitoring Kendaraan Dinas</div>
</div>

<div style="background:${u.color};color:white;text-align:center;padding:14px;font-weight:700;font-size:14px;letter-spacing:1px;">
⚠️ ${u.label}
</div>

<div style="padding:32px 28px;color:#1f2937;">

<p style="margin:0 0 4px;font-size:14px;color:#6b7280;">${greeting},</p>
<p style="margin:0 0 4px;font-size:14px;font-weight:600;">Kepada Yth.</p>
<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1E3A8A;">Bapak/Ibu ${k.pj}</p>

<p style="margin:0 0 14px;font-size:14px;">Dengan hormat,</p>

<p style="margin:0 0 14px;font-size:14px;text-align:justify;">
Bersama email ini, kami sampaikan pengingat bahwa <strong>${t.label}</strong> kendaraan dinas yang Bapak/Ibu pegang ${u.sentence}, yaitu pada tanggal <strong style="color:${u.color};">${formatDate(dueDate)}</strong>.
</p>

<p style="margin:0 0 18px;font-size:14px;text-align:justify;">
Mohon dapat segera diproses <strong>${t.action}</strong> untuk menghindari denda dan menjaga kelancaran operasional kendaraan. Berikut detail kendaraan yang dimaksud:
</p>

<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin:20px 0;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;width:140px;vertical-align:middle;">No. Polisi</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;"><span style="background:white;border:2px solid #000;padding:6px 12px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:2px;border-radius:4px;font-size:16px;color:#000;">${k.plate}</span></td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Kendaraan</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;">${k.type}</td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Jenis / Asal</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;">${k.jenis} • ${ORIGIN_LABELS[k.asal] || k.asal}</td></tr>
<tr><td style="padding:10px 0;${kmRow ? 'border-bottom:1px solid #f3f4f6;' : ''}color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Jatuh Tempo</td><td style="padding:10px 0;${kmRow ? 'border-bottom:1px solid #f3f4f6;' : ''}font-size:14px;font-weight:700;color:${u.color};">${formatDate(dueDate)}</td></tr>
${kmRow}
</table>
</div>

<p style="margin:18px 0;font-size:14px;text-align:justify;">
Apabila ${t.action} telah dilakukan, mohon konfirmasi kepada admin SIMOPAS agar status pada sistem dapat diperbarui.
</p>

<p style="margin:0 0 24px;font-size:14px;text-align:justify;">
Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.
</p>

<div style="margin-top:32px;font-size:14px;">
<div>Demikian, terima kasih.</div>
<div style="margin-top:16px;color:#6b7280;">Hormat kami,</div>
<div style="font-weight:700;color:#1E3A8A;margin-top:2px;">Tim SIMOPAS</div>
</div>

</div>

<div style="background:#f9fafb;padding:18px 24px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;line-height:1.6;">
Email ini dikirim oleh sistem SIMOPAS (uji coba).<br>
Apabila ada pertanyaan, silakan hubungi admin SIMOPAS Kanim.
</div>

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
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return { success: false, error: 'GMAIL_USER atau GMAIL_APP_PASSWORD belum di-set di Vercel' };
  }
  if (!to || !to.includes('@')) return { success: false, error: 'Email tidak valid' };
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
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

    let result, pesan;
    const t = getTipeInfo(tipe);

    if (channel === 'telegram') {
      if (!k.telegram_chat_id) return res.status(400).json({ error: 'PJ belum mendaftar di bot Telegram.' });
      pesan = buildPesanTelegram(k, tipe);
      if (!pesan) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi` });
      result = await sendTelegram(k.telegram_chat_id, pesan);
    } else {
      if (!k.email) return res.status(400).json({ error: 'Email PJ belum diisi' });
      const h = daysUntil(k[t.dateKey]);
      if (h === null) return res.status(400).json({ error: `Tanggal ${tipe} belum diisi` });
      const subject = `Pengingat ${t.subject} ${k.plate}`;
      const html = buildEmailHTML(k, tipe);
      if (!html) return res.status(400).json({ error: 'Gagal generate email' });
      result = await sendEmail(k.email, subject, html);
      pesan = subject;
    }

    await supabase.from('notifikasi_log').insert({
      kendaraan_id: k.id, tipe, hari_ke: daysUntil(k[t.dateKey]),
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
