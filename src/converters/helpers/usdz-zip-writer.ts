/**
 * USDZ ZIP Writer
 * 
 * ZIP file format with 64-byte alignment for file data.
 * Uses CRC32 checksums, DOS timestamps, and uncompressed storage.
 */

import * as crc32 from 'crc-32';
import {
  ZipWriterOptionsSchema,
  ZipFileInfoSchema,
  FileNameSchema,
  FileDataSchema,
  FileCountSchema,
  Crc32Schema,
  DosTimeSchema,
  DosDateSchema,
  type ZipWriterOptions,
  type ZipFileInfo
} from '../../schemas/zip-writer';
import { ZIP_CONSTANTS } from '../../constants';

/**
 * ZIP writer that creates archives with 64-byte aligned file data.
 * Generates ZIP files with CRC32 checksums, DOS timestamps, and no compression.
 */
export class UsdzZipWriter {
  private files: ZipFileInfo[] = [];
  private currentOffset = 0;
  private alignTo64Bytes: boolean;
  private compressionLevel: number;
  private crcTable: Uint32Array | null = null;
  private encoder = new TextEncoder();

  constructor(options: Partial<ZipWriterOptions> = {}) {
    // Validate options
    const validatedOptions = ZipWriterOptionsSchema.parse(options);

    this.alignTo64Bytes = validatedOptions.alignTo64Bytes;
    this.compressionLevel = validatedOptions.compressionLevel;

    // Enforce no compression for optimal performance
    if (this.compressionLevel !== ZIP_CONSTANTS.COMPRESSION_STORE) {
      console.warn('[UsdzZipWriter] Compression is not supported for optimal performance; ignoring compressionLevel');
      this.compressionLevel = ZIP_CONSTANTS.COMPRESSION_STORE;
    }

    // Start at 0 - we'll add padding in generate()
    this.currentOffset = 0;
  }

  /**
   * Add a file to the ZIP archive
   */
  addFile(fileName: string, data: Uint8Array): string {
    // Validate file name
    const validatedFileName = FileNameSchema.parse(fileName);

    // Validate file data
    const validatedData = FileDataSchema.parse(data);

    // Calculate CRC32
    const crc32 = this.calculateCrc32(validatedData);

    const fileInfo: ZipFileInfo = {
      name: validatedFileName,
      data: validatedData,
      offset: this.currentOffset, // This will be updated in generate()
      size: validatedData.length,
      uncompressedSize: validatedData.length,
      crc32: crc32
    };

    // Validate file info
    const validatedFileInfo = ZipFileInfoSchema.parse(fileInfo);

    this.files.push(validatedFileInfo);

    // Update offset for next file (header size + filename length + data length)
    this.currentOffset += ZIP_CONSTANTS.LOCAL_FILE_HEADER_SIZE + validatedFileName.length + validatedData.length;

    return validatedFileName;
  }

  /**
   * Generate the final ZIP file buffer
   */
  generate(): Uint8Array {
    // Validate file count
    FileCountSchema.parse(this.files.length);

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const fileOffsets: number[] = [];

    // 1. Write local file headers and data
    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i];

      // Update file offset to current position
      file.offset = totalSize;
      fileOffsets.push(totalSize);

      const header = this.createLocalFileHeader(file, totalSize);

      chunks.push(header);
      totalSize += header.length;

      chunks.push(file.data);
      totalSize += file.data.length;
    }

    // 2. Add padding before central directory
    if (this.alignTo64Bytes) {
      const requiredOffset = Math.ceil(totalSize / ZIP_CONSTANTS.ALIGNMENT_BYTES) * ZIP_CONSTANTS.ALIGNMENT_BYTES;
      const paddingNeeded = requiredOffset - totalSize;
      if (paddingNeeded > 0) {
        const padding = new Uint8Array(paddingNeeded);
        chunks.push(padding);
        totalSize += paddingNeeded;
      }
    }

    // 3. Write central directory
    const centralDirStart = totalSize;
    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i];
      const centralHeader = this.createCentralDirectoryHeader(file, fileOffsets[i]);
      chunks.push(centralHeader);
      totalSize += centralHeader.length;
    }

    // 4. Write end of central directory record
    const endRecord = this.createEndOfCentralDirectoryRecord(centralDirStart, totalSize - centralDirStart);
    chunks.push(endRecord);
    totalSize += endRecord.length;

    // Combine all chunks
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Create local file header (30 bytes + filename + padding)
   */
  private createLocalFileHeader(file: ZipFileInfo, currentOffset: number): Uint8Array {
    const nameBytes = this.encoder.encode(file.name);
    const now = new Date();

    // Calculate base header size (header size + filename)
    const baseHeaderSize = ZIP_CONSTANTS.LOCAL_FILE_HEADER_SIZE + nameBytes.length;
    let extraFieldLength = 0;

    // Add padding to align file data to proper boundary
    if (this.alignTo64Bytes) {
      // Calculate where the file data will start (current offset + complete header)
      const dataStartOffset = currentOffset + baseHeaderSize;
      const requiredOffset = Math.ceil(dataStartOffset / ZIP_CONSTANTS.ALIGNMENT_BYTES) * ZIP_CONSTANTS.ALIGNMENT_BYTES;
      const paddingNeeded = requiredOffset - dataStartOffset;

      if (paddingNeeded > 0) {
        extraFieldLength = paddingNeeded;
      }
    }

    // Total header size including extra field
    const totalHeaderSize = baseHeaderSize + extraFieldLength;

    const header = new Uint8Array(totalHeaderSize);
    const view = new DataView(header.buffer);

    // Local file header signature
    view.setUint32(0, ZIP_CONSTANTS.LOCAL_FILE_HEADER_SIGNATURE, true);

    // Version needed to extract (2.0 for compatibility)
    view.setUint16(4, ZIP_CONSTANTS.VERSION_NEEDED, true);

    // General purpose bit flag
    view.setUint16(6, 0, true);

    // Compression method (0 = stored, no compression)
    view.setUint16(8, ZIP_CONSTANTS.COMPRESSION_STORE, true);

    // Last mod file time
    view.setUint16(10, this.getDosTime(now), true);

    // Last mod file date
    view.setUint16(12, this.getDosDate(now), true);

    // CRC-32
    view.setUint32(14, file.crc32, true);

    // Compressed size
    view.setUint32(18, file.size, true);

    // Uncompressed size
    view.setUint32(22, file.uncompressedSize, true);

    // File name length
    view.setUint16(26, nameBytes.length, true);

    // Extra field length (for padding)
    view.setUint16(28, extraFieldLength, true);

    // Write filename
    header.set(nameBytes, ZIP_CONSTANTS.LOCAL_FILE_HEADER_SIZE);

    // Add padding in extra field if needed
    if (extraFieldLength > 0) {
      header.fill(0, ZIP_CONSTANTS.LOCAL_FILE_HEADER_SIZE + nameBytes.length, ZIP_CONSTANTS.LOCAL_FILE_HEADER_SIZE + nameBytes.length + extraFieldLength);
    }

    return header;
  }

  /**
   * Create central directory header (46 bytes + filename)
   */
  private createCentralDirectoryHeader(file: ZipFileInfo, actualOffset: number): Uint8Array {
    const nameBytes = this.encoder.encode(file.name);
    const now = new Date();

    const header = new Uint8Array(ZIP_CONSTANTS.CENTRAL_DIRECTORY_HEADER_SIZE + nameBytes.length);
    const view = new DataView(header.buffer);

    // Central directory file header signature
    view.setUint32(0, ZIP_CONSTANTS.CENTRAL_DIRECTORY_SIGNATURE, true);

    // Version made by
    view.setUint16(4, ZIP_CONSTANTS.VERSION_MADE_BY, true);

    // Version needed to extract
    view.setUint16(6, ZIP_CONSTANTS.VERSION_NEEDED, true);

    // General purpose bit flag
    view.setUint16(8, 0, true);

    // Compression method
    view.setUint16(10, ZIP_CONSTANTS.COMPRESSION_STORE, true);

    // Last mod file time
    view.setUint16(12, this.getDosTime(now), true);

    // Last mod file date
    view.setUint16(14, this.getDosDate(now), true);

    // CRC-32
    view.setUint32(16, file.crc32, true);

    // Compressed size
    view.setUint32(20, file.size, true);

    // Uncompressed size
    view.setUint32(24, file.uncompressedSize, true);

    // File name length
    view.setUint16(28, nameBytes.length, true);

    // Extra field length
    view.setUint16(30, 0, true);

    // File comment length
    view.setUint16(32, 0, true);

    // Disk number start
    view.setUint16(34, 0, true);

    // Internal file attributes
    view.setUint16(36, 0, true);

    // External file attributes
    view.setUint32(38, 0, true);

    // Relative offset of local header
    view.setUint32(42, actualOffset, true);

    // Write filename
    header.set(nameBytes, ZIP_CONSTANTS.CENTRAL_DIRECTORY_HEADER_SIZE);

    return header;
  }

  /**
   * Create end of central directory record (22 bytes)
   */
  private createEndOfCentralDirectoryRecord(centralDirOffset: number, centralDirSize: number): Uint8Array {
    const record = new Uint8Array(ZIP_CONSTANTS.END_OF_CENTRAL_DIRECTORY_SIZE);
    const view = new DataView(record.buffer);

    // End of central directory signature
    view.setUint32(0, ZIP_CONSTANTS.END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);

    // Number of this disk
    view.setUint16(4, 0, true);

    // Number of the disk with the start of the central directory
    view.setUint16(6, 0, true);

    // Total number of entries in the central directory on this disk
    view.setUint16(8, this.files.length, true);

    // Total number of entries in the central directory
    view.setUint16(10, this.files.length, true);

    // Size of the central directory
    view.setUint32(12, centralDirSize, true);

    // Offset of start of central directory with respect to the starting disk number
    view.setUint32(16, centralDirOffset, true);

    // ZIP file comment length
    view.setUint16(20, 0, true);

    return record;
  }

  /**
   * Generate CRC32 lookup table with caching
   */
  private getCrc32Table(): Uint32Array {
    if (this.crcTable) return this.crcTable;

    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (ZIP_CONSTANTS.CRC32_POLYNOMIAL ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0; // Ensure unsigned 32-bit
    }
    this.crcTable = table;
    return table;
  }

  /**
   * Calculate CRC32 checksum with debugging and validation
   */
  private calculateCrc32(data: Uint8Array): number {
    const crcTable = this.getCrc32Table();
    let crc = ZIP_CONSTANTS.CRC32_INITIAL;

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    const result = (crc ^ ZIP_CONSTANTS.CRC32_INITIAL) >>> 0;

    // Validate against external library
    const libraryCrc = crc32.buf(data) >>> 0;

    if (result !== libraryCrc) {
      console.warn(`[UsdzZipWriter] CRC32 mismatch for ${data.length} bytes! Using library value.`);
      return libraryCrc;
    }

    // Validate CRC32
    const validatedCrc32 = Crc32Schema.parse(result);

    // Validate empty file CRC32
    if (data.length === 0) {
      console.assert(validatedCrc32 === 0, `[UsdzZipWriter] Empty file CRC32 should be 0, got 0x${validatedCrc32.toString(16)}`);
    }

    return validatedCrc32;
  }

  /**
   * Convert Date to DOS time format
   */
  private getDosTime(date: Date): number {
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    return DosTimeSchema.parse(dosTime);
  }

  /**
   * Convert Date to DOS date format
   */
  private getDosDate(date: Date): number {
    const dosDate = ((date.getFullYear() - ZIP_CONSTANTS.DOS_YEAR_OFFSET) << 9) | ((date.getMonth() + ZIP_CONSTANTS.DOS_MONTH_OFFSET) << 5) | date.getDate();
    return DosDateSchema.parse(dosDate);
  }
}
