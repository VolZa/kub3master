function addBOMSmart(parentCode, specString, qty) {
  const bomSheet = getSheetByNameSafe('01_BOM');

  qty = Number(qty);
  if (!qty || qty <= 0) {
    return '❌ Qty повинно бути > 0';
  }

  let parent = findElementByCode(parentCode);

  if (!parent) {
    const id = addElementAndReturnId({
      type: 'assembly',
      code: parentCode,
      name: 'Вузол ' + parentCode,
      category: 'assembly',
      unit: 'шт',
    });

    parent = { id: id, code: parentCode };
  }

  const parsed = smartEngineeringParser(specString);

  if (!parsed || !parsed.detected) {
    return '❌ Не вдалося розпізнати специфікацію: ' + specString;
  }

  const child = getOrCreatePart(parsed);

  Logger.log(parent);
  Logger.log(child);

  bomSheet.appendRow([parent.id, child.id, qty, 'шт', new Date()]);

  return '✅ BOM додано';
}

//перенесено в bom.service.ts
function buildBOMFromText(parentCode, specText) {
  const lines = specText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  let added = 0;
  let errors = [];

  for (let line of lines) {
    // - Нормалізація рядка
    line = line.trim();
    line = normalizeCode(line);
    line = line
      .replace(/Арматура/gi, '')
      .replace(/Ø/g, '')
      .replace(/\(.*?\)/g, '') // прибираємо (А-240)
      .replace(/,/g, '')
      .replace(/L\s*=\s*/i, ' ')
      .replace(/А-І\b/g, 'А1')
      .replace(/А-ІІ\b/g, 'А2')
      .replace(/А-ІІІ\b/g, 'А3')
      .replace(/Вр-?1/gi, 'Вр1')
      .replace(/\s+/g, ' ')
      .trim();
    Logger.log(line);
    // --- 1️⃣ інженерний формат ---
    const parts = line.split(/\s+/);

    if (parts.length >= 2 && /^\d/.test(parts[0])) {
      const spec = parts[0] + ' ' + parts[1];
      const qty = parts[2] || 1;

      const res = addBOMSmart(parentCode, spec, qty);

      if (res.startsWith('✅')) added++;
      else errors.push(line);

      continue;
    }

    // --- 2️⃣ текст креслення ---
    const parsed = parseEngineeringLine(line);

    if (parsed && parsed.detected) {
      const spec = parsed.diameter + parsed.class + ' ' + parsed.length;

      const res = addBOMSmart(parentCode, spec, 1);

      if (res.startsWith('✅')) added++;
      else errors.push(line);

      continue;
    }

    // --- якщо нічого не розпізнано ---
    errors.push(line);
  }

  return 'Додано: ' + added + ' | Помилки: ' + errors.length;
}

// function addBOMSmart(parentCode, specString, qty) {

//   const bomSheet = getSheetByNameSafe('01_BOM');

//   qty = Number(qty);
//   if (!qty || qty <= 0) {
//     return "❌ Qty повинно бути > 0";
//   }

//   let parent = findElementByCode(parentCode);

//   if (!parent){

//     const id = addElementAndReturnId({
//       type: "assembly",
//       code: parentCode,
//       name: "Вузол " + parentCode,
//       category: "assembly",
//       unit: "шт"
//     });

//     parent = {
//       id: id,
//       code: parentCode
//     };
//   }
//   // const parent = findElementByCode(parentCode);
//   // if (!parent) {
//   //   return "❌ Parent не знайдено: " + parentCode;
//   // }

//   const parsed = smartEngineeringParser(specString);
//   if (!parsed || !parsed.detected) {
//     return "❌ Не вдалося розпізнати специфікацію";
//   }

//   const child = getOrCreatePart(parsed);

//   bomSheet.appendRow([
//     parent.id,
//     child.id,
//     qty,
//     "шт",
//     new Date()
//   ]);

//   return "✅ BOM додано";
// }

// function buildBOMFromText(parentCode, specText) {
//   Logger.log("Parent: " + parentCode);
//   Logger.log("Text:\n" + specText);
//   const lines = specText
//     .split("\n")
//     .map(l => l.trim())
//     .filter(l => l !== "");
//   Logger.log("Lines: " + JSON.stringify(lines));
//   let added = 0;
//   let errors = [];

//   for (let line of lines) {
//     Logger.log("Processing: " + line);
//     // qty можна задати наприкінці рядка
//     const parts = line.split(/\s+/);

//     let qty = 1;

//     // якщо останнє число — це кількість
//     if (!isNaN(parts[parts.length-1]) && parts.length > 2) {
//       qty = Number(parts.pop());
//     }

//     const spec = parts.join(" ");
//     Logger.log("Spec: " + spec + " qty: " + qty);
//     const res = addBOMSmart(parentCode, spec, qty);
//     Logger.log("Result: " + res);
//     if (res && res.startsWith("✅")) added++;
//     else errors.push(line);

//   }
//   Logger.log("Added: " + added);
//   return "Додано: " + added +
//          " | Помилки: " + errors.length;
// }

// function buildBOMFromDrawing(parentCode, text){

//   const lines = text
//     .split("\n")
//     .map(l => l.trim())
//     .filter(l => l !== "");

//   let added = 0;

//   for (let line of lines){

//     const parsed = parseEngineeringLine(line);

//     if (!parsed) continue;

//     const child = getOrCreatePart(parsed);

//     addBOMSmart(parentCode, parsed.spec || "", 1);

//     added++;
//   }

//   return "Додано: " + added;
// }
