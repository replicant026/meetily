import { Transcript } from '@/types';

export type TranscriptExportFormat = 'markdown' | 'docx';

export interface TranscriptExportMetadata {
  title: string;
  createdAt?: string;
}

function formatTimestamp(segment: Transcript): string {
  if (segment.audio_start_time === undefined) return segment.timestamp;
  const totalSeconds = Math.max(0, Math.floor(segment.audio_start_time));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
}

function formatDate(createdAt?: string): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : date.toISOString().slice(0, 10);
}

function formatSegment(segment: Transcript): string {
  const speaker = segment.speaker ? `[${segment.speaker}] ` : '';
  return `${formatTimestamp(segment)} ${speaker}${segment.text}`;
}

export function formatTranscriptMarkdown(
  segments: Transcript[],
  metadata: TranscriptExportMetadata,
): string {
  const date = formatDate(metadata.createdAt);
  const lines = [`# Transcript: ${metadata.title}`];
  if (date) lines.push(`Date: ${date}`);
  lines.push('', ...segments.map(formatSegment), '');
  return lines.join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text: string, bold = false): string {
  const runProperties = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p><w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function createDocumentXml(segments: Transcript[], metadata: TranscriptExportMetadata): string {
  const date = formatDate(metadata.createdAt);
  const paragraphs = [paragraph(`Transcript: ${metadata.title}`, true)];
  if (date) paragraphs.push(paragraph(`Date: ${date}`));
  paragraphs.push(...segments.map((segment) => paragraph(formatSegment(segment))));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function createDocx(segments: Transcript[], metadata: TranscriptExportMetadata): Uint8Array {
  const encoder = new TextEncoder();
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', createDocumentXml(segments, metadata)],
  ].map(([name, content]) => ({ name, bytes: encoder.encode(content) }));

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const local = concatBytes([
      uint32(0x04034b50), uint16(20), uint16(0x800), uint16(0), uint16(0), uint16(0),
      uint32(checksum), uint32(file.bytes.length), uint32(file.bytes.length),
      uint16(name.length), uint16(0), name, file.bytes,
    ]);
    localParts.push(local);

    centralParts.push(concatBytes([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0x800), uint16(0), uint16(0), uint16(0),
      uint32(checksum), uint32(file.bytes.length), uint32(file.bytes.length), uint16(name.length),
      uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name,
    ]));
    offset += local.length;
  }

  const localDirectory = concatBytes(localParts);
  const centralDirectory = concatBytes(centralParts);
  const end = concatBytes([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
    uint32(centralDirectory.length), uint32(localDirectory.length), uint16(0),
  ]);
  return concatBytes([localDirectory, centralDirectory, end]);
}

function safeFileName(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'transcript';
}

export function downloadTranscript(
  segments: Transcript[],
  metadata: TranscriptExportMetadata,
  format: TranscriptExportFormat,
): void {
  const baseName = safeFileName(metadata.title);
  const isDocx = format === 'docx';
  const content = isDocx
    ? createDocx(segments, metadata)
    : formatTranscriptMarkdown(segments, metadata);
  const blobContent: BlobPart = typeof content === 'string'
    ? content
    : content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  const blob = new Blob([blobContent], {
    type: isDocx
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.${isDocx ? 'docx' : 'md'}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}