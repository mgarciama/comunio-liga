const BASE = 'https://biwenger.as.com/api/v2';
const LEAGUE_ID = 530044;
const NUM_JORNADAS = 38;
const NUM_PLAYERS = 14;
const IS_MADRID_TARGETS = ['07:00', '13:00', '17:30', '21:00'];
const MADRID_MARGIN_MIN = 2;
// Rondas anteriores a revisar si su columna quedo vacia (backfill).
const BACKFILL_RONDAS = 3;

// Los 14 managers de la liga (el mismo listado que update-jornadas.mjs)
const MANAGER_IDS = [
  2213278, 2214626, 2213283, 9990906, 2216723, 2217630, 2213276,
  12595114, 2213275, 13946856, 13949428, 13955595, 13975535, 13965613,
];

function isMadridTargetTime() {
  const now = new Date();
  const time = now.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = time.split(':').map(Number);
  const totalMin = h * 60 + m;
  // Se ejecuta al menos 4 veces al día para capturar los puntos cuando salen.
  // Margen de 2 min por si el cron llega con retraso.
  return IS_MADRID_TARGETS.some(t => {
    const [th, tm] = t.split(':').map(Number);
    return Math.abs(totalMin - (th * 60 + tm)) <= MADRID_MARGIN_MIN;
  });
}

async function biwengerLogin(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Login fallido (${res.status}): ${await res.text()}`);
  return (await res.json()).token;
}

// Crea la sesión usando las credenciales del entorno (env.BIWENGER_EMAIL / BIWENGER_PASSWORD)
// y devuelve las variables reutilizables: token, userId y headers.
async function biwengerSession(env) {
  const { BIWENGER_EMAIL: email, BIWENGER_PASSWORD: password } = env;
  if (!email || !password) {
    throw new Error('No hay credenciales Biwenger (BIWENGER_EMAIL / BIWENGER_PASSWORD)');
  }

  const token = await biwengerLogin(email, password);
  const auth = `Bearer ${token}`; // autorización en variable reutilizable

  const accountRes = await fetch(`${BASE}/account`, {
    headers: { Authorization: auth, Accept: 'application/json' }
  });
  const account = await accountRes.json();
  const liga = account.data.leagues.find(l => l.id === LEAGUE_ID);
  if (!liga) throw new Error('Liga no encontrada');

  const userId = liga.user.id; // el user que juega en esta liga

  const headers = {
    Authorization: auth,
    Accept: 'application/json',
    'X-League': String(LEAGUE_ID),
    'X-User': String(userId),
  };

  return { token, auth, userId, liga, headers };
}

async function fetchClasificacion(session) {
  const { headers, liga } = session;
  const leagueRes = await fetch(`${BASE}/league?fields=standings,users`, { headers });
  const leagueData = await leagueRes.json();

  const standings = (leagueData.data.standings || []).map(s => ({
    position: s.position,
    name: s.name,
    points: s.points,
    icon: s.icon ? (s.icon.startsWith('http') ? s.icon : 'https://cdn.biwenger.com/' + s.icon) : null,
    id: s.id,
  }));

  return {
    updatedAt: new Date().toISOString(),
    league: {
      name: liga.name,
      id: LEAGUE_ID,
      competition: liga.competition,
      type: liga.type,
    },
    standings,
  };
}

// Estado de la jornada en curso: número, id de round y si todos los partidos finalizaron.
// `calendario` es opcional: si se le pasa (resultado de fetchCalendario), reutiliza el
// nombre de ronda y evita una petición extra a rounds/la-liga.
async function fetchJornadaEstado(session, calendario = null) {
  const { headers } = session;

  const res = await fetch(`${BASE}/rounds/league`, { headers });
  const body = await res.json();
  const roundId = body.data?.round?.id ?? null;
  const standings = body.data?.league?.standings || [];

  let roundName = calendario ? calendario.roundName : '';
  if (!roundName) {
    const roundRes = await fetch(`${BASE}/rounds/la-liga?lang=es`, { headers });
    const roundBody = await roundRes.json();
    roundName = roundBody.data?.name || '';
  }
  const match = roundName.match(/(\d+)/);
  const jornadaNum = match ? parseInt(match[1], 10) : null;

  let games = [];
  let todosFinalizados = false;
  if (roundId) {
    games = await fetchPartidosRonda(session, roundId);
    todosFinalizados = games.length > 0 && games.every(g => g.status === 'finished');
  }

  return { roundId, jornadaNum, standings, games, todosFinalizados };
}

// Calendario de la liga: nombre de la ronda actual y todas las rondas con su id.
// Sirve al backfill para traducir "jornada N" a round id.
async function fetchCalendario(session) {
  const { headers } = session;
  const res = await fetch(`${BASE}/rounds/la-liga?lang=es`, { headers });
  const body = await res.json();

  const rounds = [];
  const season = body.data?.season;
  if (season && Array.isArray(season.rounds)) {
    for (const rd of season.rounds) {
      const m = rd.name && rd.name.match(/^Round (\d+)/);
      if (!m) continue;
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= NUM_JORNADAS) rounds[num - 1] = { num, id: rd.id, name: rd.name };
    }
  }

  return { roundName: body.data?.name || '', rounds };
}

// Partidos de una ronda concreta (para saber si todos finalizaron).
async function fetchPartidosRonda(session, roundId) {
  const { headers } = session;
  const res = await fetch(`${BASE}/rounds/la-liga/${roundId}`, { headers });
  const body = await res.json();
  return body.data?.games || [];
}

// Posiciones oficiales ya publicadas de una ronda concreta.
async function fetchJornadaPosiciones(session, roundId) {
  const { headers } = session;
  const res = await fetch(`${BASE}/rounds/league/${roundId}`, { headers });
  const body = await res.json();
  return body.data?.league?.standings || [];
}

// Lee la matriz [14][38] de KV; si falta o está corrupta, devuelve una matriz vacía.
async function leerMatriz(env) {
  let matrix = Array.from({ length: NUM_PLAYERS }, () => Array(NUM_JORNADAS).fill(null));
  try {
    const raw = await env.COMUNIO.get('jornadas');
    if (raw) {
      const prev = JSON.parse(raw);
      if (Array.isArray(prev) && prev.length === NUM_PLAYERS) {
        prev.forEach((row, i) => {
          if (Array.isArray(row) && row.length === NUM_JORNADAS) matrix[i] = row.slice();
        });
      }
    }
  } catch (e) {}
  return matrix;
}

// Lee el mapa { jornada: motivo } de KV; si falta o está corrupto, devuelve {}.
async function leerEstado(env) {
  try {
    const raw = await env.COMUNIO.get('jornadas-estado');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return {};
}

// Motivo legible de por qué una jornada no tiene posiciones aún.
function motivoRonda(games) {
  if (!Array.isArray(games) || games.length === 0) return null;
  const aplazados = games.filter(g => g.status === 'postponed');
  const sinTerminar = games.filter(g => g.status !== 'finished');
  if (aplazados.length > 0) {
    const nombres = aplazados.slice(0, 2).map(g => `${g.home?.name || '?'} – ${g.away?.name || '?'}`);
    const extra = sinTerminar.length > aplazados.length ? ` (y ${sinTerminar.length - aplazados.length} más sin terminar)` : '';
    return `Partido aplazado: ${nombres.join(', ')}${extra}`;
  }
  if (sinTerminar.length > 0) return `${sinTerminar.length}/${games.length} partidos aún sin terminar`;
  return 'Jornada finalizada pero sin posiciones publicadas aún';
}

function columnaCompleta(matrix, jornadaNum) {
  const col = jornadaNum - 1;
  if (col < 0 || col >= NUM_JORNADAS) return true;
  return matrix.every(row => row[col] != null);
}

// Aplica las posiciones oficiales de una jornada sobre la matriz (en memoria).
// No sobrescribe columnas ya completas y solo devuelve true si escribió algo.
function aplicarPosiciones(matrix, jornadaNum, standings) {
  if (columnaCompleta(matrix, jornadaNum)) {
    console.log(`   ⏩ J${jornadaNum}: ya actualizada, no se toca nada.`);
    return false;
  }

  const col = Math.min(jornadaNum - 1, NUM_JORNADAS - 1);
  let escrito = 0;
  for (const m of standings) {
    const pos = m.lineup?.position;
    if (pos == null) continue;
    const idx = MANAGER_IDS.indexOf(m.id);
    if (idx !== -1 && idx < NUM_PLAYERS) {
      matrix[idx][col] = pos;
      escrito++;
    }
  }

  if (escrito > 0) console.log(`   ✅ J${jornadaNum}: ${escrito}/${NUM_PLAYERS} posiciones aplicadas en memoria.`);
  else console.log(`   ⏳ J${jornadaNum}: partidos acabados pero sin posiciones publicadas aún. Se reintentará.`);
  return escrito > 0;
}

// Compat/escritura de una sola columna (mantiene el contrato anterior).
async function updateJornadas(session, env, jornadaNum, standings) {
  const matrix = await leerMatriz(env);
  const hayCambios = aplicarPosiciones(matrix, jornadaNum, standings);
  if (hayCambios) {
    await env.COMUNIO.put('jornadas', JSON.stringify(matrix));
    console.log(`   💾 J${jornadaNum}: matriz guardada en KV`);
  }
  return matrix;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Solo maneja el API bajo /api; el resto lo sirve el asset estático
    if (url.pathname !== '/api') {
      return env.ASSETS.fetch(request);
    }

    // GET: leer
    if (request.method === 'GET') {
      const jornadas = await env.COMUNIO.get('jornadas');
      const pagos = await env.COMUNIO.get('pagos');
      const biwenger = await env.COMUNIO.get('biwenger');
      const jornadasEstado = await leerEstado(env);
      return Response.json({
        jornadas: jornadas ? JSON.parse(jornadas) : null,
        pagos: pagos ? JSON.parse(pagos) : null,
        biwenger: biwenger ? JSON.parse(biwenger) : null,
        jornadasEstado,
      }, { headers });
    }

    // POST: guardar
    if (request.method === 'POST') {
      const { jornadas, pagos } = await request.json();
      if (jornadas) await env.COMUNIO.put('jornadas', JSON.stringify(jornadas));
      if (pagos) await env.COMUNIO.put('pagos', JSON.stringify(pagos));
      return Response.json({ ok: true }, { headers });
    }

    return Response.json({ error: 'method not allowed' }, { status: 405, headers });
  },

  async scheduled(controller, env, ctx) {
    if (!isMadridTargetTime()) {
      console.log(`Skip: no es una hora objetivo en Madrid (${IS_MADRID_TARGETS.join(', ')})`);
      return;
    }
    ctx.waitUntil(updateBiwenger(env));
  }
};

export { biwengerSession, fetchClasificacion, fetchJornadaEstado, fetchJornadaPosiciones, updateJornadas, updateBiwenger };

async function updateBiwenger(env) {
  try {
    const session = await biwengerSession(env);

    const clasificacion = await fetchClasificacion(session);
    await env.COMUNIO.put('biwenger', JSON.stringify(clasificacion));
    console.log(`✅ Clasificación actualizada (${clasificacion.standings.length} equipos)`);

    const calendario = await fetchCalendario(session);
    const jornada = await fetchJornadaEstado(session, calendario);
    console.log(`⚽ Jornada ${jornada.jornadaNum} (round ${jornada.roundId}) — ${jornada.games.length} partidos`);

    const matrix = await leerMatriz(env);
    let hayCambios = false;

    // Partidos conocidos por jornada (actual + rondas de backfill) para el motivo.
    const gamesPorRonda = {};
    if (jornada.jornadaNum) gamesPorRonda[jornada.jornadaNum] = jornada.games;

    // 1) Jornada en curso
    if (jornada.jornadaNum) {
      if (jornada.todosFinalizados) {
        hayCambios = aplicarPosiciones(matrix, jornada.jornadaNum, jornada.standings) || hayCambios;
      } else {
        console.log(`   ⏳ J${jornada.jornadaNum}: partidos en juego/pendientes. No se actualiza la matriz.`);
      }

      // 2) Backfill: rondas anteriores que quedaron sin capturar.
      // Solo mira columnas no completas, y cada una exige ronda finalizada.
      for (let n = jornada.jornadaNum - 1; n >= Math.max(1, jornada.jornadaNum - BACKFILL_RONDAS); n--) {
        if (columnaCompleta(matrix, n)) continue;
        const rd = calendario.rounds[n - 1];
        if (!rd) continue;

        const games = await fetchPartidosRonda(session, rd.id);
        gamesPorRonda[n] = games;
        if (games.length === 0 || !games.every(g => g.status === 'finished')) {
          console.log(`   ⏳ J${n}: aún con partidos sin acabar (backfill espera).`);
          continue;
        }

        const standings = await fetchJornadaPosiciones(session, rd.id);
        hayCambios = aplicarPosiciones(matrix, n, standings) || hayCambios;
      }
    }

    // 3) Una sola escritura si hubo cambios.
    if (hayCambios) {
      await env.COMUNIO.put('jornadas', JSON.stringify(matrix));
      console.log('   💾 Matriz guardada en KV');
    }

    // 4) Motivo de las jornadas sin puntuar dentro de la ventana.
    if (jornada.jornadaNum) {
      const estado = await leerEstado(env);
      let estadoCambio = false;
      for (let n = Math.max(1, jornada.jornadaNum - BACKFILL_RONDAS); n <= jornada.jornadaNum; n++) {
        if (columnaCompleta(matrix, n)) {
          if (estado[n]) { delete estado[n]; estadoCambio = true; }
          continue;
        }
        const motivo = gamesPorRonda[n] ? motivoRonda(gamesPorRonda[n]) : null;
        if (motivo && estado[n] !== motivo) { estado[n] = motivo; estadoCambio = true; }
        else if (!motivo && estado[n]) { delete estado[n]; estadoCambio = true; }
      }
      if (estadoCambio) {
        await env.COMUNIO.put('jornadas-estado', JSON.stringify(estado));
        console.log('   🛈 Motivos de jornadas sin puntuar guardados en KV');
      }
    }
  } catch (err) {
    console.error('❌ Error actualizando:', err.message);
  }
}