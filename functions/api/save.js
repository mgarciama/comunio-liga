export async function onRequestPost({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN;
  const REPO = 'mgarciama/comunio-liga';

  if (!TOKEN) {
    return Response.json({ error: 'GITHUB_TOKEN no configurado en Cloudflare' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { jornadas, pagos } = body;

    const files = [
      { path: 'jornadas-data.json', content: jornadas },
      { path: 'pagos-data.json', content: pagos },
    ];

    for (const file of files) {
      const encoded = btoa(JSON.stringify(file.content, null, 2));
      const url = `https://api.github.com/repos/${REPO}/contents/${file.path}`;

      // Get current SHA
      let sha = null;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'cloudflare-pages' } });
        if (r.ok) sha = (await r.json()).sha;
      } catch {}

      const ghBody = { message: `Update ${file.path}`, content: encoded };
      if (sha) ghBody.sha = sha;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'cloudflare-pages',
        },
        body: JSON.stringify(ghBody),
      });

      if (!res.ok) {
        const err = await res.json();
        return Response.json({ error: `${file.path}: ${err.message}` }, { status: 500 });
      }
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
