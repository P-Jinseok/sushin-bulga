// 공개 배포본의 장면 가림막 인코딩 (지시서 #14). 비밀 보호가 아니라 파일을 우연히 열었을 때 바로 읽히지 않게 하는 용도다.
// 형식: UTF-8 바이트 → 고정 키 XOR → Base64 문자열. 브라우저(atob/btoa)와 Node(Buffer) 모두에서 쓴다.

const KEY = new TextEncoder().encode('sushin-bulga/veil');

function xor(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY[i % KEY.length];
  return out;
}

function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const s = atob(text.trim());
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeScene(jsonText) {
  return toBase64(xor(new TextEncoder().encode(jsonText)));
}

export function decodeScene(encodedText) {
  return JSON.parse(new TextDecoder().decode(xor(fromBase64(encodedText))));
}
