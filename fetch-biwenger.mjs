import { writeFileSync, readFileSync, existsSync } from 'fs';

const BASE = 'https://biwenger.as.com/api/v2';
const CREDENTIALS_FILE = '.biwenger-credentials.json';
const OUTPUT_FILE = 'biwenger-data.json';
const LEAGUE_ID = 530044;

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
  if (!creds) {
    console.error('❌ No hay credenciales.');
    console.error('   Crea .biwenger-credentials.json con {"email":"...","password":"..."}');
    process.exit(1);
  }

  console.log('🔑 Logeando en Biwenger...');
  const token = await login(creds.email, creds.password);
  console.log('✅ Login OK');

  const accountRes = await fetch(`${BASE}/account`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const account = await accountRes.json();
  const liga = account.data.leagues.find(l => l.id === LEAGUE_ID);

  if (!liga) {
    console.error('❌ Liga no encontrada');
    process.exit(1);
  }

  const leagueUserId = liga.user.id;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'X-League': String(LEAGUE_ID),
    'X-User': String(leagueUserId),
  };

  console.log(`📡 Liga: "${liga.name}"`);

  const leagueRes = await fetch(`${BASE}/league?fields=standings,users`, { headers });
  const leagueData = await leagueRes.json();

  const standings = (leagueData.data.standings || []).map(s => ({
    position: s.position,
    name: s.name,
    points: s.points,
    icon: s.icon ? 'https://cdn.biwenger.com/' + s.icon : null,
    id: s.id,
  }));

  const output = {
    updatedAt: new Date().toISOString(),
    league: {
      name: liga.name,
      id: LEAGUE_ID,
      competition: liga.competition,
      type: liga.type,
    },
    standings,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`✅ ${standings.length} equipos guardados en ${OUTPUT_FILE}`);

  console.log('\n📊 Clasificación:');
  standings.forEach(s =>
    console.log(`  ${String(s.position).padStart(2)}. ${s.name.padEnd(30)} ${String(s.points).padStart(5)} pts`)
  );
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
