export async function onRequestPost({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN;
  const REPO = 'mgarciama/comunio-liga';

  if (!TOKEN) {
    return Response.json({ error: 'GITHUB_TOKEN no configurado' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { jornadas, pagos } = body;

    const files = [
      { path: 'jornadas-data.json', content: jornadas },
      { path: 'pagos-data.json', content: pagos },
    ];

    function toBase64(str) {
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    for (const file of files) {
      const encoded = toBase64(JSON.stringify(file.content, null, 2));
      const url = `https://api.github.com/repos/${REPO}/contents/${file.path}`;

      let sha = null;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'cloudflare' } });
        if (r.ok) sha = (await r.json()).sha;
      } catch {}

      const ghBody = { message: `Update ${file.path}`, content: encoded };
      if (sha) ghBody.sha = sha;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'cloudflare',
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
