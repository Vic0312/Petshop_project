import { serialize } from '../utils/mongo.js';

export class HorarioModel {
  constructor(db) { this.collection = db.collection('horarios'); }
  async list() { return (await this.collection.find().sort({ dia_semana: 1 }).toArray()).map(serialize); }
  async day(day) { return serialize(await this.collection.findOne({ dia_semana: day })); }
  async save(rows) {
    await this.collection.bulkWrite(rows.map(({ dia_semana, inicio, fim, ativo }) => ({ updateOne: { filter: { dia_semana }, update: { $set: { inicio, fim, ativo } } } })));
    return this.list();
  }
}
