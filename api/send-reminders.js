// API: Kirim Pengingat Harian (Telegram + Email via Gmail SMTP)
// Dijalankan otomatis oleh Vercel Cron tiap hari jam 08:00 WIB

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

// Setup Gmail SMTP transporter (lazy init - cuma di-create kalau perlu)
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

function formatDate(d) { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); }

function getUrgency(h) {
  if (h === 0) return { emoji: '🚨', label: 'HARI INI' };
  if (h === 1) return { emoji: '⚠️', label: 'BESOK' };
  if (h === 7) return { emoji: '⏰', label: '1 MINGGU LAGI' };
  if (h === 14) return { emoji: '📌', label: '2 MINGGU LAGI' };
  if (h === 30) return { emoji: '📋', label: '1 BULAN LAGI' };
  return { emoji: '📅', label: `${h} HARI LAGI` };
}

function getTipeInfo(tipe) {
  return {
    pajak: { label: 'PAJAK TAHUNAN', icon: '💰', action: 'perpanjangan pajak', color: '#F59E0B' },
    stnk: { label: 'STNK (5 TAHUNAN)', icon: '📄', action: 'perpanjangan STNK', color: '#0284C7' },
    service: { label: 'SERVICE BERKALA', icon: '🔧', action: 'service kendaraan', color: '#059669' },
  }[tipe] || { label: tipe.toUpperCase(), icon: '📌', action: tipe, color: '#6b7280' };
}

function buildPesanTelegram(k, tipe, h) {
  const u = getUrgency(h); const t = getTipeInfo(tipe);
  let p = `${u.emoji} *PENGINGAT ${t.label}*\n\nHalo, *${k.pj}* 👋\n\n`;
  p += h === 0 ? `${t.icon} ${t.label} kendaraan dinas Anda *jatuh tempo HARI INI*:\n\n` : `${t.icon} ${t.label} kendaraan dinas Anda akan jatuh tempo:\n\n`;
  p += `📋 *Detail Kendaraan:*\n• No. Polisi: \`${k.plate}\`\n• Type: ${k.type}\n• Jenis: ${k.jenis}\n• Asal: ${ORIGIN_LABELS[k.asal] || k.asal}\n\n`;
  p += `📅 *Jatuh Tempo:*\n${formatDate(k.due_date)} *(${u.label})*\n\n`;
  if (tipe === 'service' && k.km) p += `🛣 *Kilometer:* ${k.km.toLocaleString('id-ID')} km\n\n`;
  p += `⚠️ Mohon segera proses ${t.action}.\n\n_— SIMOPAS Kanim_`;
  return p;
}

function buildEmailHTML(k, tipe, h, dueDate) {
  const t = getTipeInfo(tipe); const u = getUrgency(h);
  let uc = '#0284C7';
  if (h <= 1) uc = '#DC2626'; else if (h <= 7) uc = '#F59E0B';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#f4f4f5;">
<div style="max-width:600px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
<div style="background:linear-gradient(135deg,#1E3A8A,#4338ca);padding:32px 24px;color:white;text-align:center;">
<h1 style="margin:0;font-size:26px;">${t.icon} Pengingat ${t.label}</h1>
<div style="margin-top:6px;font-size:13px;opacity:0.9;">SIMOPAS - Sistem Monitoring Kendaraan Dinas</div></div>
<div style="background:${uc};color:white;text-align:center;padding:12px;font-weight:700;font-size:15px;letter-spacing:1px;">⚠️ JATUH TEMPO ${u.label}</div>
<div style="padding:32px 24px;color:#333;line-height:1.6;">
<h2 style="margin:0 0 12px;font-size:18px;">Halo, ${k.pj}</h2>
<p>${t.label} kendaraan dinas yang Anda pegang akan jatuh tempo. Mohon segera proses ${t.action}.</p>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0;">
<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">No. Polisi</div><div style="margin-top:4px;"><span style="background:white;border:2px solid #000;padding:6px 12px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:2px;border-radius:4px;font-size:16px;color:#000;">${k.plate}</span></div></div>
<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Kendaraan</div><div style="font-size:15px;font-weight:600;margin-top:4px;">${k.type}</div></div>
<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Jenis / Asal</div><div style="font-size:14px;margin-top:4px;">${k.jenis} • ${ORIGIN_LABELS[k.asal] || k.asal}</div></div>
<div style="padding:8px 0;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Tanggal Jatuh Tempo</div><div style="font-size:15px;font-weight:600;color:${uc};margin-top:4px;">${formatDate(dueDate)} (${u.label})</div></div>
${tipe === 'service' && k.km ? `<div style="padding:8px 0;border-top:1px solid #f3f4f6;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Kilometer</div><div style="font-size:14px;margin-top:4px;">${k.km.toLocaleString('id-ID')} km</div></div>` : ''}
</div>
<div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:14px 18px;margin:20px 0;border-radius:4px;font-size:14px;color:#92400e;"><strong>Tindakan yang Diperlukan:</strong><br>Mohon segera proses ${t.action}.</div>
</div>
<div style="background:#f9fafb;padding:20px 24px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">Email otomatis dari <strong style="color:#1E3A8A;">SIMOPAS Kanim</strong></div>
</div></body></html>`;
}

function buildAdminEmailHTML(items) {
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  let rows = '';
  if (items.length === 0) {
    rows = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#6b7280;">✓ Tidak ada kendaraan yang perlu diingatkan hari ini</td></tr>';
  } else {
    items.forEach(i => {
      const tc = { pajak: '#F59E0B', stnk: '#0284C7', service: '#059669' }[i.tipe_due] || '#6b7280';
      const u = i.hari_sisa === 0 ? 'HARI INI' : i.hari_sisa === 1 ? 'BESOK' : `H-${i.hari_sisa}`;
      rows += `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:10px;"><span style="background:white;border:1px solid #000;padding:3px 8px;font-family:monospace;font-weight:700;font-size:11px;">${i.plate}</span></td><td style="padding:10px;font-size:13px;">${i.type}<br><span style="color:#6b7280;font-size:11px;">${i.pj}</span></td><td style="padding:10px;"><span style="background:${tc}20;color:${tc};padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase;">${i.tipe_due}</span></td><td style="padding:10px;font-size:12px;font-weight:600;">${u}</td></tr>`;
    });
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#f4f4f5;">
<div style="max-width:680px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
<div style="background:linear-gradient(135deg,#1E3A8A,#4338ca);padding:28px 24px;color:white;"><h1 style="margin:0;font-size:22px;">📊 Ringkasan Harian SIMOPAS</h1><div style="margin-top:6px;font-size:13px;opacity:0.9;">${today}</div></div>
<div style="padding:24px;"><h2 style="margin:0 0 8px;font-size:16px;">Total ${items.length} kendaraan perlu pengingat hari ini</h2><p style="color:#6b7280;font-size:13px;margin-bottom:20px;">Daftar kendaraan yang sudah dikirim notifikasi otomatis.</p>
<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;"><thead><tr style="background:#1E3A8A;color:white;"><th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;">Plat</th><th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;">Kendaraan</th><th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;">Tipe</th><th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;">Status</th></tr></thead><tbody>${rows}</tbody></table>
</div><div style="background:#f9fafb;padding:18px 24px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;"><strong style="color:#1E3A8A;">SIMOPAS Kanim</strong></div></div></body></html>`;
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
      to: to,
      subject: subject,
      html: html,
    });
    return { success: true, id: info.messageId };
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
      const urgency = getUrgency(item.hari_sisa);

      // === TELEGRAM ===
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

      // === EMAIL ===
      if (item.notif_email && item.email) {
        const { data: ex } = await supabase.from('notifikasi_log').select('id')
          .eq('kendaraan_id', item.id).eq('tipe', item.tipe_due).eq('channel', 'email')
          .eq('status', 'sent').gte('created_at', today + 'T00:00:00').limit(1);
        if (!ex || ex.length === 0) {
          const subject = `${urgency.emoji} Pengingat ${tipeInfo.label}: ${item.plate} (${urgency.label})`;
          const html = buildEmailHTML(item, item.tipe_due, item.hari_sisa, item.due_date);
          const r = await sendEmail(item.email, subject, html);
          await supabase.from('notifikasi_log').insert({
            kendaraan_id: item.id, tipe: item.tipe_due, hari_ke: item.hari_sisa,
            channel: 'email', status: r.success ? 'sent' : 'failed', pesan: subject, error_msg: r.error,
          });
          if (r.success) results.sent_email++;
          else results.errors.push(`Email ${item.plate}: ${r.error}`);
          await new Promise(r => setTimeout(r, 200)); // Gmail rate limit lebih ketat
        }
      }

      if (item.last_sent !== today) {
        await supabase.from('kendaraan').update({ last_sent: today }).eq('id', item.id);
      }
    }

    // === ADMIN ===
    const { data: admins } = await supabase.from('admin_chats').select('*').eq('aktif', true);
    if (admins && admins.length > 0) {
      const pesanAdminTg = (() => {
        if (dueList.length === 0) return `📊 *RINGKASAN HARIAN SIMOPAS*\n\n✅ Tidak ada kendaraan yang perlu diingatkan hari ini.\n\n_— SIMOPAS Kanim_`;
        let p = `📊 *RINGKASAN HARIAN SIMOPAS*\n\nTotal ${dueList.length} pengingat dikirim hari ini:\n\n`;
        const g = {};
        dueList.forEach(i => { g[i.tipe_due] = g[i.tipe_due] || []; g[i.tipe_due].push(i); });
        Object.keys(g).forEach(t => {
          const ti = getTipeInfo(t);
          p += `${ti.icon} *${ti.label}*\n`;
          g[t].forEach(i => { p += `• \`${i.plate}\` - ${i.pj} (${getUrgency(i.hari_sisa).label})\n`; });
          p += `\n`;
        });
        return p + `_— SIMOPAS Kanim_`;
      })();

      const adminSubject = `📊 Ringkasan Harian SIMOPAS - ${dueList.length} pengingat`;
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
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    return res.status(200).json({ success: true, timestamp: new Date().toISOString(), ...results });
  } catch (err) {
    console.error('Reminder error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
