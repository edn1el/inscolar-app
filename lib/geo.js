// HU021: ubicación de las instituciones en el mapa y filtro por cercanía.
//
// Si el administrador marcó el punto exacto en el formulario, se usa ese punto
// (ubicacionExacta). Si no, se ubica en el centro de su municipio (o la capital de
// su provincia), con un pequeño desplazamiento determinístico para que varias
// instituciones del mismo municipio no queden encimadas.
const MUNICIPIOS_COORDS = require('./municipios-coords');

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

// Asigna coordenadas aproximadas a una institución que no tiene su punto exacto:
// el centro de su municipio (o, si no se conoce, la capital de su provincia).
// seedIndex debe ser estable (p.ej. el índice de creación) para que la
// institución siempre caiga en el mismo punto entre ejecuciones.
function coordsForInstitution(institution, seedIndex) {
  const muni = (MUNICIPIOS_COORDS[institution.provincia] || {})[institution.municipio];
  const base = muni || PROVINCE_COORDS[institution.provincia] || PROVINCE_COORDS['Distrito Nacional'];
  const [dLat, dLng] = jitterFor(seedIndex);
  // Dentro de un municipio el desplazamiento es menor (~0.5-0.9 km) que a escala de provincia.
  const k = muni ? 0.35 : 1;
  return { lat: base[0] + dLat * k, lng: base[1] + dLng * k };
}

// Límites de República Dominicana para validar un punto marcado a mano.
function dentroDeRD(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)
    && lat >= 17.3 && lat <= 20.1 && lng >= -72.1 && lng <= -68.2;
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

module.exports = { PROVINCE_COORDS, coordsForInstitution, dentroDeRD, haversineKm };
