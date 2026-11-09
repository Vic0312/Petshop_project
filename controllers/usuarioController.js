import { ensure } from '../utils/errors.js';
import { userFields } from '../utils/userValidation.js';
import { hashPassword, passwordText } from '../utils/password.js';

export function usuarioController(usuarios) {
  return {
    async list(req, res) { res.json(await usuarios.list()); },
    async create(req, res) {
      const fields = userFields(req.body);
      const { tipo } = req.body;
      ensure(['admin', 'cliente'].includes(tipo), 'Escolha o perfil Cliente ou Administrador.');
      const password = passwordText(req.body.senha);
      ensure(password === req.body.confirmacao_senha, 'A confirmação deve ser igual à senha inicial.');
      ensure(!await usuarios.byEmail(fields.email), 'Este e-mail já está cadastrado.', 409);
      const created = await usuarios.create({ ...fields, senha: await hashPassword(password) }, tipo);
      res.status(201).json(created);
    },
  };
}
