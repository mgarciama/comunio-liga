import { writeFileSync, readFileSync, existsSync } from 'fs';

const BASE = 'https://biwenger.as.com/api/v2';
const CF = 'https://cf.biwenger.com/api/v2';
const CREDENTIALS_FILE = '.biwenger-credentials.json';
const OUTPUT_FILE = 'jornadas-data.json';
const ESTADO_FILE = 'jornadas-estado.json';
const LEAGUE_ID = 530044;
const NUM_JORNADAS = 38;
const NUM_PLAYERS = 14;

// Motivo legible de por qué una jornada aún no tiene posiciones (espejo del worker).
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

const PLAYERS = [
  { nombre: 'Jose Negro', equipo: 'el maki Roldan',          biwengerId: 2213278 },
  { nombre: 'Harryson',  equipo: 'Gryffindor',              biwengerId: 2214626 },
  { nombre: 'Tary',      equipo: 'Los Carrinton FC',        biwengerId: 2213283 },
  { nombre: 'Gaspar',    equipo: 'Los Reyes de Europa C.F', biwengerId: 9990906 },
  { nombre: 'Arroyo',    equipo: 'Turbanera',               biwengerId: 2216723 },
  { nombre: 'Charli',    equipo: 'Fermux',                  biwengerId: 2217630 },
  { nombre: 'Manolillo', equipo: 'Nolillo2️⃣2️⃣',            biwengerId: 2213276 },
  { nombre: 'Tanke',     equipo: 'Sonámbulos Hermanos UF',  biwengerId: 12595114 },
  { nombre: 'Enrique',   equipo: 'Oportopor',               biwengerId: 2213275 },
  { nombre: 'Jaime',     equipo: 'Luis de la Fuente',       biwengerId: 13946856 },
  { nombre: 'Osquillar', equipo: 'la makina',               biwengerId: 13949428 },
  { nombre: 'Javi',      equipo: 'Bayer de Los Caídos FC',  biwengerId: 13955595 },
  { nombre: 'Borja',     equipo: 'MouTeam',                   biwengerId: 13975535 },
  { nombre: 'Alvaro',    equipo: 'DIEGO ARMANDO MARADONA',  biwengerId: 13965613 },
];

function loadCredentials() {
  if (process.env.BIWENGER_EMAIL && process.env.BIWENGER_PASSWORD) {
    return { email: process.env.BIWENGER_EMAIL, password: process.env.BIWENGER_PASSWORD };
  }
  if (existsSync(CREDENTIALS_FILE)) return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'));
  return null;
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Login fallido (${res.status}): ${await res.text()}`);
  return (await res.json()).token;
}

async function main() {
  const creds = loadCredentials();
  if (!creds) { console.error('❌ No hay credenciales.'); process.exit(1); }

  const token = await login(creds.email, creds.password);
  const account = await (await fetch(`${BASE}/account`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })).json();
  const liga = account.data.leagues.find(l => l.id === LEAGUE_ID);
  if (!liga) throw new Error('Liga no encontrada');

  const uid = liga.user.id;
  const h = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'X-League': String(LEAGUE_ID),
    'X-User': String(uid),
    'Origin': 'https://biwenger.as.com',
    'Referer': 'https://biwenger.as.com/',
  };

  const cal = (await (await fetch(`${BASE}/rounds/la-liga`, { headers: h })).json()).data;
  console.log(`📅 Temporada ${cal.season.name}`);
  const calMatch = (cal.name || '').match(/(\d+)/);
  const jornadaActualNum = calMatch ? parseInt(calMatch[1], 10) : null;

  // Precalcular posiciones de jugadores (para sustituciones)
  const pd = await (await fetch(`${CF}/competitions/la-liga/data?lang=es&score=5`, { headers: h })).json();
  const playerPos = {}; for (const [id, p] of Object.entries(pd.data.players)) playerPos[id] = p.position;

  const matrix = Array.from({ length: NUM_PLAYERS }, () => Array(NUM_JORNADAS).fill(null));
  const motivos = {};
  const filled = [];

  for (const rd of cal.season.rounds) {
    const m = rd.name.match(/^Round (\d+)/);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (num < 1 || num > NUM_JORNADAS) continue;
    if (filled.includes(num)) continue;

    // Estado: solo si todos sus partidos terminaron
    const rr = await (await fetch(`${BASE}/rounds/la-liga/${rd.id}`, { headers: h })).json();
    const rddata = rr.data;
    if (!rddata || !rddata.games) continue;
    const todosAcabados = rddata.games.length > 0 && rddata.games.every(g => g.status === 'finished');
    if (!todosAcabados) {
      // Guardar el motivo de la jornada sin puntuar (solo rondas ya arrancadas).
      if (num <= jornadaActualNum) {
        const motivo = motivoRonda(rddata.games);
        if (motivo) motivos[num] = motivo;
      }
      continue;
    }

    // Intentar vía API (posición oficial ya publicada)
    const rl = await (await fetch(`${BASE}/rounds/league/${rd.id}`, { headers: h })).json();
    const standings = rl.data?.league?.standings;
    if (!standings) continue;
    const conPos = standings.filter(u => u.lineup?.position != null);
    let assigned = false;
    if (conPos.length === NUM_PLAYERS) {
      for (const u of conPos) {
        const pi = PLAYERS.findIndex(p => p.biwengerId === u.id);
        if (pi !== -1) matrix[pi][num - 1] = u.lineup.position;
      }
      filled.push(num);
      console.log(`   - J${num}: ✓ por API`);
      assigned = true;
    }

    // Si la API no la da aún, calculamos con reports
    if (!assigned) {
      try {
        const rrep = await (await fetch(`${CF}/rounds/la-liga/${rd.id}?score=5&lang=es&v=631`, { headers: h })).json();
        const pts = {}; const gol = {};
        for (const g of rrep.data.games) for (const s of [g.home, g.away]) for (const rep of (s.reports||[])) {
          pts[rep.player.id] = rep.points;
          if (JSON.stringify(rep).toLowerCase().includes('\"gol\"')) gol[rep.player.id] = true;
        }
        // Calcular pts de cada manager
        const calc = standings.map(u => {
          const lu = u.lineup || {};
          const players = lu.players || [], reserves = lu.reserves || [];
          const played = players.filter(pid => pts[pid] !== undefined);
          let total = played.reduce((a, pid) => a + pts[pid], 0);
          const free = players.filter(pid => pts[pid] === undefined);
          for (const pid of free) {
            const ppos = playerPos[pid];
            const sub = reserves.find(rr => rr && playerPos[rr] === ppos && pts[rr] !== undefined);
            if (sub) total += pts[sub];
          }
          const ariete = lu.striker && lu.striker.id;
          if (ariete && gol[ariete]) total += 3;
          return total;
        });
        // Ordenar por pts desc -> asignar posiciones 1..14
        const ranked = standings.slice().sort((a, b) => calc(b) - calc(a)).map((u, i) => { const pi = PLAYERS.findIndex(p => p.biwengerId === u.id); if (pi!==-1) matrix[pi][num-1] = i+1; });
        filled.push(num);
        console.log(`   - J${num}: ✓ calculado (${rd.id})`);
      } catch (e) {
        console.log(`   - J${num}: error cálculo → ${e.message}`);
      }
    }
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(matrix, null, 2));
  writeFileSync(ESTADO_FILE, JSON.stringify(motivos, null, 2));
  console.log(`\n✔ ${filled.length} jornadas rellenadas → ${OUTPUT_FILE}`);
  console.log(`✔ ${Object.keys(motivos).length} motivos de jornadas sin puntuar → ${ESTADO_FILE}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });