import { objectId, serialize } from '../utils/mongo.js';

const projection = { senha: 0 };
export class UsuarioModel {
  constructor(db) { this.collection = db.collection('usuarios'); }
  async byEmail(email) { return serialize(await this.collection.findOne({ email })); }
  async credentials(id) { return serialize(await this.collection.findOne({ _id: objectId(id) })); }
  async find(id) { return serialize(await this.collection.findOne({ _id: objectId(id) }, { projection })); }
  async list() { return (await this.collection.find({}, { projection }).sort({ nome: 1 }).toArray()).map(serialize); }
  async clients() { return (await this.collection.find({ tipo: 'cliente' }, { projection }).sort({ nome: 1 }).toArray()).map(serialize); }
  async create({ nome, email, senha, telefone }, tipo = 'cliente') {
    const result = await this.collection.insertOne({ nome, email, senha, telefone, tipo, criado_em: new Date().toISOString() });
    return this.find(result.insertedId);
  }
  async update(id, { nome, email, telefone, senha }, expected) {
    const changes = { nome, email, telefone };
    if (senha) changes.senha = senha;
    const filter = { _id: objectId(id), ...(expected ? { email: expected.email, senha: expected.senha } : {}) };
    return serialize(await this.collection.findOneAndUpdate(filter, { $set: changes }, { returnDocument: 'after', projection }));
  }
}
