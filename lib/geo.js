// HU021: filtrar/ordenar instituciones por la ubicación actual del dispositivo.
//
// El prototipo no cuenta con direcciones geocodificadas para cada institución,
// asi que se usa la coordenada aproximada de la capital de su provincia como
// una aproximación razonable, mas un pequeño desplazamiento deterministico
// (no aleatorio, para que los datos de prueba sean reproducibles) para que
// varias instituciones de la misma provincia no queden exactamente en el
// mismo punto.
const PROVINCE_COORDS = {
  'Azua': [18.4539, -70.7359],
  'Bahoruco': [18.4864, -71.4241],
  'Barahona': [18.2085, -71.1009],
  'Dajabón': [19.5497, -71.7010],
  'Distrito Nacional': [18.4861, -69.9312],
  'Duarte': [19.3008, -70.2540],
  'Elías Piña': [18.8710, -71.6947],
  'El Seibo': [18.7670, -69.0389],
  'Espaillat': [19.3966, -70.5268],
  'Hato Mayor': [18.7667, -69.2500],
  'Hermanas Mirabal': [19.3833, -70.4167],
  'Independencia': [18.4930, -71.8520],
  'La Altagracia': [18.6147, -68.7079],
  'La Romana': [18.4273, -68.9728],
  'La Vega': [19.2222, -70.5292],
  'María Trinidad Sánchez': [19.3831, -69.8464],
  'Monseñor Nouel': [18.9425, -70.4084],
  'Monte Cristi': [19.8494, -71.6511],
  'Monte Plata': [18.8083, -69.7833],
  'Pedernales': [18.0384, -71.7439],
  'Peravia': [18.2794, -70.3311],
  'Puerto Plata': [19.7934, -70.6884],
  'Samaná': [19.2058, -69.3364],
  'San Cristóbal': [18.4167, -70.1000],
  'San José de Ocoa': [18.5442, -70.5058],
  'San Juan': [18.8058, -71.2306],
  'San Pedro de Macorís': [18.4539, -69.3082],
  'Sánchez Ramírez': [19.0553, -70.1533],
  'Santiago': [19.4517, -70.6970],
  'Santiago Rodríguez': [19.4939, -71.3358],
  'Santo Domingo': [18.5000, -69.9000],
  'Valverde': [19.5539, -71.0781],
};

function jitterFor(seedIndex) {
  const i = Number(seedIndex) || 0;
  const angle = (i * 47) % 360;
  const rad = (angle * Math.PI) / 180;
  const dist = 0.015 + ((i * 13) % 10) * 0.001; // aprox. 1.5-2.5 km de desplazamiento
  return [Math.cos(rad) * dist, Math.sin(rad) * dist];
}

// Asigna coordenadas aproximadas a una institución a partir de su provincia.
// seedIndex debe ser estable (p.ej. el índice de creación) para que la
// institución siempre caiga en el mismo punto entre ejecuciones.
function coordsForInstitution(institution, seedIndex) {
  const base = PROVINCE_COORDS[institution.provincia] || PROVINCE_COORDS['Distrito Nacional'];
  const [dLat, dLng] = jitterFor(seedIndex);
  return { lat: base[0] + dLat, lng: base[1] + dLng };
}

// Distancia en kilómetros entre dos coordenadas (fórmula de Haversine).
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { PROVINCE_COORDS, coordsForInstitution, haversineKm };
