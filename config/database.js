import { MongoClient } from 'mongodb';
import { AsyncLocalStorage } from 'node:async_hooks';
import { initializeCollections } from './schema.js';

export async function createDatabase(options = {}) {
  const client = new MongoClient(options.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
  try {
    await client.connect();
    const database = client.db(options.name || process.env.MONGODB_DB || 'patai');
    await database.command({ ping: 1 });
    await initializeCollections(database);
    const context = new AsyncLocalStorage();
    let queue = Promise.resolve();
    return {
      client: 'mongodb', name: database.databaseName,
      collection: name => database.collection(name),
      // Coordena os horários de funcionamento com novas reservas neste processo.
      // Um índice único também impede sobreposição diretamente no MongoDB.
      exclusive(callback) {
        if (context.getStore()) return callback();
        const operation = queue.then(() => context.run(true, callback));
        queue = operation.catch(() => {});
        return operation;
      },
      async close() { await queue; await client.close(); },
    };
  } catch (error) { await client.close(); throw error; }
}
