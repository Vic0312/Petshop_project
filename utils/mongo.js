import { ObjectId } from 'mongodb';
import { minutes } from './dates.js';

export const objectId = value => value instanceof ObjectId ? value : new ObjectId(value);

export function serialize(document) {
  if (!document) return undefined;
  const { _id, reservas, ...fields } = document;
  for (const [key, value] of Object.entries(fields)) if (value instanceof ObjectId) fields[key] = value.toHexString();
  return { id: _id.toHexString(), ...fields };
}

export function reservationKeys(date, time, duration) {
  const start = minutes(time);
  return Array.from({ length: duration / 15 }, (_, index) => `${date}:${start + index * 15}`);
}
