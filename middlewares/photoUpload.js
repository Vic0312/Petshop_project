import multer from 'multer';
import { AppError } from '../utils/errors.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10, fieldSize: 2048, parts: 11 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new AppError('Escolha uma foto JPG, PNG ou WebP.'));
    callback(null, true);
  },
}).single('foto');

export function animalPhotoUpload(req, res, next) {
  if (req.user.tipo !== 'cliente') return next(new AppError('Cadastros de animais são feitos pelo tutor.', 403));
  if (!req.is('application/json') && !req.is('multipart/form-data')) return next(new AppError('Envie o cadastro como formulário com foto ou JSON.', 415));
  upload(req, res, error => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'A foto deve ter no máximo 5 MB.' : 'Envie apenas uma foto e os campos do cadastro.';
      return next(new AppError(message));
    }
    next(error);
  });
}
