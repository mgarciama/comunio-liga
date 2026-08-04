export async function onRequest({ env }) {
  return Response.json({ ok: true, hasToken: !!env.GITHUB_TOKEN });
}
