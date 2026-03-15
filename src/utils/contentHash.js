const crypto = require('crypto');
const fs = require('fs').promises;

const FINGERPRINT_CHUNK_SIZE = 65536;

const buildHashFromChunkAndSize = (chunkBuffer, fileSize) => {
  const normalizedChunk = Buffer.isBuffer(chunkBuffer) ? chunkBuffer : Buffer.from(chunkBuffer || []);
  const sizeBuffer = Buffer.alloc(8);
  sizeBuffer.writeDoubleBE(Number(fileSize) || 0, 0);

  return crypto
    .createHash('sha256')
    .update(normalizedChunk)
    .update(sizeBuffer)
    .digest('hex');
};

const computeContentHashFromBuffer = async (buffer) => {
  if (!buffer) {
    throw new Error('Buffer is required to compute content hash');
  }

  const normalizedBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return buildHashFromChunkAndSize(
    normalizedBuffer.subarray(0, FINGERPRINT_CHUNK_SIZE),
    normalizedBuffer.length,
  );
};

const computeContentHashFromFilePath = async (filePath) => {
  if (!filePath) {
    throw new Error('File path is required to compute content hash');
  }

  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const chunk = Buffer.alloc(Math.min(size, FINGERPRINT_CHUNK_SIZE));
    await handle.read(chunk, 0, chunk.length, 0);
    return buildHashFromChunkAndSize(chunk, size);
  } finally {
    await handle.close();
  }
};

const computeContentHashFromUpload = async (file = {}) => {
  if (file.buffer) {
    return computeContentHashFromBuffer(file.buffer);
  }

  if (file.path) {
    return computeContentHashFromFilePath(file.path);
  }

  throw new Error('Upload file must include a buffer or file path');
};

module.exports = {
  FINGERPRINT_CHUNK_SIZE,
  computeContentHashFromBuffer,
  computeContentHashFromFilePath,
  computeContentHashFromUpload,
};
