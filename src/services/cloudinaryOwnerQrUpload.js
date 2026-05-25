import { Readable } from 'node:stream';
import cloudinary from 'cloudinary';
import multer from 'multer';

const cloudinaryV2 = cloudinary.v2;

const OWNER_QR_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const OWNER_QR_MAX_FILE_SIZE = 2 * 1024 * 1024;
const OWNER_QR_FOLDER_ROOT = 'totem/businesses';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeOwnerType(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildOwnerQrCloudinaryPaths({ ownerType, ownerSlug, destinationId }) {
  const normalizedOwnerType = normalizeOwnerType(ownerType);
  const slug = normalizeText(ownerSlug);
  const normalizedDestinationId = Number.parseInt(String(destinationId ?? '').trim(), 10);

  if (!slug || !Number.isInteger(normalizedDestinationId) || normalizedDestinationId <= 0) {
    const error = new Error('Invalid owner QR cloudinary target');
    error.code = 'OWNER_QR_IMAGE_INVALID_FILE';
    error.statusCode = 400;
    throw error;
  }

  if (normalizedOwnerType !== 'salon' && normalizedOwnerType !== 'master') {
    const error = new Error('Invalid owner type');
    error.code = 'OWNER_QR_IMAGE_INVALID_FILE';
    error.statusCode = 400;
    throw error;
  }

  const folder = `${OWNER_QR_FOLDER_ROOT}/${normalizedOwnerType}s/${slug}/owner-qr`;
  const publicId = `${folder}/qr-destination-${normalizedDestinationId}`;

  return {
    owner_type: normalizedOwnerType,
    owner_slug: slug,
    destination_id: normalizedDestinationId,
    folder,
    public_id: publicId,
  };
}

function isCloudinaryConfigured() {
  const cloudinaryUrl = normalizeText(process.env.CLOUDINARY_URL);
  if (cloudinaryUrl) {
    try {
      const parsed = new URL(cloudinaryUrl);
      const cloudName = normalizeText(parsed.hostname);
      const apiKey = normalizeText(parsed.username);
      const apiSecret = normalizeText(parsed.password);

      return Boolean(cloudName && apiKey && apiSecret);
    } catch (_) {
      return false;
    }
  }

  const cloudName = normalizeText(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = normalizeText(process.env.CLOUDINARY_API_KEY);
  const apiSecret = normalizeText(process.env.CLOUDINARY_API_SECRET);

  return Boolean(cloudName && apiKey && apiSecret);
}

function configureCloudinaryClient() {
  const cloudinaryUrl = normalizeText(process.env.CLOUDINARY_URL);

  if (cloudinaryUrl) {
    const parsed = new URL(cloudinaryUrl);
    const cloudName = normalizeText(parsed.hostname);
    const apiKey = normalizeText(parsed.username);
    const apiSecret = normalizeText(parsed.password);

    if (!cloudName || !apiKey || !apiSecret) {
      const error = new Error('Cloudinary config missing');
      error.code = 'CLOUDINARY_CONFIG_MISSING';
      error.statusCode = 503;
      throw error;
    }

    cloudinaryV2.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    return true;
  }

  const cloudName = normalizeText(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = normalizeText(process.env.CLOUDINARY_API_KEY);
  const apiSecret = normalizeText(process.env.CLOUDINARY_API_SECRET);

  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary config missing');
    error.code = 'CLOUDINARY_CONFIG_MISSING';
    error.statusCode = 503;
    throw error;
  }

  cloudinaryV2.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return true;
}

function createOwnerQrImageUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: OWNER_QR_MAX_FILE_SIZE,
      files: 1,
      parts: 2,
    },
    fileFilter(req, file, cb) {
      const mimetype = normalizeText(file?.mimetype);
      if (!mimetype || !OWNER_QR_ALLOWED_MIME_TYPES.has(mimetype)) {
        const error = new Error('Unsupported owner QR image type');
        error.code = 'OWNER_QR_IMAGE_UNSUPPORTED_TYPE';
        error.statusCode = 400;
        return cb(error);
      }
      return cb(null, true);
    },
  }).single('image');
}

function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryV2.uploader.upload_stream(options, (error, result) => {
      if (error) {
        const wrapped = new Error(error.message || 'Cloudinary upload failed');
        wrapped.code = 'OWNER_QR_IMAGE_UPLOAD_FAILED';
        wrapped.statusCode = 500;
        wrapped.cause = error;
        reject(wrapped);
        return;
      }

      resolve(result || null);
    });

    Readable.from(buffer).on('error', reject).pipe(uploadStream);
  });
}

async function uploadOwnerQrImage({ ownerType, ownerSlug, destinationId, file }) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    const error = new Error('Invalid owner QR image upload');
    error.code = 'OWNER_QR_IMAGE_INVALID_FILE';
    error.statusCode = 400;
    throw error;
  }

  configureCloudinaryClient();

  const paths = buildOwnerQrCloudinaryPaths({ ownerType, ownerSlug, destinationId });

  const result = await uploadBufferToCloudinary(file.buffer, {
    folder: paths.folder,
    public_id: `qr-destination-${paths.destination_id}`,
    resource_type: 'image',
    overwrite: true,
    invalidate: true,
    use_filename: false,
    unique_filename: false,
  });

  return {
    folder: paths.folder,
    public_id: result?.public_id || paths.public_id,
    secure_url: result?.secure_url || null,
    resource_type: result?.resource_type || 'image',
    format: result?.format || null,
    bytes: Number.isFinite(Number(result?.bytes)) ? Number(result.bytes) : null,
    uploaded_at: result?.created_at || new Date().toISOString(),
  };
}

async function deleteOwnerQrImage(publicId) {
  const normalizedPublicId = normalizeText(publicId);

  if (!normalizedPublicId) {
    return { deleted: false, result: null };
  }

  configureCloudinaryClient();

  const result = await cloudinaryV2.uploader.destroy(normalizedPublicId, {
    resource_type: 'image',
    invalidate: true,
  });

  return {
    deleted: true,
    result,
  };
}

export {
  createOwnerQrImageUploadMiddleware,
  deleteOwnerQrImage,
  isCloudinaryConfigured,
  uploadOwnerQrImage,
  buildOwnerQrCloudinaryPaths,
};
