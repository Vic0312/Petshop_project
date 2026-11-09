const string = { bsonType: 'string' };
const objectId = { bsonType: 'objectId' };
const number = { bsonType: ['int', 'long', 'double', 'decimal'] };
const integer = (min, max) => ({ bsonType: ['int', 'long'], minimum: min, maximum: max });

export const schemas = {
  usuarios: {
    required: ['nome', 'email', 'senha', 'telefone', 'tipo', 'criado_em'],
    properties: { nome: string, email: string, senha: string, telefone: string, tipo: { enum: ['cliente', 'admin'] }, criado_em: string },
  },
  animais: {
    required: ['usuario_id', 'nome', 'especie', 'raca', 'porte', 'idade', 'observacoes', 'foto'],
    properties: { usuario_id: objectId, nome: string, especie: { enum: ['Cachorro', 'Gato', 'Outro'] }, raca: string, porte: { enum: ['Pequeno', 'Médio', 'Grande'] }, idade: integer(0, 40), observacoes: string, foto: string },
  },
  servicos: {
    required: ['nome', 'descricao', 'preco', 'duracao', 'icone', 'ativo'],
    properties: { nome: string, descricao: string, preco: { ...number, minimum: 0, exclusiveMinimum: true }, duracao: integer(15, 240), icone: string, ativo: { enum: [0, 1] } },
  },
  horarios: {
    required: ['dia_semana', 'inicio', 'fim', 'ativo'],
    properties: { dia_semana: integer(0, 6), inicio: { bsonType: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }, fim: string, ativo: { enum: [0, 1] } },
  },
  agendamentos: {
    required: ['animal_id', 'servico_id', 'data', 'horario', 'duracao', 'valor', 'status', 'observacoes', 'criado_em'],
    properties: {
      animal_id: objectId, servico_id: objectId, data: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, horario: string,
      duracao: integer(15, 240), valor: number, status: { enum: ['pendente', 'confirmado', 'recusado', 'cancelado', 'concluido'] },
      observacoes: string, criado_em: string, reservas: { bsonType: 'array', items: string },
      atendimento: { bsonType: 'object', required: ['observacoes', 'concluido_em'], properties: { observacoes: string, concluido_em: string } },
    },
  },
};

export async function initializeCollections(database) {
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  for (const [name, schema] of Object.entries(schemas)) {
    if (!existing.has(name)) {
      try { await database.createCollection(name, { validator: { $jsonSchema: { bsonType: 'object', ...schema } }, validationLevel: 'strict' }); }
      catch (error) { if (error.code !== 48) throw error; }
    }
  }
  await database.collection('usuarios').createIndex({ email: 1 }, { unique: true });
  await database.collection('animais').createIndex({ usuario_id: 1 });
  await database.collection('animais').createIndex({ foto: 1 });
  await database.collection('horarios').createIndex({ dia_semana: 1 }, { unique: true });
  await database.collection('agendamentos').createIndex({ data: 1, horario: 1 });
  await database.collection('agendamentos').createIndex({ animal_id: 1 });
  // Uma reserva ocupa todas as frações de 15 minutos de duração do cuidado.
  // O índice multikey recusa atomicamente qualquer fração já reservada.
  await database.collection('agendamentos').createIndex({ reservas: 1 }, { name: 'reservas_sem_sobreposicao', unique: true, partialFilterExpression: { reservas: { $exists: true } } });
}
