import { objectId, serialize } from '../utils/mongo.js';

export class ServicoModel {
  constructor(db) { this.collection = db.collection('servicos'); }
  async list(admin = false) { return (await this.collection.find(admin ? {} : { ativo: 1 }).sort({ _id: 1 }).toArray()).map(serialize); }
  async find(id) { return serialize(await this.collection.findOne({ _id: objectId(id) })); }
  async save(data, serviceId) {
    if (serviceId) { await this.collection.updateOne({ _id: objectId(serviceId) }, { $set: data }); return this.find(serviceId); }
    const result = await this.collection.insertOne(data);
    return this.find(result.insertedId);
  }
}
