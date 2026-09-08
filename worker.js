const BASE = 'https://biwenger.as.com/api/v2';
const LEAGUE_ID = 530044;
const NUM_JORNADAS = 38;
const NUM_PLAYERS = 14;
const IS_MADRID_TARGETS = ['07:00', '13:00', '17:00', '21:00'];
const MADRID_MARGIN_MIN = 2;

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
async function fetchJornadaEstado(session) {
  const { headers } = session;

  const res = await fetch(`${BASE}/rounds/league`, { headers });
  const body = await res.json();
  const roundId = body.data?.round?.id ?? null;
  const standings = body.data?.league?.standings || [];

  const roundRes = await fetch(`${BASE}/rounds/la-liga?lang=es`, { headers });
  const roundBody = await roundRes.json();
  const roundName = roundBody.data?.name || '';
  const match = roundName.match(/(\d+)/);
  const jornadaNum = match ? parseInt(match[1], 10) : null;

  let games = [];
  let todosFinalizados = false;
  if (roundId) {
    const gamesRes = await fetch(`${BASE}/rounds/la-liga/${roundId}`, { headers });
    const gamesBody = await gamesRes.json();
    games = gamesBody.data?.games || [];
    todosFinalizados = games.length > 0 && games.every(g => g.status === 'finished');
  }

  return { roundId, jornadaNum, standings, games, todosFinalizados };
}

// Actualiza la columna de la jornada en la matriz [14][38] guardada en KV.
// Solo se llama cuando todos los partidos de la jornada han finalizado.
async function updateJornadas(session, env, jornadaNum, standings) {
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

  const col = Math.min(jornadaNum - 1, NUM_JORNADAS - 1);
  for (const m of standings) {
    const pos = m.lineup?.position;
    if (pos == null) continue;
    const idx = MANAGER_IDS.indexOf(m.id);
    if (idx !== -1 && idx < NUM_PLAYERS) matrix[idx][col] = pos;
  }

  await env.COMUNIO.put('jornadas', JSON.stringify(matrix));
  console.log(`   ✅ J${jornadaNum}: posiciones guardadas en KV`);
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
      return Response.json({
        jornadas: jornadas ? JSON.parse(jornadas) : null,
        pagos: pagos ? JSON.parse(pagos) : null,
        biwenger: biwenger ? JSON.parse(biwenger) : null,
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

export { biwengerSession, fetchClasificacion, fetchJornadaEstado, updateJornadas };

async function updateBiwenger(env) {
  try {
    const session = await biwengerSession(env);

    const clasificacion = await fetchClasificacion(session);
    await env.COMUNIO.put('biwenger', JSON.stringify(clasificacion));
    console.log(`✅ Clasificación actualizada (${clasificacion.standings.length} equipos)`);

    const jornada = await fetchJornadaEstado(session);
    console.log(`⚽ Jornada ${jornada.jornadaNum} (round ${jornada.roundId}) — ${jornada.games.length} partidos`);
    if (!jornada.todosFinalizados) {
      console.log(`   ⏳ Hay partidos en juego/pendientes. No se actualiza la matriz.`);
      return;
    }
    if (!jornada.jornadaNum) return;

    await updateJornadas(session, env, jornada.jornadaNum, jornada.standings);
  } catch (err) {
    console.error('❌ Error actualizando:', err.message);
  }
}