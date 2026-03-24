//*** Pqrsers.js - Як ми розпізнаємо код? ***


function smartEngineeringParser(input) {

  const drawing = parseDrawingLineV3(input);
  if (drawing) return drawing;;
  
  if (!input) return null;

  input = input.toUpperCase().trim();

  // пробіли → дефіс
  input = input.replace(/\s+/g, "-");

  // латиниця → кирилиця
  input = input.replace(/A/g, 'А');
  input = input.replace(/Х/g, 'X');

  // нормалізація ВР-1
  input = input.replace(/ВР-?1/g, "ВР1");

  const match = input.match(/^(\d+)(А1|А2|А3|ВР1)(?:-(\d+))?$/);

  if (!match) return null;

  const diameter = Number(match[1]);
  const rebarClass = match[2];
  const length = match[3] ? Number(match[3]) : null;

  const weightPerM = (diameter * diameter) / 162;
  const weightRounded = Number(weightPerM.toFixed(3));

  if (length) {

    const totalWeight =
      Number(((length / 1000) * weightPerM).toFixed(3));

    return {
      detected: true,
      type: "part",
      category: "Стержень",
      profileType: "rebar",
      baseUnit: "шт",
      diameter: diameter,
      class: rebarClass,
      length: length,
      weightPerUnit: totalWeight,
      code: `R${diameter}-${length}`,
      name: `Стержень ${rebarClass} Ø${diameter} L=${length} мм`
    };
  }

  return {
    detected: true,
    type: "material",
    category: "Арматура",
    profileType: "rebar",
    baseUnit: "м",
    diameter: diameter,
    class: rebarClass,
    weightPerUnit: weightRounded,
    code: `Ø${diameter}${rebarClass}`,
    name: `Арматура ${rebarClass} Ø${diameter}`
  };
}

function classifyByPrefix(input) {

  if (!input) return null;

  const parts = input.trim().split(/\s+/);

  const rawCode = parts[0];
  const restRaw = parts.slice(1).join(" ");

  const upperCode = normalizeCode(rawCode);

  // ===== 1️⃣ REBAR =====
  if (upperCode.startsWith("ГС") || upperCode.startsWith("ОС")) {

    const result = {
      detected: true,
      type: "part",
      category: "Стержень гнутий",
      profileType: "rebar",
      baseUnit: "шт",
      code: upperCode,
      name: `Стержень гнутий ${upperCode}`
    };

    if (restRaw) {

      const clean = normalizeCode(restRaw)
        .replace(/[\/xX×]/g, "_")
        .replace(/-/g, "_")
        .replace(/\s+/g, "");

      const match = clean.match(/^(\d+)(А1|А2|А3|ВР1)_?(\d+)?$/);

      if (match) {

        const diameter = Number(match[1]);
        const rebarClass = match[2];
        const length = match[3] ? Number(match[3]) : null;

        result.diameter = diameter;
        result.class = rebarClass;

        if (length) {
          result.length = length;

          const weightPerM = (diameter * diameter) / 162;
          result.weightPerUnit =
            Number(((length / 1000) * weightPerM).toFixed(3));
        }
      }
    }

    return result;
  }

  // ===== 2️⃣ FLAT / ANGLE =====
  if (restRaw) {

    const clean = restRaw
      .replace(/[xX×]/g, "х")
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .trim();

    const match = clean.match(/^(\d+)\s*х\s*(\d+)\s+(\d+)$/);

    if (match) {
      const width = Number(match[1]);
      const second = Number(match[2]);
      const length = Number(match[3]);

      let profileType;
      let category;

      if (second <= 20) {
        profileType = "flat";
        category = "Деталь з полоси";
      } else {
        profileType = "angle";
        category = "Деталь з кутника";
      }

      const result = {
        detected: true,
        type: "part",
        category: category,
        profileType: profileType,
        baseUnit: "шт",
        code: upperCode,
        name: `Деталь ${upperCode}`,
        width: width,
        thickness: second,
        length: length
      };

      // розрахунок ваги
      const density = STEEL_DENSITY;
      const volume =
        (width / 1000) *
        (second / 1000) *
        (length / 1000);

      result.weightPerUnit =
        Number((volume * density).toFixed(3));

      return result;

    }
  }

  return null;
}

function parseDrawingLine(line){

  if (!line) return null;

  let txt = line.toUpperCase();

  // нормалізація
  txt = txt.replace(/Ø/g,"");
  txt = txt.replace(/А-І{3}/g,"А3");
  txt = txt.replace(/А-ІІ/g,"А2");
  txt = txt.replace(/А-І/g,"А1");
  txt = txt.replace(/ВР-?1/g,"ВР1");

  // прибираємо текст
  txt = txt.replace(/АРМАТУРА/g,"");

  // шукаємо
  const diameterMatch = txt.match(/(\d+)\s*(А1|А2|А3|ВР1)/);

  const lengthMatch = txt.match(/L\s*=\s*(\d+)/);

  if (!diameterMatch || !lengthMatch) return null;

  const diameter = Number(diameterMatch[1]);
  const rebarClass = diameterMatch[2];
  const length = Number(lengthMatch[1]);

  const weightPerM = (diameter * diameter) / 162;

  const weightPerUnit =
    Number(((length / 1000) * weightPerM).toFixed(3));

  return {

    detected: true,
    type: "part",
    category: "Стержень",
    profileType: "rebar",
    baseUnit: "шт",

    diameter: diameter,
    class: rebarClass,
    length: length,

    weightPerUnit: weightPerUnit,

    code: `R${diameter}-${length}`,
    name: `Стержень ${rebarClass} Ø${diameter} L=${length} мм`

  };

}

function parseDrawingLineV3(line){

  if (!line) return null;

  let txt = line.toUpperCase();

  txt = txt.replace(/Ø/g,"");
  txt = txt.replace(/,/g,"");
  txt = txt.replace(/\s+/g," ");

  // ===== REBAR =====

  let rebar = txt.match(/(\d+)\s*(А-?І{1,3}|ВР-?1).+L\s*=\s*(\d+)/);

  if (rebar){

    let diameter = Number(rebar[1]);
    let cls = rebar[2];
    let length = Number(rebar[3]);

    cls = cls
      .replace("А-І","А1")
      .replace("А-ІІ","А2")
      .replace("А-ІІІ","А3")
      .replace("ВР-1","ВР1");

    const weightPerM = (diameter * diameter) / 162;

    return {
      detected:true,
      type:"part",
      category:"Стержень",
      profileType:"rebar",
      baseUnit:"шт",

      diameter:diameter,
      class:cls,
      length:length,

      weightPerUnit:Number(((length/1000)*weightPerM).toFixed(3)),

      code:`R${diameter}-${length}`,
      name:`Стержень ${cls} Ø${diameter} L=${length} мм`
    };

  }

  // ===== FLAT BAR =====

  let flat = txt.match(/ПОЛОСА\s*(\d+)[ХX](\d+).+L\s*=\s*(\d+)/);

  if (flat){

    const width = Number(flat[1]);
    const thickness = Number(flat[2]);
    const length = Number(flat[3]);

    const density = 7850;

    const volume =
      (width/1000) *
      (thickness/1000) *
      (length/1000);

    return {

      detected:true,
      type:"part",
      category:"Деталь з полоси",
      profileType:"flat",
      baseUnit:"шт",

      width:width,
      thickness:thickness,
      length:length,

      weightPerUnit:Number((volume*density).toFixed(3)),

      code:`FL${width}x${thickness}-${length}`,
      name:`Полоса ${width}x${thickness} L=${length}`

    };

  }

  // ===== ANGLE =====

  let angle = txt.match(/КУТНИК\s*(\d+)[ХX](\d+).+L\s*=\s*(\d+)/);

  if (angle){

    const a = Number(angle[1]);
    const b = Number(angle[2]);
    const length = Number(angle[3]);

    return {

      detected:true,
      type:"part",
      category:"Деталь з кутника",
      profileType:"angle",
      baseUnit:"шт",

      width:a,
      thickness:b,
      length:length,

      code:`AN${a}x${b}-${length}`,
      name:`Кутник ${a}x${b} L=${length}`

    };

  }

  return null;

}

function parseEngineeringLine(line){

  if (!line) return null;

  line = line.trim();

  // ---------- REBAR ----------
  if (line.includes("Арматура")){

    const match = line.match(/Ø?\s*(\d+)\s*([АA]\-?[IVX0-9]+|Вр\-?1).*L\s*=\s*(\d+)/i);

    if (!match) return null;

    const diameter = Number(match[1]);
    const rebarClass = match[2].replace("-", "");
    const length = Number(match[3]);

    const weightPerM = (diameter * diameter) / 162;

    return {
      detected: true,
      profileType: "rebar",
      diameter: diameter,
      class: rebarClass,
      length: length,
      weightPerUnit: Number(((length/1000)*weightPerM).toFixed(3))
    };
  }

  // ---------- FLAT ----------
  if (line.toLowerCase().includes("полоса")){

    const match = line.match(/(\d+)\s*х\s*(\d+).*L\s*=\s*(\d+)/i);

    if (!match) return null;

    const width = Number(match[1]);
    const thickness = Number(match[2]);
    const length = Number(match[3]);

    const density = 7850;

    const volume =
      (width/1000) *
      (thickness/1000) *
      (length/1000);

    return {
      detected: true,
      profileType: "flat",
      width: width,
      thickness: thickness,
      length: length,
      weightPerUnit: Number((volume*density).toFixed(3))
    };
  }

  // ---------- ANGLE ----------
  if (line.toLowerCase().includes("кутник")){

    const match = line.match(/(\d+)\s*х\s*(\d+).*L\s*=\s*(\d+)/i);

    if (!match) return null;

    const width = Number(match[1]);
    const second = Number(match[2]);
    const length = Number(match[3]);

    const density = 7850;

    const volume =
      (width/1000) *
      (second/1000) *
      (length/1000);

    return {
      detected: true,
      profileType: "angle",
      width: width,
      thickness: second,
      length: length,
      weightPerUnit: Number((volume*density).toFixed(3))
    };
  }

  return null;
}