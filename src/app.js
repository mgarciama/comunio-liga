  // --- Auth ---
  const KV_WORKER = 'https://comunio-liga.garciamartin-manuel-mg.workers.dev/api';
  const REPO = 'mgarciama/comunio-liga';
  const ADMIN_USER = '@admin', ADMIN_PASS = 'Europa001@';
  let isAdmin = sessionStorage.getItem('comunio_admin') === '1';
  let dirty = false; // cambios sin guardar

  function updateAdminUI(){
    document.body.classList.toggle('admin-active', isAdmin);
    const lt = document.getElementById('login-trigger');
    if(isAdmin){
      lt.textContent = '👑'; lt.style.color = 'var(--amber)';
    } else {
      lt.textContent = '👤'; lt.style.color = 'var(--amber-dim)';
    }
  }
  updateAdminUI();

  // Login trigger
  document.getElementById('login-trigger').addEventListener('click', e => {
    e.preventDefault();
    if(isAdmin) return;
    document.getElementById('login-modal').classList.add('open');
  });

  // Logout trigger
  document.getElementById('logout-trigger').addEventListener('click', e => {
    e.preventDefault();
    doLogout();
  });

  function doLogout(){
    isAdmin = false; sessionStorage.removeItem('comunio_admin'); dirty = false;
    updateAdminUI(); renderAll();
  }

  // Save trigger
  document.getElementById('save-trigger').addEventListener('click', e => {
    e.preventDefault();
    publicarCambios();
  });
  document.getElementById('save-btn-footer').addEventListener('click', publicarCambios);

  // Login modal
  document.getElementById('login-modal').addEventListener('click', function(e){ if(e.target === this) this.classList.remove('open'); });
  document.getElementById('login-btn').addEventListener('click', () => {
    const u = document.getElementById('login-user').value, p = document.getElementById('login-pass').value;
    if(u === ADMIN_USER && p === ADMIN_PASS){
      isAdmin = true; sessionStorage.setItem('comunio_admin', '1'); dirty = false;
      document.getElementById('login-modal').classList.remove('open');
      document.getElementById('login-user').value = ''; document.getElementById('login-pass').value = '';
      document.getElementById('login-err').style.display = 'none';
      updateAdminUI(); renderAll();
    } else {
      document.getElementById('login-err').style.display = 'block';
    }
  });
  document.querySelectorAll('#login-user,#login-pass').forEach(el => {
    el.addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('login-btn').click(); });
  });

  // --- GitHub sync ---
  function getToken(){ return localStorage.getItem('comunio_gh_token'); }

  async function ghSave(path, content){
    let token = getToken();
    if(!token){
      token = prompt('🔐 GitHub Personal Access Token:\n\nCrealo en GitHub → Settings → Developer settings → Tokens (classic) → Generate\nMarca el scope "repo" y copia el token aquí:');
      if(!token) return false;
      localStorage.setItem('comunio_gh_token', token);
    }
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
    const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
    let sha = null;
    try{ const r = await fetch(url, { headers: { Authorization: 'Bearer '+token } }); if(r.ok) sha = (await r.json()).sha; }catch(e){}
    const body = { message: 'Update ' + path, content: encoded }; if(sha) body.sha = sha;
const res = await fetch(url, { method: 'PUT', headers: { Authorization: 'Bearer '+token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if(!res.ok){ const e = await res.json(); console.error('ghSave error:', e); alert('Error al guardar '+path+': '+(e.message||res.status)+'\n\nVerifica que el token tenga scope "repo".'); if(res.status===401) localStorage.removeItem('comunio_gh_token'); return false; }
    console.log('ghSave OK:', path);
    return true;
  }

  async function publicarCambios(){
    const btn1 = document.getElementById('save-trigger');
    const btn2 = document.getElementById('save-btn-footer');

    // Validar posiciones unicas
    for(let j = 0; j < NUM_JORNADAS; j++){
      const vals = ranks.map(row => row[j]).filter(v => v !== null && v !== undefined);
      if(vals.length < 2) continue;
      for(let n = 1; n <= 14; n++){
        if(vals.filter(v => v === n).length > 1){
          alert('⚠ Jornada '+(j+1)+': posición '+n+' repetida.'); return;
        }
      }
    }

    saveRanks(); savePagos(); dirty = false;
    [btn1, btn2].forEach(b => { if(b) b.textContent = '⏳...'; });

    try {
      const res = await fetch(KV_WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jornadas: ranks, pagos })
      });
      if(!res.ok) throw new Error('Error '+res.status);
      [btn1, btn2].forEach(b => { if(b) b.textContent = '✅'; });
    } catch(e){
      [btn1, btn2].forEach(b => { if(b) b.textContent = '❌'; });
      alert('Error: '+e.message);
    }
    setTimeout(() => { [btn1, btn2].forEach(b => { if(b) b.textContent = '💾 Guardar'; }); }, 2000);
  }

  async function loadFromRepo(path){
    try{ const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`); if(!r.ok) return null; return await r.json(); }catch{ return null; }
  }

  // Datos base

  // --- Menú móvil ---
  document.querySelector('.nav-toggle').addEventListener('click', function(){
    document.querySelector('nav ul').classList.toggle('open');
  });
  // Default: mostrar inicio
  document.getElementById('inicio').classList.add('active');
// Navegación entre secciones
  document.querySelectorAll('nav a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const href = a.getAttribute('href');
      if(href === '#') return; // Admin/Salir/Guardar links
      const target = document.querySelector(href);
      if(!target) return;
      document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
      target.classList.add('active');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector('nav ul').classList.remove('open');
      // Highlight active menu item
      document.querySelectorAll('nav a[href^="#"]').forEach(l => l.classList.remove('nav-active'));
      a.classList.add('nav-active');
      if(href === '#jornadas') renderJornadaCards();
      if(href === '#pagos') renderPagos();
    });
  });
  // Highlight inicio por defecto
  document.querySelector('nav a[href="#inicio"]').classList.add('nav-active');

  const PLAYERS = [
    {nombre:"Jose Negro",  equipo:"el maki Roldan",            pagado:true,  cuota:"40€", biwengerId:2213278},
    {nombre:"Harryson",    equipo:"Gryffindor",                pagado:true,  cuota:"40€", biwengerId:2214626},
    {nombre:"Tary",        equipo:"Los Carrinton FC",          pagado:false, cuota:"10€", biwengerId:2213283},
    {nombre:"Gaspar",      equipo:"Los Reyes de Europa C.F",   pagado:true,  cuota:"40€", biwengerId:9990906},
    {nombre:"Arroyo",      equipo:"Turbanera",                 pagado:true,  cuota:"40€", biwengerId:2216723},
    {nombre:"Charli",      equipo:"Fermux",                    pagado:false, cuota:"20€", biwengerId:2217630},
    {nombre:"Manolillo",   equipo:"Nolillo2️⃣2️⃣",              pagado:true,  cuota:"40€", biwengerId:2213276},
    {nombre:"Tanke",       equipo:"Sonámbulos Hermanos UF",    pagado:false, cuota:"0€", biwengerId:12595114},
    {nombre:"Enrique",     equipo:"Oportopor",                 pagado:true,  cuota:"10€", biwengerId:2213275},
    {nombre:"Jaime",       equipo:"Luis de la Fuente",         pagado:true,  cuota:"40€", biwengerId:13946856},
    {nombre:"Osquillar",   equipo:"la makina",                 pagado:true,  cuota:"40€", biwengerId:13949428},
    {nombre:"Javi",        equipo:"Bayer de Los Caídos FC",    pagado:true,  cuota:"40€", biwengerId:13955595},
    {nombre:"Borja",       equipo:"MouTeam",                   pagado:true,  cuota:"40€", biwengerId:13975535},
    {nombre:"Alvaro",      equipo:"DIEGO ARMANDO MARADONA",    pagado:true,  cuota:"40€", biwengerId:13965613},
  ];

  const NUM_JORNADAS = 38;
  const STORAGE_KEY = 'comunio_jornadas_v1';

  function loadRanks(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed) && parsed.length === PLAYERS.length) return parsed;
      }
    }catch(e){ /* localStorage no disponible: seguimos con datos vacios */ }
    return PLAYERS.map(() => Array(NUM_JORNADAS).fill(null));
  }
  function saveRanks(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(ranks)); }catch(e){ /* modo privado, no pasa nada */ }
  }

  let ranks = loadRanks();

  function computePrimas(i){
    let total = 0;
    for(const r of ranks[i]){
      if(r === 1) total += 2;
      else if(r === 2 || r === 3) total += 1;
    }
    return total;
  }
  // Prima otorgada en una jornada concreta (2€ 1º, 1€ 2º/3º, 0€ resto)
  function primaJornada(i, j){
    const r = ranks[i] && ranks[i][j];
    if(r === 1) return 2;
    if(r === 2 || r === 3) return 1;
    return 0;
  }
  function computeJornadaActual(){
    let last = 0;
    for(let j = 0; j < NUM_JORNADAS; j++){
      if(ranks.some(row => row[j] !== null && row[j] !== undefined)) last = j + 1;
    }
    return last;
  }

  // --- Construir jornadas (cards) ---
  const filter = document.getElementById('jornada-filter');
  for(let j = 1; j <= NUM_JORNADAS; j++){
    const opt = document.createElement('option');
    opt.value = j; opt.textContent = 'Jornada ' + j;
    filter.appendChild(opt);
  }
  filter.addEventListener('change', renderJornadaCards);
  function renderJornadaCards(){
    const container = document.getElementById('jornadas-cards');
    const filterVal = filter.value;
    const isAll = filterVal === 'all';
    container.innerHTML = '';

    if(isAll){
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:center;padding:0 16px 6px;font-size:11px;color:var(--chalk-dim);text-transform:uppercase;letter-spacing:.06em;font-family:JetBrains Mono,monospace;';
      hdr.innerHTML = '<span style="width:40px;text-align:center;flex-shrink:0;">#</span><span style="flex:1;">Equipo</span><span style="width:80px;text-align:right;flex-shrink:0;">Primas total</span>';
      container.appendChild(hdr);

      let data = PLAYERS.map((p, i) => ({...p, idx: i, primas: computePrimas(i)}));
      data.sort((a, b) => b.primas - a.primas);

      data.forEach((p, rank) => {
        const row = document.createElement('div');
        row.className = 'jornada-row';
        const icon = biwengerIcons[p.equipo.toLowerCase()];
        const iconHtml = icon ? '<img src="'+icon+'" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">' : '';
        row.innerHTML = '<span class="pos" style="font-size:14px;color:var(--chalk-dim);">'+(rank+1)+'</span><span class="info">'+iconHtml+' <span><span class="team">'+p.equipo+'</span><br><span class="mgr">'+p.nombre+'</span></span></span><span class="pri">'+p.primas+'€</span>';
        container.appendChild(row);
      });
      return;
    }

    const j = parseInt(filterVal) - 1;
    const jornadaRellenada = ranks.some(row => row[j] !== null && row[j] !== undefined);

    // Vista pública: jornadas no jugadas/pendientes → no mostrar datos ni confusión.
    // Admin: siempre puede acceder a editar, incluso antes de que haya posiciones.
    if(!jornadaRellenada && !isAdmin){
      container.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--chalk-dim);"><div style="font-family:Bebas Neue,sans-serif;font-size:36px;color:var(--amber-dim);margin-bottom:8px;">⏳</div><p style="font-size:15px;">Jornada ' + filterVal + ' aún no se ha jugado.</p><p style="font-size:13px;margin-top:4px;">Las posiciones aparecerán aquí cuando se introduzcan los resultados.</p></div>';
      return;
    }

    if(isAdmin && !jornadaRellenada){
      container.innerHTML = '<div style="padding:18px 22px;margin-bottom:14px;background:rgba(242,169,59,0.07);border:1px dashed var(--amber-dim);border-radius:6px;font-size:13px;color:var(--chalk-dim);">✏️ Jornada ' + filterVal + ' aún sin resultados de Biwenger. Puedes introducir las posiciones manualmente aquí abajo (se conservarán).</div>';
    }

    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;padding:0 16px 6px;font-size:11px;color:var(--chalk-dim);text-transform:uppercase;letter-spacing:.06em;font-family:JetBrains Mono,monospace;';
    hdr.innerHTML = '<span style="width:40px;text-align:center;flex-shrink:0;">Pos</span><span style="flex:1;">Equipo</span><span style="width:70px;text-align:right;flex-shrink:0;">Prima J' + filterVal + '</span>';
    container.appendChild(hdr);

    let data = PLAYERS.map((p, i) => ({...p, idx: i, primas: computePrimas(i)}));
    data.sort((a, b) => {
      const va = ranks[a.idx][j], vb = ranks[b.idx][j];
      const na = (va === null || va === undefined), nb = (vb === null || vb === undefined);
      if(na && nb) return 0;
      if(na) return 1;
      if(nb) return -1;
      return va - vb;
    });
    data.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'jornada-row';
      const icon = biwengerIcons[p.equipo.toLowerCase()];
      const iconHtml = icon ? '<img src="'+icon+'" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">' : '';
      const val = ranks[p.idx][j];
      const cls = val===1?'':(val===2||val===3?' r2':'');
      const posText = val!==null&&val!==undefined?val:'';
      const primaJ = primaJornada(p.idx, j);
      if(isAdmin){
        row.innerHTML = '<span class="pos'+cls+'" style="font-size:14px;">'+(posText||'—')+'</span><span class="info">'+iconHtml+' <span><span class="team">'+p.equipo+'</span><br><span class="mgr">'+p.nombre+'</span></span></span><input class="pos-input" data-p="'+p.idx+'" data-j="'+j+'" value="'+(val!==null&&val!==undefined?val:'')+'" placeholder="—"><span class="pri">'+primaJ+'€<small style="display:block;font-size:10px;color:var(--chalk-dim);font-weight:400;">J'+filterVal+'</small></span>';
      } else {
        row.innerHTML = '<span class="pos'+cls+'">'+(posText||'—')+'</span><span class="info">'+iconHtml+' <span><span class="team">'+p.equipo+'</span><br><span class="mgr">'+p.nombre+'</span></span></span><span class="pri">'+primaJ+'€<small style="display:block;font-size:10px;color:var(--chalk-dim);font-weight:400;">J'+filterVal+'</small></span>';
      }
      container.appendChild(row);
    });

if(isAdmin && !isAll){
      container.oninput = function(e){
        const inp = e.target.closest('.pos-input');
        if(!inp) return;
        const p = Number(inp.dataset.p), j = Number(inp.dataset.j);
        let raw = parseInt(inp.value);
        let val = (isNaN(raw) || raw === 0 || raw < 1 || raw > 14) ? null : raw;
        ranks[p][j] = val;
        saveRanks(); dirty = true;
        updateBanner();
        const row = inp.closest('.jornada-row');
        const posSpan = row.querySelector('.pos');
        const cls = val === 1 ? '' : (val === 2 || val === 3 ? ' r2' : '');
        posSpan.className = 'pos' + cls;
        posSpan.textContent = val !== null ? val : '—';
      };
    }
  }

  async function fetchBiwengerData() {
    try {
      const res = await fetch(KV_WORKER);
      if (res.ok) {
        const data = await res.json();
        if (data && data.biwenger && Array.isArray(data.biwenger.standings)) return data.biwenger;
      }
    } catch (e) {}
    const res = await fetch('biwenger-data.json');
    if (!res.ok) throw new Error('No se encontró biwenger-data.json');
    return await res.json();
  }

  let biwengerIcons = {};
  fetchBiwengerData()
    .then(data => {
      (data.standings || []).forEach(s => { biwengerIcons[s.name.toLowerCase()] = s.icon; });
      renderJornadaCards();
    })
    .catch(() => renderJornadaCards());


  function updateBanner(){
    const actual = computeJornadaActual();
    document.getElementById('jb-actual').innerHTML = actual + ' <span>/ 38</span>';
    document.getElementById('jb-label').textContent = actual === 0 ? 'Aún sin empezar' : 'Jornada ' + actual + ' jugada';
    const totalPrimas = PLAYERS.reduce((sum, _, i) => sum + computePrimas(i), 0);
    document.getElementById('jb-primas').textContent = totalPrimas + '€ / 152€';
  }

  updateBanner();

  // --- Seccion de pagos ---
  const PAGOS_KEY = 'comunio_pagos_v1';
  const BOTE_ESPERADO = 530;
  const CUOTA_NORMAL = 40;

  let pagos = PLAYERS.map(p => ({...p}));
  try{ const raw = localStorage.getItem(PAGOS_KEY); if(raw){ pagos = JSON.parse(raw); } }catch(e){}
  // Sync desde PLAYERS usando nombre como clave
  const playerByName = {}; PLAYERS.forEach(p => { playerByName[p.nombre] = p; });
  pagos.forEach(p => {
    const src = playerByName[p.nombre];
    if(src){ p.equipo = src.equipo; p.biwengerId = src.biwengerId; }
  });
  savePagos();
  function savePagos(){ try{ localStorage.setItem(PAGOS_KEY, JSON.stringify(pagos)); }catch(e){} }

  function updatePagosSummary(){
    const pagadosList = pagos.filter(j => j.pagado);
    const pendientesList = pagos.filter(j => !j.pagado);
    const recaudado = pagos.reduce((sum, j) => {
      const m = parseInt(j.cuota) || 0;
      if(j.pagado) return sum + m;
      if(m < CUOTA_NORMAL) return sum + m;
      return sum;
    }, 0);
    const pct = Math.min(100, Math.round((recaudado / BOTE_ESPERADO) * 100));
    const resto = BOTE_ESPERADO - recaudado;
    document.getElementById('pg-pagados').textContent = pagadosList.length+'/'+pagos.length;
    document.getElementById('pg-pendientes').textContent = pendientesList.length;
    document.getElementById('pg-recaudado').innerHTML = recaudado+'€ <span style="font-size:18px;color:var(--chalk-dim)">/ '+BOTE_ESPERADO+'€</span>';
    document.getElementById('pg-restante').textContent = (resto > 0 ? resto+'€ por cobrar' : '¡Completado!');
    document.getElementById('pg-fill').style.width = pct+'%';
  }

  function renderPagos(){
    const listaPagados = document.getElementById('lista-pagados');
    const listaPendientes = document.getElementById('lista-pendientes');
    listaPagados.innerHTML = '';
    listaPendientes.innerHTML = '';

    pagos.forEach((j, idx) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.style.cssText = 'display:flex; align-items:center; gap:10px;';
      const pagadoVal = parseInt(j.cuota) || 0;
      const debeVal = Math.max(0, CUOTA_NORMAL - pagadoVal);

      if(isAdmin){
        row.innerHTML = `
          <span class="dot"></span>
          <span class="who" style="flex:1;"><span class="name">${j.equipo}</span><br><span class="team">${j.nombre}</span></span>
          <div style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:11px; color:var(--chalk-dim);">Pagado</span>
            <input class="pago-monto" data-idx="${idx}" value="${j.cuota.replace('€','').replace('+ pendiente','').replace('+ premium','').trim()}" style="width:52px; background:var(--pitch-dark); border:1px solid var(--line-strong); border-radius:4px; color:var(--chalk); font-family:'JetBrains Mono',monospace; text-align:center; font-size:14px; font-weight:700; padding:4px; outline:none;">
            <span style="font-size:11px; color:var(--chalk-dim);">€</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:11px; color:var(--chalk-dim);">Debe</span>
            <input class="pago-debe" value="${debeVal}" readonly style="width:52px; background:transparent; border:1px solid var(--line); border-radius:4px; color:var(--amber-dim); font-family:'JetBrains Mono',monospace; text-align:center; font-size:14px; font-weight:700; padding:4px; outline:none; cursor:default;">
            <span style="font-size:11px; color:var(--chalk-dim);">€</span>
          </div>
          <button class="pago-toggle" data-idx="${idx}" style="background:${j.pagado?'#4ADE80':'var(--amber-dim)'}; border:none; color:var(--navy); font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700; padding:4px 8px; border-radius:4px; cursor:pointer; white-space:nowrap;">${j.pagado ? '✓' : '✗'}</button>
        `;
      } else {
        const pct = Math.round((pagadoVal / CUOTA_NORMAL) * 100);
        const dotColor = j.pagado ? '#4ADE80' : (pagadoVal > 0 ? 'var(--amber-dim)' : 'var(--red)');
        row.innerHTML = `
          <span class="dot" style="background:${dotColor}; box-shadow:0 0 6px ${dotColor};"></span>
          <span class="who" style="flex:1;"><span class="name">${j.equipo}</span><br><span class="team">${j.nombre}</span></span>
          <div style="text-align:right;">
            <div style="font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:700; color:var(--chalk);">${j.pagado ? '40€' : pagadoVal+'€'}</div>
            <div style="font-size:11px; color:${j.pagado ? '#4ADE80' : (pagadoVal > 0 ? 'var(--amber-dim)' : 'var(--red)')};">
              ${j.pagado ? '✅ Completado' : (pagadoVal > 0 ? 'Pagado: '+pagadoVal+'€ · Debe: '+debeVal+'€' : 'Debe: '+debeVal+'€')}
            </div>
          </div>
        `;
      }
      (j.pagado ? listaPagados : listaPendientes).appendChild(row);
    });

    if(isAdmin){
      listaPagados.onclick = listaPendientes.onclick = function(e){
        const btn = e.target.closest('.pago-toggle');
        if(!btn) return;
        const idx = Number(btn.dataset.idx);
        pagos[idx].pagado = !pagos[idx].pagado;
        savePagos(); dirty = true;
        renderPagos();
      };
      const handleMonto = function(e){
        const input = e.target.closest('.pago-monto');
        if(!input) return;
        const idx = Number(input.dataset.idx);
        const val = parseInt(input.value) || 0;
        const clean = Math.max(0, Math.min(CUOTA_NORMAL, val));
        pagos[idx].cuota = clean + '€';
        savePagos(); dirty = true;
        // Actualizar campo debe sin re-renderizar
        const row = input.closest('.player-row');
        const debeInput = row.querySelector('.pago-debe');
        if(debeInput) debeInput.value = CUOTA_NORMAL - clean;
        updatePagosSummary();
      };
      listaPagados.oninput = listaPendientes.oninput = handleMonto;
    }

    updatePagosSummary();
  }

  renderPagos();

  function renderAll(){ renderJornadaCards(); renderPagos(); updateBanner(); }

  // Mezclar las posiciones oficiales de Biwenger (jornadas completadas) sobre ranks.
  // El JSON solo contiene jornadas "finished": si una jornada está pendiente/aplazada
  // aparece como null y no se toca. Las posiciones introducidas a mano se conservan
  // en jornadas donde Biwenger aún no tiene resultado.
  async function mergeJornadasData(){
    try {
      const res = await fetch('jornadas-data.json');
      if(!res.ok) return;
      const file = await res.json();
      if(!Array.isArray(file) || file.length !== PLAYERS.length) return;
      file.forEach((row, i) => {
        if(!Array.isArray(row)) return;
        if(!ranks[i] || ranks[i].length !== NUM_JORNADAS) ranks[i] = Array(NUM_JORNADAS).fill(null);
        row.forEach((v, j) => {
          if(v !== null && v !== undefined) ranks[i][j] = v;
        });
      });
      saveRanks();
    } catch(e) {}
  }

  // Cargar desde KV al iniciar (el KV del cron siempre es fuente, rellena sin pisar)
  (async function(){
    try {
      const res = await fetch(KV_WORKER);
      if(res.ok){
        const data = await res.json();
        if(data.jornadas && Array.isArray(data.jornadas) && data.jornadas.length === PLAYERS.length){
          data.jornadas.forEach((row, i) => {
            if(!Array.isArray(row)) return;
            if(!ranks[i] || ranks[i].length !== NUM_JORNADAS) ranks[i] = Array(NUM_JORNADAS).fill(null);
            row.forEach((v, j) => {
              if(v !== null && v !== undefined) ranks[i][j] = v;
            });
          });
        }
        if(data.pagos && Array.isArray(data.pagos)){ pagos = data.pagos; savePagos(); }
      }
    } catch(e) {}
    await mergeJornadasData();
    renderAll();
  })();

  // --- Datos Biwenger (clasificación real por puntos) ---
  async function loadBiwengerData() {
    const tbody = document.getElementById('tabla-biwenger');
    const updatedEl = document.getElementById('biwenger-updated');
    try {
      const data = await fetchBiwengerData();
      const { standings } = data;

      if (!standings || standings.length === 0) throw new Error('Sin datos de clasificación');

      tbody.innerHTML = '';
      standings.forEach((s, idx) => {
        const tr = document.createElement('tr');
        const pos = s.position || (idx + 1);
        const iconHtml = s.icon ? `<img src="${s.icon}" alt="" style="width:22px; height:22px; border-radius:50%; vertical-align:middle; margin-right:10px; object-fit:cover;">` : '';
        tr.innerHTML = `
          <td class="num" style="font-family:'JetBrains Mono',monospace; font-weight:700;">${pos}</td>
          <td class="jugador">${iconHtml}${s.name}</td>
          <td class="num" style="font-family:'JetBrains Mono',monospace; font-weight:700; font-size:16px; color:var(--amber);">${s.points.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
      });

      const date = new Date(data.updatedAt);
      const dateStr = date.toLocaleString('es-ES', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
      updatedEl.innerHTML = `Datos oficiales de Biwenger. <b>Actualizado: ${dateStr}</b>.`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:40px; color:var(--chalk-dim);">⚠ Sin datos. Ejecuta <span class="mono">node fetch-biwenger.mjs</span> tras configurar <span class="mono">.biwenger-credentials.json</span></td></tr>`;
    }
  }
  loadBiwengerData();

  // Reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:0.12});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
