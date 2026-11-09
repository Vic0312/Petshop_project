import { ensure, text, id } from '../utils/errors.js';
import { today, validateDate, minutes, hasStarted, shiftDate } from '../utils/dates.js';
import { isUploadedPhoto } from '../utils/photoStorage.js';

export function petshopController(db, models, photos) {
  const { animais, servicos, agendamentos, horarios, usuarios, atendimentos } = models;
  async function available(date, serviceId, excludeId) {
    validateDate(date);
    ensure(date >= today() && date <= shiftDate(today(), 180), 'Escolha uma data entre hoje e os próximos 180 dias.');
    const service = await servicos.find(id(serviceId));
    ensure(service && service.ativo, 'Serviço indisponível.', 404);
    const window = await horarios.day(new Date(`${date}T12:00:00Z`).getUTCDay());
    if (!window?.ativo) return [];
    const busy = (await agendamentos.busy(date)).filter(item => item.id !== excludeId);
    const slots = [];
    for (let time = minutes(window.inicio); time + service.duracao <= minutes(window.fim); time += 30) {
      const formatted = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
      if (!hasStarted(date, formatted) && !busy.some(item => time < minutes(item.horario) + item.duracao && time + service.duracao > minutes(item.horario))) slots.push(formatted);
    }
    return slots;
  }
  return {
    async dashboard(req, res) {
      const admin = req.user.tipo === 'admin';
      res.json({ user: req.user, animais: await animais.list(req.user), servicos: await servicos.list(admin), agendamentos: await agendamentos.list(req.user), horarios: await horarios.list(), clientes: admin ? await usuarios.clients() : [] });
    },
    async saveAnimal(req, res) {
      const animalId = req.params.id ? id(req.params.id) : null;
      const saved = await db.exclusive(async () => {
        const animal = animalId ? await animais.find(animalId) : null;
        if (animalId) ensure(animal && animal.usuario_id === req.user.id, 'Animal não encontrado.', 404);
        ensure(req.user.tipo === 'cliente', 'Cadastros de animais são feitos pelo tutor.', 403);
        const { especie, porte } = req.body;
        ensure(['Cachorro', 'Gato', 'Outro'].includes(especie), 'Escolha uma espécie válida.');
        ensure(['Pequeno', 'Médio', 'Grande'].includes(porte), 'Escolha um porte válido.');
        const idade = Number(req.body.idade);
        ensure(req.body.idade !== '' && req.body.idade != null && Number.isInteger(idade) && idade >= 0 && idade <= 40, 'A idade deve ser um número inteiro entre 0 e 40 anos.');
        const removePhoto = req.body.remover_foto === true || req.body.remover_foto === 'true';
        const fallback = especie === 'Gato' ? 'cat' : animal?.foto === 'golden' && especie === 'Cachorro' ? 'golden' : 'dog';
        const data = { nome: text(req.body.nome, 'Nome do animal', 1, 80), especie, porte, idade, raca: text(req.body.raca || 'Sem raça definida', 'Raça', 1, 80), observacoes: text(req.body.observacoes || '', 'Observações', 0, 1000), foto: !removePhoto && isUploadedPhoto(animal?.foto) ? animal.foto : fallback };
        let uploaded;
        try {
          if (req.file) { uploaded = await photos.save(req.file); data.foto = uploaded; }
          const result = await animais.save(data, req.user.id, animalId);
          ensure(result, 'Animal não encontrado.', 404);
          if (animal?.foto !== result.foto) await photos.remove(animal?.foto);
          return result;
        } catch (error) {
          if (uploaded) await photos.remove(uploaded);
          throw error;
        }
      });
      res.status(animalId ? 200 : 201).json(saved);
    },
    async animalPhoto(req, res) {
      ensure(isUploadedPhoto(req.params.filename), 'Foto não encontrada.', 404);
      const animal = await animais.byPhoto(req.params.filename);
      ensure(animal && (req.user.tipo === 'admin' || animal.usuario_id === req.user.id), 'Foto não encontrada.', 404);
      res.type('image/webp');
      res.sendFile(photos.path(req.params.filename), { dotfiles: 'allow' }, error => {
        if (!error) return;
        if ((error.code === 'ENOENT' || error.status === 404) && !res.headersSent) return res.status(404).json({ message: 'Foto não encontrada.' });
        if (!res.headersSent) res.status(500).json({ message: 'Não foi possível carregar a foto.' });
      });
    },
    async saveService(req, res) {
      const serviceId = req.params.id ? id(req.params.id) : null;
      if (serviceId) ensure(await servicos.find(serviceId), 'Serviço não encontrado.', 404);
      const preco = Number(req.body.preco), duracao = Number(req.body.duracao);
      ensure(Number.isFinite(preco) && preco > 0 && preco <= 10000, 'O valor deve ser maior que zero e até R$ 10.000.');
      ensure(Number.isInteger(duracao) && duracao >= 15 && duracao <= 240 && duracao % 15 === 0, 'A duração deve ser de 15 a 240 minutos, em intervalos de 15.');
      ensure([0, 1, true, false].includes(req.body.ativo), 'Informe se o serviço está ativo.');
      const data = { nome: text(req.body.nome, 'Nome', 2, 100), descricao: text(req.body.descricao, 'Descrição', 5, 1000), preco: Math.round(preco * 100) / 100, duracao, ativo: Number(req.body.ativo), icone: ['bath', 'scissors', 'heart', 'sparkles'].includes(req.body.icone) ? req.body.icone : 'bath' };
      res.status(serviceId ? 200 : 201).json(await servicos.save(data, serviceId));
    },
    async slots(req, res) { res.json(await available(req.query.data, req.query.servico_id)); },
    async book(req, res) {
      ensure(req.user.tipo === 'cliente', 'Agendamentos são solicitados pelo cliente.', 403);
      const animalId = id(req.body.animal_id), serviceId = id(req.body.servico_id);
      const date = validateDate(req.body.data), time = req.body.horario;
      minutes(time);
      const note = text(req.body.observacoes || '', 'Observações', 0, 1000);
      const appointment = await db.exclusive(async () => {
        const animal = await animais.find(animalId);
        ensure(animal && animal.usuario_id === req.user.id, 'Escolha um dos seus animais.', 403);
        ensure((await available(date, serviceId)).includes(time), 'Esse horário não está mais disponível. Escolha outro.', 409);
        const service = await servicos.find(serviceId);
        return agendamentos.create({ animal_id: animalId, servico_id: serviceId, data: date, horario: time, duracao: service.duracao, valor: service.preco, observacoes: note });
      });
      res.status(201).json(appointment);
    },
    async changeStatus(req, res) {
      const appointmentId = id(req.params.id), next = req.body.status;
      const result = await db.exclusive(async () => {
        const appointment = await agendamentos.find(appointmentId);
        ensure(appointment && (req.user.tipo === 'admin' || appointment.usuario_id === req.user.id), 'Agendamento não encontrado.', 404);
        ensure(req.user.tipo === 'admin' || next === 'cancelado', 'Ação não permitida.', 403);
        const allowed = { pendente: ['confirmado', 'recusado', 'cancelado'], confirmado: ['concluido', 'cancelado'] };
        ensure(allowed[appointment.status]?.includes(next), 'Esta alteração não é permitida para o status atual.', 409);
        if (req.user.tipo !== 'admin') ensure(!hasStarted(appointment.data, appointment.horario), 'O horário deste agendamento já passou. Entre em contato com a equipe.');
        if (next === 'confirmado') ensure(!hasStarted(appointment.data, appointment.horario), 'Este horário já passou. Recuse a solicitação e combine uma nova data.');
        if (next === 'concluido') {
          ensure(hasStarted(appointment.data, appointment.horario), 'O atendimento só pode ser concluído após o horário agendado.');
          await atendimentos.complete(appointmentId, text(req.body.observacoes || '', 'Observações do atendimento', 0, 2000));
          return agendamentos.find(appointmentId);
        }
        return agendamentos.status(appointmentId, next, appointment.status);
      });
      res.json(result);
    },
    async saveHours(req, res) {
      const rows = req.body.horarios;
      ensure(Array.isArray(rows) && rows.length === 7 && new Set(rows.map(row => row.dia_semana)).size === 7, 'Informe os sete dias da semana.');
      for (const row of rows) {
        ensure(Number.isInteger(row.dia_semana) && row.dia_semana >= 0 && row.dia_semana <= 6, 'Dia da semana inválido.');
        ensure([0, 1, true, false].includes(row.ativo), 'Disponibilidade inválida.');
        ensure(minutes(row.inicio) < minutes(row.fim), 'O horário final deve ser depois do inicial.');
        ensure(minutes(row.inicio) % 30 === 0 && minutes(row.fim) % 30 === 0, 'Use horários em intervalos de 30 minutos.');
      }
      const result = await db.exclusive(async () => {
        const appointments = await agendamentos.future(today());
        for (const appointment of appointments) {
          if (hasStarted(appointment.data, appointment.horario)) continue;
          const window = rows.find(row => row.dia_semana === new Date(`${appointment.data}T12:00:00Z`).getUTCDay());
          ensure(window.ativo && minutes(appointment.horario) >= minutes(window.inicio) && minutes(appointment.horario) + appointment.duracao <= minutes(window.fim), 'Há agendamentos fora desse novo horário. Cancele-os antes de alterar a disponibilidade.', 409);
        }
        return horarios.save(rows.map(row => ({ ...row, ativo: Number(row.ativo) })));
      });
      res.json(result);
    },
  };
}
