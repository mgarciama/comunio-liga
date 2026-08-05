export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // GET: leer
    if (request.method === 'GET') {
      const jornadas = await env.COMUNIO.get('jornadas');
      const pagos = await env.COMUNIO.get('pagos');
      return Response.json({
        jornadas: jornadas ? JSON.parse(jornadas) : null,
        pagos: pagos ? JSON.parse(pagos) : null
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
  }
};