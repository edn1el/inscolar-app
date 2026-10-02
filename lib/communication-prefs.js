// HU062/HU066: trámite, documentos, citas y los tipos nombrados por las historias.
const TYPES = {
  enrollment: 'Cambios de estado de inscripción', documents: 'Revisión de documentos',
  appointments: 'Cambios de estado de citas', reminders: 'Recordatorios',
  maintenance: 'Mantenimiento de la página', accounts: 'Cambios de cuentas administrativas',
};
function preferences(user) {
  return Object.fromEntries(Object.keys(TYPES).map(k => [k, typeof user.communicationPreferences?.[k] === 'boolean' ? user.communicationPreferences[k] : user.notifyByEmail !== false]));
}
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.entries(value).some(([k,v]) => !Object.hasOwn(TYPES,k) || typeof v !== 'boolean')) {
    throw Object.assign(new Error('Envía preferencias válidas por tipo de correo.'), {status:400});
  }
  return value;
}
module.exports = { TYPES, preferences, validate };
