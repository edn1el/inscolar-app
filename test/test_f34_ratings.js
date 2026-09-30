const http = require('http');

function parseCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return raw.split(';')[0];
}

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {}
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    if (cookie) {
      opts.headers['Cookie'] = cookie;
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null, setCookie: res.headers['set-cookie'] });
        } catch(e) {
          resolve({ status: res.statusCode, body: data, setCookie: res.headers['set-cookie'] });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const login = async (email) => {
    const res = await request('POST', '/api/auth/login', { email, password: 'Inscolar#2026' });
    return parseCookie(res.setCookie);
  };

  const results = [];
  const report = (name, passed, detail) => results.push({ name, passed, detail });

  try {
    const tokenAna = await login('ana.beltre@correo.do'); // Tutor con relacion a i002
    const tokenJuan = await login('rosa.almonte@correo.do'); // Otro tutor
    
    // 1. Usuario sin sesión
    let res = await request('POST', '/api/institutions/i002/ratings', { estrellas: 5 });
    report('Usuario sin sesión', res.status === 401, 'Status ' + res.status);

    // 2. Primera calificación (Ana a i002, 5 estrellas)
    res = await request('POST', '/api/institutions/i002/ratings', { estrellas: 5, comentario: 'Excelente' }, tokenAna);
    let passed = res.status === 200 && res.body.rating.estrellas === 5;
    report('Primera calificación (5 estrellas)', passed, 'Status ' + res.status);

    // 3. Edición (Ana cambia a 1 estrella)
    res = await request('POST', '/api/institutions/i002/ratings', { estrellas: 1, comentario: 'Pésimo' }, tokenAna);
    passed = res.status === 200 && res.body.rating.estrellas === 1 && res.body.rating.comentario === 'Pésimo';
    report('Edición de calificación (1 estrella)', passed, 'Status ' + res.status);

    // 4. Verificar que no se duplicó y que el promedio se actualizó
    res = await request('GET', '/api/institutions/i002/ratings', null, tokenAna);
    let total = res.body.total;
    let promedio = res.body.promedio;
    report('Verificar conteo y promedio post-edición', total === 1 && promedio === 1, `Total: ${total}, Promedio: ${promedio}`);

    // 5. Extremos (estrellas = 0 y estrellas = 6) -> error 400
    res = await request('POST', '/api/institutions/i002/ratings', { estrellas: 6 }, tokenAna);
    let res2 = await request('POST', '/api/institutions/i002/ratings', { estrellas: 0 }, tokenAna);
    report('Validación de extremos 1 y 5', res.status === 400 && res2.status === 400, `Statuses: ${res.status}, ${res2.status}`);

    // 6. Otro Tutor sin relación o con relación (intentar calificar)
    // Rosa no tiene inscripción en i002
    res = await request('POST', '/api/institutions/i002/ratings', { estrellas: 3 }, tokenJuan);
    report('Otro tutor sin relación a i002', res.status === 403, 'Status ' + res.status);

    // 7. Institución inactiva / Error API
    res = await request('POST', '/api/institutions/i999/ratings', { estrellas: 3 }, tokenAna);

    report('Institución inexistente (Error API)', res.status === 404, 'Status ' + res.status);

    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error(e);
  }
}
run();
