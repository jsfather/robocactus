import { CHAT_FILE_MAX_BYTES } from '../shared/chat-policy.js'
export { CHAT_FILE_MAX_BYTES, CHAT_SESSION_MAX_BYTES } from '../shared/chat-policy.js'

function safeDimensions(width: number, height: number): boolean {
  return width>0 && height>0 && width<=8192 && height<=8192 && width*height<=16_000_000
}

function safeJpeg(buffer: Buffer): boolean {
  if(buffer[0]!==255 || buffer[1]!==216) return false
  let offset=2
  while(offset+4<=buffer.length && offset<1_048_576) {
    if(buffer[offset++]!==255) return false
    while(buffer[offset]===255) offset++
    const marker=buffer[offset++]
    if(marker==null || marker===218 || marker===217 || offset+2>buffer.length) return false
    const length=buffer.readUInt16BE(offset)
    if(length<2 || offset+length>buffer.length) return false
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      return length>=8 && safeDimensions(buffer.readUInt16BE(offset+5),buffer.readUInt16BE(offset+3))
    }
    offset+=length
  }
  return false
}

/** Check declared MIME against a bounded byte signature. Files stay private;
 * PDFs are downloads, never executable inline documents. This is not AV scanning. */
export function chatMediaType(buffer: Buffer, declared: string): string | null {
  if (!buffer.length || buffer.length > CHAT_FILE_MAX_BYTES) return null
  const mime = declared.split(';')[0]?.trim().toLowerCase()
  if (mime === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-') return mime
  if (mime === 'image/jpeg' && safeJpeg(buffer)) return mime
  if (mime === 'image/png' && buffer.length>=33 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.subarray(12,16).toString()==='IHDR' && safeDimensions(buffer.readUInt32BE(16),buffer.readUInt32BE(20))) return mime
  if (mime === 'audio/webm' && buffer.subarray(0,4).equals(Buffer.from([26,69,223,163])) && buffer.subarray(0,4096).includes(Buffer.from('webm'))) return mime
  if (mime === 'audio/ogg' && buffer.subarray(0,4).toString()==='OggS' && buffer.subarray(0,4096).includes(Buffer.from('OpusHead'))) return mime
  if (mime === 'audio/mp4' && buffer.subarray(4,8).toString()==='ftyp' && ['M4A ', 'isom', 'mp42', 'mp41'].includes(buffer.subarray(8,12).toString())) return mime
  return null
}

export function chatFilename(value: string, mime: string): string {
  const extensions: Record<string,string> = { 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a' }
  const base=value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069/\\]/g, '_').replace(/\.[^.]*$/, '').slice(0,140) || 'attachment'
  return `${base}.${extensions[mime] || 'bin'}`
}
