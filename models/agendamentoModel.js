import { objectId, serialize, reservationKeys } from '../utils/mongo.js';
import { ensure } from '../utils/errors.js';

export class AgendamentoModel {
  constructor(db) { this.collection = db.collection('agendamentos'); this.animais = db.collection('animais'); }
  async list(user) {
    const pipeline = [
      { $lookup: { from: 'animais', localField: 'animal_id', foreignField: '_id', as: 'animal' } }, { $unwind: '$animal' },
      ...(user.tipo === 'admin' ? [] : [{ $match: { 'animal.usuario_id': objectId(user.id) } }]),
      { $lookup: { from: 'servicos', localField: 'servico_id', foreignField: '_id', as: 'servico' } }, { $unwind: '$servico' },
      { $lookup: { from: 'usuarios', localField: 'animal.usuario_id', foreignField: '_id', as: 'tutor_dados', pipeline: [{ $project: { nome: 1, telefone: 1 } }] } },
      { $set: {
        animal_nome: '$animal.nome', especie: '$animal.especie', raca: '$animal.raca', foto: '$animal.foto', usuario_id: '$animal.usuario_id',
        servico_nome: '$servico.nome', icone: '$servico.icone', tutor: { $arrayElemAt: ['$tutor_dados.nome', 0] }, telefone: { $arrayElemAt: ['$tutor_dados.telefone', 0] },
        atendimento_observacoes: '$atendimento.observacoes', concluido_em: '$atendimento.concluido_em',
      } },
      { $unset: ['animal', 'servico', 'tutor_dados', 'atendimento'] }, { $sort: { data: -1, horario: -1 } },
    ];
    return (await this.collection.aggregate(pipeline).toArray()).map(serialize);
  }
  async find(id) {
    const appointment = await this.collection.findOne({ _id: objectId(id) });
    if (!appointment) return undefined;
    const animal = await this.animais.findOne({ _id: appointment.animal_id }, { projection: { usuario_id: 1 } });
    return serialize({ ...appointment, usuario_id: animal?.usuario_id });
  }
  async busy(date) { return (await this.collection.find({ data: date, status: { $in: ['pendente', 'confirmado'] } }, { projection: { horario: 1, duracao: 1 } }).toArray()).map(serialize); }
  async future(date) { return (await this.collection.find({ data: { $gte: date }, status: { $in: ['pendente', 'confirmado'] } }).toArray()).map(serialize); }
  async create(data) {
    try {
      const result = await this.collection.insertOne({ ...data, animal_id: objectId(data.animal_id), servico_id: objectId(data.servico_id), status: 'pendente', reservas: reservationKeys(data.data, data.horario, data.duracao), criado_em: new Date().toISOString() });
      return this.find(result.insertedId);
    } catch (error) {
      if (error.code === 11000) ensure(false, 'Esse horário não está mais disponível. Escolha outro.', 409);
      throw error;
    }
  }
  async status(id, status, previous) {
    const update = { $set: { status } };
    if (['cancelado', 'recusado'].includes(status)) update.$unset = { reservas: '' };
    const result = await this.collection.updateOne({ _id: objectId(id), status: previous }, update);
    ensure(result.modifiedCount === 1, 'O agendamento foi alterado. Atualize a página.', 409);
    return this.find(id);
  }
}
