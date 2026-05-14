import { TableRowInput } from '../modules/bom/model/table-row-input.model';
import { normalizeLine, normalizeNumberString } from './normalize';

export function parseTableText(text: string): TableRowInput[] {
  console.log('👉 START parseTableText');
  console.log('TEXT:', text);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  console.log('const lines:', lines);
  const result: TableRowInput[] = [];

  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim());

    let prefix: string | undefined;
    let spec: string | undefined;
    let qty: number | undefined;
    // 1 колонка
    if (parts.length === 1) {
      spec = parts[0];
    }

    // 2 колонки → code | qty
    if (parts.length === 2) {
      // result.push({
      //   codeEl: parts[0],
      //   // qty: Number(parts[1]),
      //   qty: normalizeNumberString(parts[1]),
      // });
      // continue;
      spec = parts[0];
      qty = Number(parts[1]);
    }

    // 3 колонки → prefix | code | qty
    if (parts.length >= 3) {
      // result.push({
      //   prefix: parts[0],
      //   codeEl: parts[1],
      //   qty: normalizeNumberString(parts[2]),
      // });
      // continue;
      prefix = parts[0];
      spec = parts[1];
      qty = Number(parts[2]);
    }

    // 4 колонки → prefix | code | sufix | qty
    // if (parts.length === 4) {
    //   result.push({
    //     prefix: parts[0],
    //     codeEl: parts[1],
    //     sufix: parts[2],
    //     qty: normalizeNumberString(parts[3]),
    //   });
    //   continue;
    // }
    if (!spec) {
      throw new Error(`Invalid row: ${line}`);
    }

    // -------------------------------
    // 🔥 ТУТ ВИКОРИСТОВУЄМО normalize
    // -------------------------------

    const { code, length } = buildElementCode(spec);

    // -------------------------------
    // 🔹 ФОРМУЄМО РЕЗУЛЬТАТ
    // -------------------------------

    result.push({
      prefix,
      codeEl: code, // ✅ уніфікований ключ
      sufix: undefined,
      qty,
      length,
    });
  }

  return result;
}

function buildElementCode(spec: string): {
  code: string;
  length?: number;
} {
  const lengthMatch = spec.match(/L\s*=\s*([\d\s]+)/i);

  const length = lengthMatch
    ? normalizeNumberString(lengthMatch[1])
    : undefined;
  console.log('👉 buildElementCode, spec:', spec);
  // 🔹 1. нормалізуємо
  const normalized = normalizeLine(spec);
  // приклад: "12 А500С 2890"
  console.log('🔹 normalizeLine(spec):', normalized);
  const parts = normalized.split(' ');

  if (parts.length < 2) {
    throw new Error(`Invalid spec: ${spec}`);
  }

  // 🔹 2. діаметр
  const diameter = parts[0];

  // 🔹 3. клас
  let className = parts[1].replace('А', 'A').replace('С', 'C');

  // // 🔹 4. довжина (якщо є)
  // let length: number | undefined;

  // if (parts[2]) {
  //   length = normalizeNumberString(parts[2]);
  // }
  console.log('🔹 length:', length);
  // 🔹 5. формуємо код матеріалу
  let code = `R_${diameter}_${className}`;

  // 🔹 6. додаємо довжину
  if (length) {
    code += `, L=${length}`;
  }

  return { code, length };
}
