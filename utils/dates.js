import { ensure } from './errors.js';

// O estabelecimento funciona no fuso de São Paulo, independentemente do servidor.
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function validateDate(value) {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Informe uma data válida.');
  const date = new Date(`${value}T12:00:00Z`);
  ensure(!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value, 'Informe uma data válida.');
  return value;
}

export function minutes(value) {
  ensure(typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Horário inválido.');
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function hasStarted(date, time) {
  return new Date(`${date}T${time}:00-03:00`).valueOf() <= Date.now();
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
