import { ensure, text } from '../utils/errors.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

export function authController(usuarios, auth) {
  return {
    async login(req, res) {
      const email = text(req.body.email, 'E-mail', 3, 190).toLowerCase();
      const password = text(req.body.senha, 'Senha', 1, 128);
      const user = await usuarios.byEmail(email);
      ensure(user && await verifyPassword(password, user.senha), 'E-mail ou senha incorretos.', 401);
      auth.create(req, res, user);
      res.json(await usuarios.find(user.id));
    },
    async register(req, res) {
      const nome = text(req.body.nome, 'Nome', 2, 120);
      const email = text(req.body.email, 'E-mail', 3, 190).toLowerCase();
      ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Informe um e-mail válido.');
      const password = text(req.body.senha, 'Senha', 8, 128);
      const telefone = text(req.body.telefone || '', 'Telefone', 0, 24);
      ensure(!telefone || telefone.replace(/\D/g, '').length >= 10, 'Informe um telefone válido com DDD.');
      ensure(!await usuarios.byEmail(email), 'Este e-mail já está cadastrado.', 409);
      const user = await usuarios.create({ nome, email, senha: await hashPassword(password), telefone });
      auth.create(req, res, user);
      res.status(201).json(user);
    },
    async profile(req, res) {
      const nome = text(req.body.nome, 'Nome', 2, 120);
      const telefone = text(req.body.telefone || '', 'Telefone', 0, 24);
      ensure(!telefone || telefone.replace(/\D/g, '').length >= 10, 'Informe um telefone válido com DDD.');
      res.json(await usuarios.update(req.user.id, { nome, telefone }));
    },
  };
}
