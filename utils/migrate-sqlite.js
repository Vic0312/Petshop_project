// Conversão única do arquivo anterior. O aplicativo usa apenas MongoDB.
import { DatabaseSync } from 'node:sqlite';
import { ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createDatabase } from '../config/database.js';
import { reservationKeys } from './mongo.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const sourcePath = process.env.LEGACY_SQLITE_PATH || './data/patai.sqlite';
if (!existsSync(sourcePath)) { console.log('Nenhum arquivo SQLite anterior encontrado. Inicie o projeto para criar os dados no MongoDB.'); process.exit(0); }
const source = new DatabaseSync(sourcePath, { readOnly: true });
const target = await createDatabase();
const collections = ['usuarios', 'servicos', 'horarios', 'animais', 'agendamentos'];
const legacyId = (collection, value) => new ObjectId(createHash('sha256').update(`patai:sqlite:${collection}:${value}`).digest('hex').slice(0, 24));
try {
  const rows = Object.fromEntries(collections.map(name => [name, source.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]));
  const existing = await Promise.all(collections.map(name => target.collection(name).estimatedDocumentCount()));
  if (existing.some(Boolean)) {
    const first = rows.usuarios[0];
    if (!first || !await target.collection('usuarios').findOne({ _id: legacyId('usuarios', first.id) })) throw new Error('O banco MongoDB de destino já contém dados. Use um banco vazio para transferir o SQLite sem misturar cadastros.');
  }
  {
    const records = source.prepare('SELECT * FROM atendimentos').all();
    for (const name of collections) {
      const documents = rows[name].map(row => {
        const { id, ...fields } = row;
        const document = { _id: legacyId(name, id), legado_id: id, ...fields };
        if (name === 'animais') document.usuario_id = legacyId('usuarios', row.usuario_id);
        if (name === 'agendamentos') {
          document.animal_id = legacyId('animais', row.animal_id);
          document.servico_id = legacyId('servicos', row.servico_id);
          if (['pendente', 'confirmado'].includes(row.status)) document.reservas = reservationKeys(row.data, row.horario, row.duracao);
          const record = records.find(item => item.agendamento_id === id);
          if (record) document.atendimento = { observacoes: record.observacoes, concluido_em: record.concluido_em };
        }
        return document;
      });
      for (const document of documents) await target.collection(name).updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
    }
    console.log('Transferência conferida. Registros existentes foram preservados e o arquivo SQLite permanece intacto.');
  }
  for (const name of collections) console.log(`${name}: ${await target.collection(name).countDocuments()}`);
} finally { source.close(); await target.close(); }
