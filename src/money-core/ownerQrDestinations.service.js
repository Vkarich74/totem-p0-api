import {
  deleteOwnerQrImage,
  uploadOwnerQrImage,
} from '../services/ownerQrImageStorage.js';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master']);
const DESTINATION_TYPE = 'owner_qr';
const OWNER_QR_IMAGE_METADATA_KEYS = Object.freeze([
  'image_storage',
  'cloudinary_public_id',
  'cloudinary_folder',
  'cloudinary_uploaded_at',
  'cloudinary_resource_type',
  'cloudinary_format',
  'cloudinary_bytes',
]);

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

function isPlainObject(value) {
  return Boolean(value) && value.constructor === Object;
}

function normalizeOwner(ownerType, ownerId) {
  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizeInt(ownerId);

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'OWNER_QR_DESTINATION_INVALID_OWNER';
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedOwnerId || normalizedOwnerId <= 0) {
    const error = new Error('Invalid owner_id');
    error.code = 'OWNER_QR_DESTINATION_INVALID_OWNER';
    error.statusCode = 400;
    throw error;
  }

  return {
    owner_type: normalizedOwnerType,
    owner_id: normalizedOwnerId,
  };
}

function normalizePayload(payload = {}, { requireContactSource = false } = {}) {
  if (!isPlainObject(payload)) {
    const error = new Error('Invalid payload');
    error.code = 'OWNER_QR_DESTINATION_INVALID_PAYLOAD';
    error.statusCode = 400;
    throw error;
  }

  const label = normalizeText(payload.label);
  const qrImageUrl = normalizeText(payload.qr_image_url);
  const bankName = normalizeText(payload.bank_name);
  const accountName = normalizeText(payload.account_name);
  const phoneOrAccount = normalizeText(payload.phone_or_account);

  let metadataJson = {};
  if (payload.metadata_json !== undefined) {
    if (!isPlainObject(payload.metadata_json)) {
      const error = new Error('metadata_json must be an object');
      error.code = 'OWNER_QR_DESTINATION_INVALID_PAYLOAD';
      error.statusCode = 400;
      throw error;
    }
    metadataJson = payload.metadata_json;
  }

  if (requireContactSource) {
    if (!qrImageUrl && !bankName && !phoneOrAccount) {
      const error = new Error('At least one source field is required');
      error.code = 'OWNER_QR_DESTINATION_INVALID_PAYLOAD';
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    label,
    qr_image_url: qrImageUrl,
    bank_name: bankName,
    account_name: accountName,
    phone_or_account: phoneOrAccount,
    metadata_json: metadataJson,
  };
}

function normalizeDestinationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    destination_type: row.destination_type,
    label: row.label,
    qr_image_url: row.qr_image_url,
    bank_name: row.bank_name,
    account_name: row.account_name,
    phone_or_account: row.phone_or_account,
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata_json: row.metadata_json || {},
  };
}

function mergeOwnerQrImageMetadata(currentMetadata = {}, uploadResult = {}) {
  const metadata = isPlainObject(currentMetadata) ? { ...currentMetadata } : {};

  metadata.image_storage = 'cloudinary';
  metadata.cloudinary_public_id = uploadResult.public_id || null;
  metadata.cloudinary_folder = uploadResult.folder || null;
  metadata.cloudinary_uploaded_at = uploadResult.uploaded_at || null;
  metadata.cloudinary_resource_type = uploadResult.resource_type || null;
  metadata.cloudinary_format = uploadResult.format || null;
  metadata.cloudinary_bytes = uploadResult.bytes ?? null;

  return metadata;
}

function clearOwnerQrImageMetadata(currentMetadata = {}) {
  const metadata = isPlainObject(currentMetadata) ? { ...currentMetadata } : {};

  metadata.image_storage = null;
  metadata.cloudinary_public_id = null;
  metadata.cloudinary_folder = null;
  metadata.cloudinary_uploaded_at = null;
  metadata.cloudinary_resource_type = null;
  metadata.cloudinary_format = null;
  metadata.cloudinary_bytes = null;

  return metadata;
}

function getOwnerQrCloudinaryPublicId(metadataJson = {}) {
  if (!isPlainObject(metadataJson)) {
    return null;
  }

  return normalizeText(metadataJson.cloudinary_public_id);
}

async function listOwnerQrDestinations(pool, { ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);

  const result = await pool.query(
    `
    SELECT *
    FROM public.owner_payment_destinations
    WHERE owner_type = $1
      AND owner_id = $2
      AND destination_type = $3
    ORDER BY is_active DESC, created_at DESC, id DESC
    `,
    [owner.owner_type, owner.owner_id, DESTINATION_TYPE]
  );

  return result.rows.map(normalizeDestinationRow);
}

async function getActiveOwnerQrDestination(pool, { ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);

  const result = await pool.query(
    `
    SELECT *
    FROM public.owner_payment_destinations
    WHERE owner_type = $1
      AND owner_id = $2
      AND destination_type = $3
      AND is_active = true
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [owner.owner_type, owner.owner_id, DESTINATION_TYPE]
  );

  return normalizeDestinationRow(result.rows[0] || null);
}

async function validateOwnerQrDestinationOwnership({ pool, ownerType, ownerId, destinationId }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const destinationIdNormalized = normalizeInt(destinationId);

  if (!destinationIdNormalized || destinationIdNormalized <= 0) {
    const error = new Error('Destination not found');
    error.code = 'OWNER_QR_DESTINATION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.owner_payment_destinations
    WHERE id = $1
    FOR UPDATE
    LIMIT 1
    `,
    [destinationIdNormalized]
  );

  const destination = result.rows[0] || null;

  if (!destination) {
    const error = new Error('Destination not found');
    error.code = 'OWNER_QR_DESTINATION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (
    String(destination.owner_type || '') !== owner.owner_type ||
    Number(destination.owner_id) !== owner.owner_id ||
    String(destination.destination_type || '') !== DESTINATION_TYPE
  ) {
    const error = new Error('Destination belongs to another owner');
    error.code = 'OWNER_QR_DESTINATION_INVALID_OWNER';
    error.statusCode = 403;
    throw error;
  }

  return normalizeDestinationRow(destination);
}

async function createOwnerQrDestination({ pool, ownerType, ownerId, payload = {}, createdByUserId = null }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const normalized = normalizePayload(payload, { requireContactSource: true });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
      UPDATE public.owner_payment_destinations
      SET is_active = false,
          updated_at = now()
      WHERE owner_type = $1
        AND owner_id = $2
        AND destination_type = $3
        AND is_active = true
      `,
      [owner.owner_type, owner.owner_id, DESTINATION_TYPE]
    );

    const insertResult = await client.query(
      `
      INSERT INTO public.owner_payment_destinations (
        owner_type,
        owner_id,
        destination_type,
        label,
        qr_image_url,
        bank_name,
        account_name,
        phone_or_account,
        is_active,
        created_by_user_id,
        metadata_json
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10::jsonb
      )
      RETURNING *
      `,
      [
        owner.owner_type,
        owner.owner_id,
        DESTINATION_TYPE,
        normalized.label,
        normalized.qr_image_url,
        normalized.bank_name,
        normalized.account_name,
        normalized.phone_or_account,
        normalizeInt(createdByUserId),
        JSON.stringify(normalized.metadata_json || {}),
      ]
    );

    await client.query('COMMIT');
    return normalizeDestinationRow(insertResult.rows[0] || null);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

async function updateOwnerQrDestination({ pool, ownerType, ownerId, destinationId, payload = {} }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = await validateOwnerQrDestinationOwnership({
      pool: client,
      ownerType: owner.owner_type,
      ownerId: owner.owner_id,
      destinationId,
    });

    const normalized = normalizePayload({
      label: payload.label !== undefined ? payload.label : current.label,
      qr_image_url: payload.qr_image_url !== undefined ? payload.qr_image_url : current.qr_image_url,
      bank_name: payload.bank_name !== undefined ? payload.bank_name : current.bank_name,
      account_name: payload.account_name !== undefined ? payload.account_name : current.account_name,
      phone_or_account: payload.phone_or_account !== undefined ? payload.phone_or_account : current.phone_or_account,
      metadata_json: payload.metadata_json !== undefined ? payload.metadata_json : current.metadata_json,
    }, { requireContactSource: true });

    const updateResult = await client.query(
      `
      UPDATE public.owner_payment_destinations
      SET
        label = $2,
        qr_image_url = $3,
        bank_name = $4,
        account_name = $5,
        phone_or_account = $6,
        metadata_json = $7::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        current.id,
        normalized.label,
        normalized.qr_image_url,
        normalized.bank_name,
        normalized.account_name,
        normalized.phone_or_account,
        JSON.stringify(normalized.metadata_json || {}),
      ]
    );

    await client.query('COMMIT');
    return normalizeDestinationRow(updateResult.rows[0] || null);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

async function deactivateOwnerQrDestination({ pool, ownerType, ownerId, destinationId }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = await validateOwnerQrDestinationOwnership({
      pool: client,
      ownerType: owner.owner_type,
      ownerId: owner.owner_id,
      destinationId,
    });

    const updateResult = await client.query(
      `
      UPDATE public.owner_payment_destinations
      SET is_active = false,
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [current.id]
    );

    await client.query('COMMIT');
    return normalizeDestinationRow(updateResult.rows[0] || null);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

async function attachOwnerQrDestinationImage({ pool, ownerType, ownerId, ownerSlug, destinationId, file }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const destinationIdNormalized = normalizeInt(destinationId);

  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    const error = new Error('Invalid file');
    error.code = 'OWNER_QR_IMAGE_INVALID_FILE';
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await validateOwnerQrDestinationOwnership({
      pool: client,
      ownerType: owner.owner_type,
      ownerId: owner.owner_id,
      destinationId: destinationIdNormalized,
    });

    const uploadResult = await uploadOwnerQrImage({
      ownerType: owner.owner_type,
      ownerSlug,
      destinationId: current.id,
      file,
    });

    const metadataJson = mergeOwnerQrImageMetadata(current.metadata_json || {}, uploadResult);

    const updateResult = await client.query(
      `
      UPDATE public.owner_payment_destinations
      SET
        qr_image_url = $2,
        metadata_json = $3::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        current.id,
        uploadResult.secure_url,
        JSON.stringify(metadataJson),
      ]
    );

    await client.query('COMMIT');
    return normalizeDestinationRow(updateResult.rows[0] || null);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }

    throw error;
  } finally {
    client.release();
  }
}

async function deleteOwnerQrDestinationImage({ pool, ownerType, ownerId, ownerSlug, destinationId }) {
  const owner = normalizeOwner(ownerType, ownerId);
  const destinationIdNormalized = normalizeInt(destinationId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await validateOwnerQrDestinationOwnership({
      pool: client,
      ownerType: owner.owner_type,
      ownerId: owner.owner_id,
      destinationId: destinationIdNormalized,
    });

    const publicId = getOwnerQrCloudinaryPublicId(current.metadata_json || {});
    const hasImage = Boolean(normalizeText(current.qr_image_url) || publicId);
    if (!hasImage) {
      await client.query('COMMIT');
      return {
        destination: current,
        no_image: true,
      };
    }

    if (publicId) {
      await deleteOwnerQrImage(publicId);
    }

    const metadataJson = clearOwnerQrImageMetadata(current.metadata_json || {});

    const updateResult = await client.query(
      `
      UPDATE public.owner_payment_destinations
      SET
        qr_image_url = null,
        metadata_json = $2::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        current.id,
        JSON.stringify(metadataJson),
      ]
    );

    await client.query('COMMIT');
    return {
      destination: normalizeDestinationRow(updateResult.rows[0] || null),
      no_image: false,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }

    throw error;
  } finally {
    client.release();
  }
}

export {
  listOwnerQrDestinations,
  getActiveOwnerQrDestination,
  createOwnerQrDestination,
  updateOwnerQrDestination,
  deactivateOwnerQrDestination,
  attachOwnerQrDestinationImage,
  deleteOwnerQrDestinationImage,
  validateOwnerQrDestinationOwnership,
};
