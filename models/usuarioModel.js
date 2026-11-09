import { objectId, serialize } from '../utils/mongo.js';

const projection = { senha: 0 };
export class UsuarioModel {
  constructor(db) { this.collection = db.collection('usuarios'); }
  async byEmail(email) { return serialize(await this.collection.findOne({ email })); }
  async find(id) { return serialize(await this.collection.findOne({ _id: objectId(id) }, { projection })); }
  async clients() { return (await this.collection.find({ tipo: 'cliente' }, { projection }).sort({ nome: 1 }).toArray()).map(serialize); }
  async create({ nome, email, senha, telefone }) {
    const result = await this.collection.insertOne({ nome, email, senha, telefone, tipo: 'cliente', criado_em: new Date().toISOString() });
    return this.find(result.insertedId);
  }
  async update(id, { nome, telefone }) {
    await this.collection.updateOne({ _id: objectId(id) }, { $set: { nome, telefone } });
    return this.find(id);
  }
}
