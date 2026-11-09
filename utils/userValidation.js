import { ensure, text } from './errors.js';

export function validEmail(value) {
  const email = text(value, 'E-mail', 3, 190).toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Informe um e-mail válido.');
  return email;
}

export function userFields(body, fallbackEmail) {
  const nome = text(body.nome, 'Nome', 2, 120);
  const email = validEmail(body.email ?? fallbackEmail);
  const telefone = text(body.telefone || '', 'Telefone', 0, 24);
  ensure(!telefone || telefone.replace(/\D/g, '').length >= 10, 'Informe um telefone válido com DDD.');
  return { nome, email, telefone };
}
