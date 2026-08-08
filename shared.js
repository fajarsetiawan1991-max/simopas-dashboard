// SIMOPAS Shared Helpers - v4

window.ORIGIN_LABELS = {
  ditjenim: 'Sewa Sekjen',
  sewa_kanwil_ditjenim: 'Sewa Kanwil Ditjenim Kalteng',
  kanwil_ditjenim: 'Kanwil Ditjenim Kalteng',
  kanim_sampit: 'Kanim Sampit',
  kanim_pky: 'Kanim Palangkaraya',
  kanim_kobar: 'Kanim Kobar',
  kanwil: 'Kanwil Kemenkum'
};

// ============= SUPABASE INIT =============
const cfg = window.SIMOPAS_CONFIG || {};
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL === 'GANTI_DENGAN_URL_SUPABASE_KAMU') {
  alert('Setup belum lengkap! Edit file config.js dengan kredensial Supabase.');
}
window.supabaseClient = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'simopas-session',
    storage: window.sessionStorage, // pakai sessionStorage, bukan localStorage
  }
});

// ============= DATE HELPERS =============
window.today = (function() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();

window.daysUntil = function(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  return Math.ceil((due - window.today) / (1000 * 60 * 60 * 24));
};

window.formatDate = function(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

window.formatDateLong = function(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};

window.formatDateTime = function(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

window.formatDays = function(days) {
  if (days === null) return '-';
  if (days < 0) return `${Math.abs(days)} hari lalu`;
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  return `${days} hari`;
};

window.formatNumber = function(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('id-ID');
};

window.getStatus = function(days) {
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'active';
};

// ============= DB <-> UI MAPPERS =============
window.dbToUi = function(row) {
  return {
    id: row.id,
    jenis: row.jenis,
    type: row.type,
    plate: row.plate,
    asal: row.asal,
    stnk: row.stnk,
    stnkDate: row.stnk_date,
    noPajak: row.no_pajak,
    pajakDate: row.pajak_date,
    serviceDate: row.service_date,
    km: row.km || 0,
    kmMax: row.km_max || 10000,
    kmServiceStart: row.km_service_start || 0,
    pj: row.pj,
    hp: row.hp,
    tg: row.tg,
    email: row.email,
    telegramChatId: row.telegram_chat_id,
    notifTg: row.notif_tg !== false,
    notifEmail: row.notif_email !== false,
    lastSent: row.last_sent,
    fotoKendaraan: row.foto_kendaraan || null,
    fotoStnk: row.foto_stnk || null,
  };
};

window.uiToDb = function(v) {
  return {
    jenis: v.jenis,
    type: v.type,
    plate: v.plate,
    asal: v.asal,
    stnk: v.stnk || null,
    stnk_date: v.stnkDate || null,
    no_pajak: v.noPajak || null,
    pajak_date: v.pajakDate,
    service_date: v.serviceDate || null,
    km: v.km || 0,
    km_max: v.kmMax || 10000,
    km_service_start: v.kmServiceStart || 0,
    pj: v.pj,
    hp: v.hp,
    tg: v.tg || null,
    email: v.email || null,
    telegram_chat_id: v.telegramChatId || null,
    notif_tg: v.notifTg !== false,
    notif_email: v.notifEmail !== false,
    last_sent: v.lastSent || null,
    foto_kendaraan: v.fotoKendaraan || null,
    foto_stnk: v.fotoStnk || null,
  };
};

// Helper: upload foto ke Supabase Storage, return public URL
window.uploadFoto = async function(file, plate, jenis) {
  // jenis: 'kendaraan' atau 'stnk'
  const ext = file.name.split('.').pop().toLowerCase();
  const safePlate = plate.replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `${jenis}/${safePlate}-${Date.now()}.${ext}`;

  const { data, error } = await window.supabaseClient.storage
    .from('kendaraan-photos')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) throw error;

  const { data: urlData } = window.supabaseClient.storage
    .from('kendaraan-photos')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
};

// Helper: hitung status service berdasarkan KM
// Interval service otomatis berdasarkan jenis kendaraan
window.getServiceInterval = function(jenis) {
  if (!jenis) return 10000;
  return jenis.toLowerCase() === 'motor' ? 3000 : 10000;
};

window.getServiceKmStatus = function(km, kmServiceStart, jenis) {
  const KM_INTERVAL = window.getServiceInterval(jenis);
  const KM_NOTIF_THRESHOLD = Math.round(KM_INTERVAL * 0.1); // 10% dari interval
  const kmTarget = (kmServiceStart || 0) + KM_INTERVAL;
  const kmSisa = kmTarget - (km || 0);
  const kmProgress = Math.min(100, Math.max(0, ((km - (kmServiceStart||0)) / KM_INTERVAL) * 100));

  let status, color, label;
  if (kmSisa <= 0) {
    status = 'overdue'; color = '#DC2626';
    label = `Lewat ${Math.abs(kmSisa).toLocaleString('id-ID')} km`;
  } else if (kmSisa <= KM_NOTIF_THRESHOLD) {
    status = 'warning'; color = '#F59E0B';
    label = `Sisa ${kmSisa.toLocaleString('id-ID')} km`;
  } else {
    status = 'ok'; color = '#059669';
    label = `Sisa ${kmSisa.toLocaleString('id-ID')} km`;
  }

  return { kmTarget, kmSisa, kmProgress, status, color, label, KM_INTERVAL };
};

// ============= AUTH =============
window.checkAuth = async function() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const user = session.user;
  const email = user.email;
  const name = (user.user_metadata && user.user_metadata.name) || email.split('@')[0];
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const userNameEl = document.getElementById('userName');
  const userAvatarEl = document.getElementById('userAvatar');
  const userRoleEl = document.getElementById('userRole');

  if (userNameEl) userNameEl.textContent = name;
  if (userAvatarEl) userAvatarEl.textContent = initials;
  if (userRoleEl) userRoleEl.textContent = email;

  return user;
};

window.setupLogoutBtn = function() {
  const btn = document.getElementById('btnLogout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Yakin mau logout?')) return;
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  });
};

window.setupSidebarToggle = function() {
  const btn = document.querySelector('.mobile-menu-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
  });
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      overlay.classList.remove('show');
    });
  }
};

// ============= SIDEBAR HTML GENERATOR =============
window.renderSidebar = function(activePage) {
  const items = [
    { section: 'Modul Utama', pages: [
      { id: 'dashboard', name: 'Dashboard', href: 'app.html', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
      { id: 'kendaraan', name: 'Kendaraan', href: 'kendaraan.html', icon: '<path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>' },
      { id: 'kalender', name: 'Kalender', href: 'kalender.html', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
      { id: 'notifikasi', name: 'Notifikasi', href: 'notifikasi.html', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
      { id: 'pj', name: 'Penanggung Jawab', href: 'pj.html', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>' },
    ]},
    { section: 'Sistem', pages: [
      { id: 'laporan', name: 'Laporan & Statistik', href: 'laporan.html', icon: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>' },
      { id: 'log', name: 'Log Aktivitas', href: 'log.html', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
      { id: 'pengaturan', name: 'Pengaturan', href: 'pengaturan.html', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
    ]}
  ];

  const html = `
    <div class="brand">
      <div class="brand-mark">
        <div class="brand-logo">S</div>
        <div class="brand-text">
          <span class="brand-name">SIMOPAS</span>
          <span class="brand-sub">Monitoring v4.0</span>
        </div>
      </div>
    </div>
    ${items.map(group => `
      <div class="nav-section">
        <div class="nav-label">${group.section}</div>
        ${group.pages.map(page => `
          <a href="${page.href}" class="nav-item ${activePage === page.id ? 'active' : ''}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${page.icon}</svg>
            ${page.name}
          </a>
        `).join('')}
      </div>
    `).join('')}
    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar" id="userAvatar">AD</div>
        <div class="user-info">
          <div class="user-name" id="userName">Loading...</div>
          <div class="user-role" id="userRole">admin</div>
        </div>
      </div>
      <button id="btnLogout" style="
        width:100%;
        margin-top:8px;
        padding:9px 12px;
        background:rgba(255,85,102,0.12);
        border:1px solid rgba(255,85,102,0.3);
        border-radius:8px;
        color:#ff7785;
        font-family:inherit;
        font-size:13px;
        font-weight:600;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        transition:all 0.15s ease;
      " onmouseover="this.style.background='rgba(255,85,102,0.22)'" onmouseout="this.style.background='rgba(255,85,102,0.12)'">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Logout
      </button>
    </div>
  `;

  document.getElementById('sidebar').innerHTML = html;
};

// ============= TOAST =============
window.toast = function(title, msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    danger: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-icon">${icons[type]}</div><div class="toast-content"><strong>${title}</strong><span>${msg}</span></div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 300); }, 3500);
};

// ============= LOG AKTIVITAS =============
window.logActivity = async function(aksi, detail = '', kendaraan_id = null, modul = 'Kendaraan') {
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const user = session?.user;
    await window.supabaseClient.from('aktivitas_log').insert({
      aksi,
      detail,
      modul,
      kendaraan_id: kendaraan_id || null,
      user_email: user?.email || 'system',
      user_name: user?.email?.split('@')[0] || 'system',
    });
  } catch (e) {
    console.warn('logActivity error:', e.message);
  }
};

// ============= INIT (call on every page) =============
window.simopasInit = async function(activePage) {
  window.renderSidebar(activePage);
  window.setupLogoutBtn();
  window.setupSidebarToggle();
  const user = await window.checkAuth();
  if (user) requestAnimationFrame(() => document.body.classList.add('page-enter'));
  return user;
};
