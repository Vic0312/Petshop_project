export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function ensure(condition, message, status = 400) {
  if (!condition) throw new AppError(message, status);
}

export function text(value, label, min = 1, max = 160) {
  ensure(typeof value === 'string', `${label} é obrigatório.`);
  const clean = value.trim();
  ensure(clean.length >= min && clean.length <= max, `${label} deve ter entre ${min} e ${max} caracteres.`);
  return clean;
}

export function id(value) {
  ensure(typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value), 'Identificador inválido.');
  return value.toLowerCase();
}
