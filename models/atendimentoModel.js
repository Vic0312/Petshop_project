import { objectId, serialize } from '../utils/mongo.js';
import { ensure } from '../utils/errors.js';

// A conclusão e seu registro pertencem ao mesmo documento, com escrita atômica.
// Funciona no MongoDB local sem exigir a configuração de um replica set.
export class AtendimentoModel {
  constructor(db) { this.collection = db.collection('agendamentos'); }
  async complete(agendamentoId, observacoes) {
    const result = await this.collection.findOneAndUpdate(
      { _id: objectId(agendamentoId), status: 'confirmado', atendimento: { $exists: false } },
      { $set: { status: 'concluido', atendimento: { observacoes, concluido_em: new Date().toISOString() } }, $unset: { reservas: '' } },
      { returnDocument: 'after' },
    );
    ensure(result, 'Este atendimento já foi alterado ou concluído.', 409);
    return serialize(result);
  }
}
