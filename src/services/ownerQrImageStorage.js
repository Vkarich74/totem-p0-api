import { Readable } from 'node:stream';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const OWNER_QR_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const OWNER_QR_IMAGE_MAX_SIZE_BYTES = 2 * 1024 * 1024;

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function isConfiguredByUrl() {
  return Boolean(normalizeText(process.env.CLOUDINARY_URL));
}

function isConfiguredByParts() {
  return Boolean(
    normalizeText(process.env.CLOUDINARY_CLOUD_NAME) &&
      normalizeText(process.env.CLOUDINARY_API_KEY) &&
      normalizeText(process.env.CLOUDINARY_API_SECRET)
  );
}

function isOwnerQrImageStorageConfigured() {
  return isConfiguredByUrl() || isConfiguredByParts();
}

function configureCloudinaryIfNeeded() {
  if (!isOwnerQrImageStorageConfigured()) {
    return false;
  }

  if (isConfiguredByParts()) {
    cloudinary.config({
      cloud_name: normalizeText(process.env.CLOUDINARY_CLOUD_NAME),
      api_key: normalizeText(process.env.CLOUDINARY_API_KEY),
      api_secret: normalizeText(process.env.CLOUDINARY_API_SECRET),
      secure: true,
    });
    return true;
  }

  cloudinary.config({ secure: true });
  return true;
}

function buildOwnerQrImageStoragePaths({ ownerType, ownerSlug, destinationId }) {
  const normalizedOwnerType = normalizeText(ownerType)?.toLowerCase();
  const normalizedOwnerSlug = normalizeText(ownerSlug);
  const normalizedDestinationId = normalizeInt(destinationId);

  if (!normalizedOwnerSlug || !normalizedDestinationId || normalizedDestinationId <= 0) {
    const error = new Error('Invalid owner_qr image storage target');
    error.code = 'OWNER_QR_IMAGE_INVALID_FILE';
    error.statusCode = 400;
    throw error;
  }

  if (normalizedOwnerType !== 'salon' && normalizedOwnerType !== 'master') {
    const error = new Error('Invalid owner type');
    error.code = 'OWNER_QR_IMAGE_INVALID_OWNER';
    error.statusCode = 400;
    throw error;
  }

  const folder = `totem/businesses/${normalizedOwnerType}s/${normalizedOwnerSlug}/owner-qr`;
  const public_id = `qr-image-destination-${normalizedDestinationId}`;

  return {
    folder,
    public_id,
  };
}

function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    Readable.from(buffer).on('error', reject).pipe(stream);
  });
}

function deleteCloudinaryAsset(publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: 'image',
        invalidate: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );
  });
}

function createOwnerQrImageUploadMiddleware() {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: OWNER_QR_IMAGE_MAX_SIZE_BYTES,
      files: 1,
    },
    fileFilter(req, file, cb) {
      if (!file) {
        cb(null, false);
        return;
      }

      if (!OWNER_QR_IMAGE_ALLOWED_MIME_TYPES.has(String(file.mimetype || '').trim().toLowerCase())) {
        const error = new Error('Unsupported owner QR image type');
        error.code = 'OWNER_QR_IMAGE_UNSUPPORTED_TYPE';
        error.statusCode = 415;
        cb(error);
        return;
      }

      cb(null, true);
    },
  });

  return upload.single('image');
}

function normalizeOwnerQrImageUploadError(err) {
  if (!err) {
    return null;
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: 413,
      code: 'OWNER_QR_IMAGE_TOO_LARGE',
      message: 'File is too large',
    };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      statusCode: 400,
      code: 'OWNER_QR_IMAGE_INVALID_FILE',
      message: 'Invalid file',
    };
  }

  if (err.code === 'OWNER_QR_IMAGE_UNSUPPORTED_TYPE') {
    return {
      statusCode: err.statusCode || 415,
      code: 'OWNER_QR_IMAGE_UNSUPPORTED_TYPE',
      message: err.message || 'Unsupported file type',
    };
  }

  if (String(err.code || '').startsWith('OWNER_QR_IMAGE_')) {
    return {
      statusCode: err.statusCode || 400,
      code: err.code,
      message: err.message || err.code,
    };
  }

  return null;
}

async function uploadOwnerQrImage({ ownerType, ownerSlug, destinationId, file }) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    const error = new Error('Invalid file');
    error.code = 'OWNER_QR_IMAGE_INVALID_FILE';
    error.statusCode = 400;
    throw error;
  }

  if (!isOwnerQrImageStorageConfigured()) {
    const error = new Error('Cloudinary config is missing');
    error.code = 'OWNER_QR_IMAGE_STORAGE_CONFIG_MISSING';
    error.statusCode = 503;
    throw error;
  }

  configureCloudinaryIfNeeded();
  const paths = buildOwnerQrImageStoragePaths({ ownerType, ownerSlug, destinationId });

  const uploadResult = await uploadBufferToCloudinary(file.buffer, {
    folder: paths.folder,
    public_id: paths.public_id,
    resource_type: 'image',
    overwrite: true,
    invalidate: true,
    use_filename: false,
    unique_filename: false,
  });

  return {
    secure_url: uploadResult?.secure_url || null,
    public_id: uploadResult?.public_id || paths.public_id,
    folder: paths.folder,
    uploaded_at: new Date().toISOString(),
    resource_type: uploadResult?.resource_type || 'image',
    format: uploadResult?.format || null,
    bytes: uploadResult?.bytes ?? file.size ?? null,
  };
}

async function deleteOwnerQrImage(publicId) {
  const normalizedPublicId = normalizeText(publicId);

  if (!normalizedPublicId) {
    return {
      ok: true,
      destroyed: false,
      result: null,
    };
  }

  if (!isOwnerQrImageStorageConfigured()) {
    return {
      ok: true,
      destroyed: false,
      skipped: true,
    };
  }

  configureCloudinaryIfNeeded();
  const result = await deleteCloudinaryAsset(normalizedPublicId);

  return {
    ok: true,
    destroyed: result?.result === 'ok' || result?.result === 'not found',
    result: result || null,
  };
}

export {
  OWNER_QR_IMAGE_ALLOWED_MIME_TYPES,
  OWNER_QR_IMAGE_MAX_SIZE_BYTES,
  buildOwnerQrImageStoragePaths,
  createOwnerQrImageUploadMiddleware,
  deleteOwnerQrImage,
  isOwnerQrImageStorageConfigured,
  normalizeOwnerQrImageUploadError,
  uploadOwnerQrImage,
};
