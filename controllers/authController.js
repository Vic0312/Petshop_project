import { ensure, text } from '../utils/errors.js';
import { hashPassword, verifyPassword, passwordText } from '../utils/password.js';
import { userFields } from '../utils/userValidation.js';

export function authController(usuarios, auth) {
  return {
    async login(req, res) {
      const email = text(req.body.email, 'E-mail', 3, 190).toLowerCase();
      const password = passwordText(req.body.senha, 'Senha', 1);
      const user = await usuarios.byEmail(email);
      ensure(user && await verifyPassword(password, user.senha), 'E-mail ou senha incorretos.', 401);
      auth.create(req, res, user);
      res.json(await usuarios.find(user.id));
    },
    async register(req, res) {
      const { nome, email, telefone } = userFields(req.body);
      const password = passwordText(req.body.senha);
      ensure(!await usuarios.byEmail(email), 'Este e-mail já está cadastrado.', 409);
      const user = await usuarios.create({ nome, email, senha: await hashPassword(password), telefone });
      auth.create(req, res, user);
      res.status(201).json(user);
    },
    async profile(req, res) {
      const current = await usuarios.credentials(req.user.id);
      ensure(current, 'Conta não encontrada.', 404);
      const changes = userFields(req.body, current.email);
      const changeEmail = changes.email !== current.email;
      const changePassword = [req.body.nova_senha, req.body.confirmacao_senha].some(value => value !== undefined && value !== '');
      if (changePassword) {
        const password = passwordText(req.body.nova_senha, 'Nova senha');
        ensure(password === req.body.confirmacao_senha, 'A confirmação deve ser igual à nova senha.');
      }
      if (changeEmail || changePassword) {
        const currentPassword = passwordText(req.body.senha_atual, 'Senha atual', 1);
        ensure(await verifyPassword(currentPassword, current.senha), 'Senha atual incorreta.');
      }
      if (changeEmail) ensure(!await usuarios.byEmail(changes.email), 'Este e-mail já está cadastrado.', 409);
      if (changePassword) changes.senha = await hashPassword(req.body.nova_senha);
      const updated = await usuarios.update(req.user.id, changes, current);
      ensure(updated, 'Seu perfil foi alterado em outra sessão. Atualize a página e tente novamente.', 409);
      if (changeEmail || changePassword) { auth.invalidateUser(req.user.id); auth.create(req, res, updated); }
      res.json(updated);
    },
  };
}
