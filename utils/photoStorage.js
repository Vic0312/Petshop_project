import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError, ensure } from './errors.js';

export const isUploadedPhoto = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(value);

export function createPhotoStorage(directory = fileURLToPath(new URL('../data/uploads/animais/', import.meta.url))) {
  const root = resolve(directory);
  return {
    path(filename) {
      ensure(isUploadedPhoto(filename), 'Foto não encontrada.', 404);
      return resolve(root, filename);
    },
    async save(file) {
      let processed;
      try {
        const image = sharp(file.buffer, { limitInputPixels: 25_000_000, failOn: 'warning' });
        const metadata = await image.metadata();
        const type = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format];
        ensure(type && type === file.mimetype && metadata.width && metadata.height, 'Escolha uma foto JPG, PNG ou WebP válida.');
        processed = await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('Não foi possível ler essa foto. Use uma imagem válida de até 25 megapixels.');
      }
      await mkdir(root, { recursive: true });
      const filename = `${randomUUID()}.webp`;
      // A nova imagem não inclui metadados do arquivo original.
      await writeFile(resolve(root, filename), processed, { flag: 'wx' });
      return filename;
    },
    async remove(filename) {
      if (!isUploadedPhoto(filename)) return;
      try { await unlink(resolve(root, filename)); }
      catch (error) { if (error.code !== 'ENOENT') console.warn('Não foi possível limpar uma foto substituída.'); }
    },
  };
}
