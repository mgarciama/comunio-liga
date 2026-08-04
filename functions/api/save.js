export async function onRequestPost({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN;
  const REPO = 'mgarciama/comunio-liga';

  if (!TOKEN) {
    return new Response(JSON.stringify({ error: 'Token no configurado en Cloudflare' }), { status: 500 });
  }

  try {
    const { jornadas, pagos } = await request.json();

    const files = [
      { path: 'jornadas-data.json', content: jornadas },
      { path: 'pagos-data.json', content: pagos },
    ];

    for (const file of files) {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(file.content, null, 2))));
      const url = `https://api.github.com/repos/${REPO}/contents/${file.path}`;

      // Get current SHA
      let sha = null;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
        if (r.ok) sha = (await r.json()).sha;
      } catch {}

      const body = { message: `Update ${file.path}`, content: encoded };
      if (sha) body.sha = sha;

      const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'cloudflare-pages' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        return new Response(JSON.stringify({ error: `${file.path}: ${err.message || res.status}` }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
