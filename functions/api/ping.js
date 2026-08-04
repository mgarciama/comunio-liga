export async function onRequest({ env }) {
  return new Response(JSON.stringify({ 
    ok: true, 
    hasToken: !!env.GITHUB_TOKEN
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
