import { objectId, serialize } from '../utils/mongo.js';
import { ObjectId } from 'mongodb';

export class AnimalModel {
  constructor(db) { this.collection = db.collection('animais'); }
  async list(user) {
    const pipeline = [
      { $match: user.tipo === 'admin' ? {} : { usuario_id: objectId(user.id) } },
      { $lookup: { from: 'usuarios', localField: 'usuario_id', foreignField: '_id', as: 'tutor_dados', pipeline: [{ $project: { nome: 1 } }] } },
      { $set: { tutor: { $arrayElemAt: ['$tutor_dados.nome', 0] } } },
      { $unset: 'tutor_dados' }, { $sort: { _id: 1 } },
    ];
    return (await this.collection.aggregate(pipeline).toArray()).map(serialize);
  }
  async find(id) { return serialize(await this.collection.findOne({ _id: objectId(id) })); }
  async byPhoto(foto) { return serialize(await this.collection.findOne({ foto })); }
  async save(data, userId, animalId) {
    if (animalId) {
      return serialize(await this.collection.findOneAndUpdate({ _id: objectId(animalId), usuario_id: objectId(userId) }, { $set: data }, { returnDocument: 'after' }));
    }
    const document = { ...data, _id: new ObjectId(), usuario_id: objectId(userId) };
    await this.collection.insertOne(document);
    return serialize(document);
  }
}
