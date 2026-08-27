function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length >= 10 && v.length <= 80;
}

function passwordRules(pw, { min = 8, max = 15 } = {}) {
  const errors = [];
  if (typeof pw !== 'string' || pw.length < min || pw.length > max) {
    errors.push(`Debe tener entre ${min} y ${max} caracteres.`);
  }
  if (!/[a-zA-Z]/.test(pw || '') || !/[0-9]/.test(pw || '')) {
    errors.push('Debe ser alfanumérica (letras y números).');
  }
  if (!/[0-9]/.test(pw || '')) {
    errors.push('Debe contener al menos un número.');
  }
  return errors;
}

function isCedula(v) {
  return typeof v === 'string' && /^[0-9]{11}$/.test(v);
}

function isPhoneDigits(v, len = 10) {
  return typeof v === 'string' && new RegExp(`^[0-9]{${len}}$`).test(v);
}

function formatPhoneDO(digits10) {
  if (!isPhoneDigits(digits10, 10)) return digits10;
  return `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`;
}

module.exports = { isEmail, passwordRules, isCedula, isPhoneDigits, formatPhoneDO };
