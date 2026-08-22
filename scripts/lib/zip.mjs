// =====================================================================
// Leitor de ZIP mínimo, sem dependências externas.
// Suporta os dois métodos que o TSE usa: store (0) e deflate (8),
// incluindo ZIP64 para arquivos grandes.
// =====================================================================

import { inflateRawSync } from "node:zlib";

const FIM_DIRETORIO = 0x06054b50;
const FIM_DIRETORIO_64 = 0x06064b50;
const ENTRADA_DIRETORIO = 0x02014b50;

function acharEocd(buf) {
  const minimo = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= minimo; i--) {
    if (buf.readUInt32LE(i) === FIM_DIRETORIO) return i;
  }
  throw new Error("Arquivo ZIP inválido: fim do diretório central não encontrado.");
}

/** Lista as entradas do ZIP: [{ nome, offset, metodo, tamanhoComprimido, tamanho }] */
export function listarZip(buf) {
  const eocd = acharEocd(buf);
  let total = buf.readUInt16LE(eocd + 10);
  let inicio = buf.readUInt32LE(eocd + 16);

  // ZIP64: os campos de 32 bits vêm saturados
  if (inicio === 0xffffffff || total === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) === FIM_DIRETORIO_64) {
        total = Number(buf.readBigUInt64LE(i + 32));
        inicio = Number(buf.readBigUInt64LE(i + 48));
        break;
      }
    }
  }

  const entradas = [];
  let p = inicio;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== ENTRADA_DIRETORIO) break;

    const metodo = buf.readUInt16LE(p + 10);
    let tamanhoComprimido = buf.readUInt32LE(p + 20);
    let tamanho = buf.readUInt32LE(p + 24);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComentario = buf.readUInt16LE(p + 32);
    let offset = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + tamNome);

    // Campo extra ZIP64 (id 0x0001) quando algum valor está saturado
    if (tamanho === 0xffffffff || tamanhoComprimido === 0xffffffff || offset === 0xffffffff) {
      let e = p + 46 + tamNome;
      const fim = e + tamExtra;
      while (e + 4 <= fim) {
        const id = buf.readUInt16LE(e);
        const tam = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (tamanho === 0xffffffff) { tamanho = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (tamanhoComprimido === 0xffffffff) { tamanhoComprimido = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (offset === 0xffffffff) { offset = Number(buf.readBigUInt64LE(q)); }
          break;
        }
        e += 4 + tam;
      }
    }

    entradas.push({ nome, offset, metodo, tamanhoComprimido, tamanho });
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return entradas;
}

/** Extrai uma entrada e devolve o Buffer com o conteúdo bruto. */
export function extrairZip(buf, entrada) {
  const tamNome = buf.readUInt16LE(entrada.offset + 26);
  const tamExtra = buf.readUInt16LE(entrada.offset + 28);
  const inicio = entrada.offset + 30 + tamNome + tamExtra;
  const bruto = buf.subarray(inicio, inicio + entrada.tamanhoComprimido);

  if (entrada.metodo === 0) return Buffer.from(bruto);
  if (entrada.metodo === 8) return inflateRawSync(bruto);
  throw new Error(`Método de compressão ${entrada.metodo} não suportado (${entrada.nome}).`);
}
