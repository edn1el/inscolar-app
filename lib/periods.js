// Helpers para validar los periodos configurables de un ciclo escolar
// (inscripcion, envio de documentos, agendar citas) para una institucion.
// Si una institucion no tiene ningun periodo configurado para ese
// ciclo/tipo, no se aplica ninguna restriccion (compatibilidad con los
// datos existentes, que no tenian este concepto).

function findPeriod(db, institucionId, cicloEscolar) {
  return (db.periods || []).find((p) => p.institucionId === institucionId && p.cicloEscolar === cicloEscolar) || null;
}

function withinRange(range, when) {
  if (!range || !range.desde || !range.hasta) return true;
  const w = when || new Date();
  const hasta = new Date(range.hasta);

  return w >= new Date(range.desde) && w <= hasta;
}

// Estado del periodo para agendar citas de una institucion: si nunca se
// configuro ninguno, no hay restriccion; si se configuro al menos uno mas
// nunca para el ciclo actual, hay que estar dentro de una ventana activa.
function citasPeriodStatus(db, institucionId, when) {
  const w = when || new Date();
  const configured = (db.periods || []).filter((p) => p.institucionId === institucionId && p.citas && p.citas.desde && p.citas.hasta);
  if (!configured.length) return { hasConfig: false, active: null };
  const active = configured.find((p) => withinRange(p.citas, w));
  return { hasConfig: true, active: active || null };
}

function documentosRequeridosPara(db, institucionId, cicloEscolar, fallback) {
  const period = findPeriod(db, institucionId, cicloEscolar);
  if (period && Array.isArray(period.documentosRequeridos) && period.documentosRequeridos.length) return period.documentosRequeridos;
  return fallback;
}

module.exports = { findPeriod, withinRange, citasPeriodStatus, documentosRequeridosPara };
