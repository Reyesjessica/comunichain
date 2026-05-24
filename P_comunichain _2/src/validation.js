function validateString(val, fieldName, { required = true, minLength = 1, maxLength = 500 } = {}) {
  if (!required && (val === undefined || val === null || val === '')) return null;
  if (required && (val === undefined || val === null || val === '')) return `${fieldName} es requerido`;
  if (typeof val !== 'string') return `${fieldName} debe ser texto`;
  val = val.trim();
  if (required && val.length < minLength) return `${fieldName} debe tener al menos ${minLength} carácter(es)`;
  if (val.length > maxLength) return `${fieldName} debe tener máximo ${maxLength} caracteres`;
  return null;
}

function validateNumber(val, fieldName, { required = true, min, max } = {}) {
  if (!required && (val === undefined || val === null || val === '')) return null;
  if (required && (val === undefined || val === null || val === '')) return `${fieldName} es requerido`;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return `${fieldName} debe ser un número válido`;
  if (min !== undefined && num < min) return `${fieldName} debe ser mayor o igual a ${min}`;
  if (max !== undefined && num > max) return `${fieldName} debe ser menor o igual a ${max}`;
  return num;
}

function validateErrors(validations) {
  const errors = validations.filter(r => r !== null);
  if (errors.length > 0) return errors[0];
  return null;
}

function validateComunidad(body) {
  const nombre = validateString(body.nombre, 'Nombre de la comunidad', { maxLength: 200 });
  if (nombre) return nombre;
  const dir = validateString(body.direccion, 'Dirección', { required: false, maxLength: 300 });
  if (dir) return dir;
  const desc = validateString(body.descripcion, 'Descripción', { required: false, maxLength: 2000 });
  if (desc) return desc;
  const rep = validateString(body.representante, 'Representante', { required: false, maxLength: 200 });
  if (rep) return rep;
  const tel = validateString(body.telefono, 'Teléfono', { required: false, maxLength: 50 });
  if (tel) return tel;
  if (body.telefono && !/^[\d\s+\-()]*$/.test(body.telefono.trim())) return 'Teléfono solo debe contener números';
  return null;
}

function validateProyecto(body) {
  const nombre = validateString(body.nombre, 'Nombre del proyecto', { maxLength: 200 });
  if (nombre) return nombre;
  const lugar = validateString(body.lugar, 'Lugar', { maxLength: 300 });
  if (lugar) return lugar;
  const desc = validateString(body.descripcion, 'Descripción', { maxLength: 5000 });
  if (desc) return desc;
  const obj = validateString(body.objetivo, 'Objetivo', { maxLength: 2000 });
  if (obj) return obj;
  const fondeo = validateNumber(body.fondeoRequerido, 'Fondeo requerido', { min: 0.01 });
  if (typeof fondeo === 'string') return fondeo;
  return null;
}

function validateAvance(body) {
  const desc = validateString(body.descripcion, 'Descripción del avance', { required: false, maxLength: 5000 });
  if (desc) return desc;
  return null;
}

function validateFondeo(body) {
  if (!body.proyectoId) return 'ID del proyecto requerido';
  const monto = validateNumber(body.monto, 'Monto', { min: 0.01 });
  if (typeof monto === 'string') return monto;
  const desc = validateString(body.descripcion, 'Descripción', { required: false, maxLength: 500 });
  if (desc) return desc;
  return null;
}

module.exports = {
  validateString,
  validateNumber,
  validateErrors,
  validateComunidad,
  validateProyecto,
  validateAvance,
  validateFondeo
};
