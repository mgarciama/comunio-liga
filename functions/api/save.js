export async function onRequestPost({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN;
  const REPO = 'mgarciama/comunio-liga';

  if (!TOKEN) {
    return Response.json({ error: 'GITHUB_TOKEN no configurado' }, { status: 500 });
  }

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  try {
    const body = await request.json();
    const files = [
      { path: 'jornadas-data.json', data: body.jornadas },
      { path: 'pagos-data.json', data: body.pagos },
    ];

    for (const file of files) {
      const encoded = toBase64(JSON.stringify(file.data, null, 2));
      const url = `https://api.github.com/repos/${REPO}/contents/${file.path}`;
      const authHeaders = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'cloudflare' };

      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        // Get latest SHA every attempt
        let sha = null;
        try {
          const getRes = await fetch(url, { headers: authHeaders });
          if (getRes.ok) sha = (await getRes.json()).sha;
        } catch (e) {}

        const ghBody = { message: `Update ${file.path}`, content: encoded };
        if (sha) ghBody.sha = sha;

        const putRes = await fetch(url, {
          method: 'PUT',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(ghBody),
        });

        if (putRes.ok) { ok = true; break; }

        const err = await putRes.json();
        if (putRes.status === 422 || putRes.status === 409) {
          // SHA conflict - wait and retry
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        return Response.json({ error: `${file.path}: ${err.message}` }, { status: 500 });
      }
      if (!ok) return Response.json({ error: `${file.path}: conflicto tras 3 intentos` }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
