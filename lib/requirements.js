const DEFAULTS = ['Acta de nacimiento', 'Cédula o identificación del tutor', 'Certificado de notas', 'Foto 2x2', 'Otro'];
function requirements(list, grade = '') {
  const level = grade.includes('Secundaria') ? 'Secundaria' : grade.includes('Primaria') ? 'Primaria' : 'Inicial';
  return (Array.isArray(list) && list.length ? list : DEFAULTS).filter(r => !r.niveles || r.niveles.includes(level)).map(r => ({ tipo: typeof r === 'string' ? r : r.nombre || r.tipo, formatos: r.formatos || ['PDF', 'JPG', 'PNG'], maxSizeMB: Number(r.maxMb || r.maxSizeMB || 5) }));
}
module.exports = { requirements };
