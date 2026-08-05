export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // GET: leer todos los datos
    if (request.method === 'GET') {
      const jornadas = await env.COMUNIO.get('jornadas');
      const pagos = await env.COMUNIO.get('pagos');
      return new Response(JSON.stringify({
        jornadas: jornadas ? JSON.parse(jornadas) : null,
        pagos: pagos ? JSON.parse(pagos) : null
      }), { headers });
    }

    // POST: guardar datos
    if (request.method === 'POST') {
      try {
        const { jornadas, pagos } = await request.json();
        if (jornadas) await env.COMUNIO.put('jornadas', JSON.stringify(jornadas));
        if (pagos) await env.COMUNIO.put('pagos', JSON.stringify(pagos));
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
      }
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers });
  }
};