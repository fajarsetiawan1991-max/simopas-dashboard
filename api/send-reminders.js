// API: Kirim Pengingat Harian (Telegram + Email via Gmail SMTP)
// Dijalankan otomatis oleh Vercel Cron tiap hari jam 08:00 WIB
// Template email FORMAL resmi pemerintah

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM_NAME = process.env.FROM_NAME || 'SIMOPAS Kanim';

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const ORIGIN_LABELS = {
  ditjenim: 'Ditjenim', kanim_sampit: 'Kanim Sampit', kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar', kanwil: 'Kanwil Kemenkum'
};

function formatDate(d) { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); }

function getUrgency(h) {
  if (h < 0) return { emoji: '🚨', label: `JATUH TEMPO LEWAT ${Math.abs(h)} HARI`, sentence: `telah jatuh tempo ${Math.abs(h)} hari yang lalu`, color: '#DC2626' };
  if (h === 0) return { emoji: '🚨', label: 'JATUH TEMPO HARI INI', sentence: 'jatuh tempo pada hari ini', color: '#DC2626' };
  if (h === 1) return { emoji: '⚠️', label: 'JATUH TEMPO BESOK', sentence: 'akan jatuh tempo besok', color: '#DC2626' };
  if (h === 7) return { emoji: '⏰', label: 'JATUH TEMPO 1 MINGGU LAGI', sentence: 'akan jatuh tempo dalam 1 minggu', color: '#F59E0B' };
  if (h === 14) return { emoji: '📌', label: 'JATUH TEMPO 2 MINGGU LAGI', sentence: 'akan jatuh tempo dalam 2 minggu', color: '#F59E0B' };
  if (h === 30) return { emoji: '📋', label: 'JATUH TEMPO 1 BULAN LAGI', sentence: 'akan jatuh tempo dalam 1 bulan', color: '#0284C7' };
  return { emoji: '📅', label: `JATUH TEMPO ${h} HARI LAGI`, sentence: `akan jatuh tempo dalam ${h} hari`, color: '#0284C7' };
}

function getTipeInfo(tipe) {
  return {
    pajak: { label: 'Pajak Tahunan', labelUp: 'PAJAK TAHUNAN', icon: '💰', action: 'perpanjangan pajak', subject: 'Pajak Tahunan Kendaraan' },
    stnk: { label: 'STNK (5 Tahun)', labelUp: 'STNK (5 TAHUN)', icon: '📄', action: 'perpanjangan STNK', subject: 'Perpanjangan STNK Kendaraan' },
    service: { label: 'Service Berkala', labelUp: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan', subject: 'Service Berkala Kendaraan' },
  }[tipe] || { label: tipe, labelUp: tipe.toUpperCase(), icon: '📌', action: tipe, subject: tipe };
}

// Salam sesuai jam (Asia/Jakarta = UTC+7)
function getGreeting() {
  const now = new Date();
  const jakartaHour = (now.getUTCHours() + 7) % 24;
  if (jakartaHour < 11) return 'Selamat pagi';
  if (jakartaHour < 15) return 'Selamat siang';
  if (jakartaHour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function buildPesanTelegram(k, tipe, h) {
  const u = getUrgency(h); const t = getTipeInfo(tipe);
  let p = `${u.emoji} *PENGINGAT ${t.labelUp}*\n\n`;
  p += `Kepada Yth.\n*Bapak/Ibu ${k.pj}*\n\n`;
  p += `Dengan hormat,\n\n`;
  p += `Bersama pesan ini, kami sampaikan pengingat bahwa ${t.label} kendaraan dinas yang Bapak/Ibu pegang ${u.sentence}.\n\n`;
  p += `📋 *Detail Kendaraan:*\n`;
  p += `• No. Polisi: \`${k.plate}\`\n`;
  p += `• Kendaraan: ${k.type}\n`;
  p += `• Jenis: ${k.jenis}\n`;
  p += `• Asal: ${ORIGIN_LABELS[k.asal] || k.asal}\n`;
  p += `• Jatuh Tempo: ${formatDate(k.due_date)}\n`;
  if (tipe === 'service' && k.km) p += `• Kilometer: ${k.km.toLocaleString('id-ID')} km\n`;
  p += `\nMohon dapat segera diproses ${t.action} untuk menghindari denda dan menjaga kelancaran operasional.\n\n`;
  p += `Apabila ${t.action} telah dilakukan, mohon konfirmasi kepada admin SIMOPAS agar status pada sistem dapat diperbarui.\n\n`;
  p += `Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.\n\n`;
  p += `_Hormat kami,_\n_Tim SIMOPAS Kanim_`;
  return p;
}

function buildEmailHTML(k, tipe, h, dueDate) {
  const t = getTipeInfo(tipe); const u = getUrgency(h);
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
Email ini dikirim otomatis oleh sistem SIMOPAS.<br>
Apabila ada pertanyaan, silakan hubungi admin SIMOPAS Kanim.
</div>

</div></body></html>`;
}

function buildAdminEmailHTML(items) {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const greeting = getGreeting();
  let rows = '';
  if (items.length === 0) {
    rows = '<tr><td colspan="4" style="padding:24px;text-align:center;color:#6b7280;font-size:14px;">Tidak ada kendaraan yang perlu diingatkan hari ini.</td></tr>';
  } else {
    items.forEach(i => {
      const tc = { pajak: '#F59E0B', stnk: '#0284C7', service: '#059669' }[i.tipe_due] || '#6b7280';
      const tlabel = { pajak: 'Pajak', stnk: 'STNK', service: 'Service' }[i.tipe_due] || i.tipe_due;
      const u = i.hari_sisa < 0 ? `Lewat ${Math.abs(i.hari_sisa)} hari` : i.hari_sisa === 0 ? 'Hari ini' : i.hari_sisa === 1 ? 'Besok' : `H-${i.hari_sisa}`;
      rows += `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:12px 10px;"><span style="background:white;border:1px solid #000;padding:3px 8px;font-family:monospace;font-weight:700;font-size:11px;">${i.plate}</span></td><td style="padding:12px 10px;font-size:13px;">${i.type}<br><span style="color:#6b7280;font-size:11px;">${i.pj}</span></td><td style="padding:12px 10px;"><span style="background:${tc}20;color:${tc};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;">${tlabel}</span></td><td style="padding:12px 10px;font-size:12px;font-weight:600;">${u}</td></tr>`;
    });
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#f4f4f5;line-height:1.6;">
<div style="max-width:680px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
<div style="background:linear-gradient(135deg,#1E3A8A,#4338ca);padding:28px 24px;color:white;">
<h1 style="margin:0;font-size:22px;">📊 Ringkasan Harian SIMOPAS</h1>
<div style="margin-top:6px;font-size:13px;opacity:0.9;">${today}</div>
</div>
<div style="padding:28px 28px;color:#1f2937;">

<p style="margin:0 0 14px;font-size:14px;">${greeting}, Bapak/Ibu Admin,</p>

<p style="margin:0 0 14px;font-size:14px;text-align:justify;">Dengan hormat, berikut kami sampaikan ringkasan harian pengingat kendaraan dinas yang telah diproses oleh sistem SIMOPAS pada hari ini.</p>

<p style="margin:0 0 18px;font-size:14px;">Total <strong style="color:#1E3A8A;">${items.length} kendaraan</strong> mendapat pengingat hari ini:</p>

<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
<thead><tr style="background:#1E3A8A;color:white;">
<th style="padding:12px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">No. Polisi</th>
<th style="padding:12px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Kendaraan</th>
<th style="padding:12px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Tipe</th>
<th style="padding:12px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

<p style="margin:24px 0 14px;font-size:14px;text-align:justify;">Demikian ringkasan ini kami sampaikan. Atas perhatian Bapak/Ibu, kami ucapkan terima kasih.</p>

<div style="margin-top:24px;font-size:14px;">
<div>Demikian, terima kasih.</div>
<div style="margin-top:16px;color:#6b7280;">Hormat kami,</div>
<div style="font-weight:700;color:#1E3A8A;margin-top:2px;">Tim SIMOPAS</div>
</div>
</div>
<div style="background:#f9fafb;padding:18px 24px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;">
Email ringkasan otomatis dari sistem SIMOPAS.
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

let mailTransporter = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return mailTransporter;
}

async function sendEmail(to, subject, html) {
  const t = getMailTransporter();
  if (!t) return { success: false, error: 'GMAIL_USER atau GMAIL_APP_PASSWORD belum di-set' };
  if (!to || !to.includes('@')) return { success: false, error: 'Email tidak valid' };
  try {
    await t.sendMail({
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
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${CRON_SECRET}` && req.query.secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Missing env vars' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data: dueList, error: errDue } = await supabase.from('v_kendaraan_due_today').select('*');
    if (errDue) throw errDue;

    const results = { total_due: dueList.length, sent_telegram: 0, sent_email: 0, sent_admin_telegram: 0, sent_admin_email: 0, errors: [] };

    for (const item of dueList) {
      const tipeInfo = getTipeInfo(item.tipe_due);

      if (item.notif_tg && item.telegram_chat_id) {
        const { data: ex } = await supabase.from('notifikasi_log').select('id')
          .eq('kendaraan_id', item.id).eq('tipe', item.tipe_due).eq('channel', 'telegram')
          .eq('status', 'sent').gte('created_at', today + 'T00:00:00').limit(1);
        if (!ex || ex.length === 0) {
          const pesan = buildPesanTelegram(item, item.tipe_due, item.hari_sisa);
          const r = await sendTelegram(item.telegram_chat_id, pesan);
          await supabase.from('notifikasi_log').insert({
            kendaraan_id: item.id, tipe: item.tipe_due, hari_ke: item.hari_sisa,
            channel: 'telegram', status: r.success ? 'sent' : 'failed', pesan, error_msg: r.error,
          });
          if (r.success) results.sent_telegram++;
          else results.errors.push(`TG ${item.plate}: ${r.error}`);
          await new Promise(r => setTimeout(r, 100));
        }
      }

      if (item.notif_email && item.email) {
        const { data: ex } = await supabase.from('notifikasi_log').select('id')
          .eq('kendaraan_id', item.id).eq('tipe', item.tipe_due).eq('channel', 'email')
          .eq('status', 'sent').gte('created_at', today + 'T00:00:00').limit(1);
        if (!ex || ex.length === 0) {
          const subject = `Pengingat ${tipeInfo.subject} ${item.plate}`;
          const html = buildEmailHTML(item, item.tipe_due, item.hari_sisa, item.due_date);
          const r = await sendEmail(item.email, subject, html);
          await supabase.from('notifikasi_log').insert({
            kendaraan_id: item.id, tipe: item.tipe_due, hari_ke: item.hari_sisa,
            channel: 'email', status: r.success ? 'sent' : 'failed', pesan: subject, error_msg: r.error,
          });
          if (r.success) results.sent_email++;
          else results.errors.push(`Email ${item.plate}: ${r.error}`);
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (item.last_sent !== today) {
        await supabase.from('kendaraan').update({ last_sent: today }).eq('id', item.id);
      }
    }

    const { data: admins } = await supabase.from('admin_chats').select('*').eq('aktif', true);
    if (admins && admins.length > 0) {
      const pesanAdminTg = (() => {
        if (dueList.length === 0) return `📊 *RINGKASAN HARIAN SIMOPAS*\n\nSelamat pagi, Bapak/Ibu Admin.\n\nTidak ada kendaraan yang perlu diingatkan hari ini.\n\n_Hormat kami,_\n_Tim SIMOPAS_`;
        let p = `📊 *RINGKASAN HARIAN SIMOPAS*\n\nSelamat pagi, Bapak/Ibu Admin.\n\nBerikut ringkasan pengingat yang telah dikirim hari ini (total *${dueList.length}* kendaraan):\n\n`;
        const g = {};
        dueList.forEach(i => { g[i.tipe_due] = g[i.tipe_due] || []; g[i.tipe_due].push(i); });
        Object.keys(g).forEach(t => {
          const ti = getTipeInfo(t);
          p += `${ti.icon} *${ti.labelUp}*\n`;
          g[t].forEach(i => {
            const u = i.hari_sisa < 0 ? `Lewat ${Math.abs(i.hari_sisa)} hari` : i.hari_sisa === 0 ? 'Hari ini' : i.hari_sisa === 1 ? 'Besok' : `H-${i.hari_sisa}`;
            p += `• \`${i.plate}\` - ${i.pj} (${u})\n`;
          });
          p += `\n`;
        });
        return p + `_Demikian, terima kasih._\n\n_Hormat kami,_\n_Tim SIMOPAS_`;
      })();

      const adminSubject = `Ringkasan Harian SIMOPAS - ${dueList.length} Pengingat Terkirim`;
      const adminHTML = buildAdminEmailHTML(dueList);

      for (const admin of admins) {
        if (admin.telegram_chat_id) {
          const r = await sendTelegram(admin.telegram_chat_id, pesanAdminTg);
          if (r.success) results.sent_admin_telegram++;
          await new Promise(r => setTimeout(r, 100));
        }
        if (admin.notif_email !== false && admin.email) {
          const r = await sendEmail(admin.email, adminSubject, adminHTML);
          if (r.success) results.sent_admin_email++;
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    return res.status(200).json({ success: true, timestamp: new Date().toISOString(), ...results });
  } catch (err) {
    console.error('Reminder error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
