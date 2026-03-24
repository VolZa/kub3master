//*** ElementsService.gs  - Як ми зберігаємо елемент? ***


//Додавання нового елемента на лист
function addElement(data) {

  const newId = addElementCore(data);

  return "✅ Додано ID: " + newId;
}

function addElementAndReturnId(data){

  const id = generateIdByType(data.type);

  const sheet = getSheetByNameSafe("00_Elements");

  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h,i)=>map[h]=i);

  const row = new Array(headers.length).fill("");

  row[map["ID"]] = id;
  row[map["Code"]] = data.code;
  row[map["Name"]] = data.name;
  row[map["Type"]] = data.type;
  row[map["Category"]] = data.category || "";
  row[map["BaseUnit"]] = data.unit || "шт";
  row[map["ProfileType"]] = data.profileType || "";

  row[map["CreatedAt"]] = new Date();

  sheet.appendRow(row);

  return id;
}

function addElementCore(data) {

  const sheet = getSheetByNameSafe('00_Elements');
  const newId = generateIdByType(data.type);

  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const row = new Array(headers.length).fill("");

  const map = {};
  headers.forEach((h,i) => map[h] = i);

  let parentMaterialId = "";

  if (data.profileType === "rebar" && data.type === "part") {
    parentMaterialId = getOrCreateRebarMaterial(
      Number(data.diameter),
      data.class
    );
  }

  row[map["ID"]] = newId;
  row[map["Code"]] = data.code;
  row[map["Name"]] = data.name;
  row[map["Type"]] = data.type;
  row[map["Category"]] = data.category || "";
  row[map["BaseUnit"]] = data.unit;
  row[map["ProfileType"]] = data.profileType || "";
  row[map["ParentMaterialID"]] = parentMaterialId;
  row[map["Diameter"]] = data.diameter || "";
  row[map["Class"]] = data.class || "";
  row[map["Width"]] = data.width || "";
  row[map["Length"]] = data.length || "";
  row[map["Thickness"]] = data.thickness || "";
  row[map["IsActive"]] = true;
  row[map["ParentType"]] = "";
  row[map["WeightPerUnit"]] =
    data.weightPerUnit ? Number(data.weightPerUnit) : "";
  row[map["Density"]] = data.density || "";
  row[map["Comment"]] = data.comment || "";
  row[map["CreatedAt"]] = new Date();

  sheet.appendRow(row);

  return newId;
}


//Функція пошуку або створення material
function getOrCreateRebarMaterial(diameter, rebarClass) {

  const sheet = getSheetByNameSafe('00_Elements');
  const data = sheet.getDataRange().getValues();

  const headers = data[0];

  const map = getHeaderMap(sheet);
  // headers.forEach((h,i) => map[h] = i);

  const materialCode = `Ø${diameter}${rebarClass}`;

  // ===== Пошук через map =====
  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    const id = row[map["ID"]];
    const code = row[map["Code"]];
    const type = row[map["Type"]];

    if (type === "material" && code === materialCode) {
      return id;
    }
  }

  // ===== Створення =====
  const newId = generateIdByType("material");
  const weightPerM = Number(((diameter * diameter) / 162).toFixed(3));

  const newRow = new Array(headers.length).fill("");

  newRow[map["ID"]] = newId;
  newRow[map["Code"]] = materialCode;
  newRow[map["Name"]] = `Арматура ${rebarClass} Ø${diameter}`;
  newRow[map["Type"]] = "material";
  newRow[map["Category"]] = "Арматура";
  newRow[map["BaseUnit"]] = "м";
  newRow[map["ProfileType"]] = "rebar";
  newRow[map["Diameter"]] = diameter;
  newRow[map["Class"]] = rebarClass;
  newRow[map["IsActive"]] = true;
  newRow[map["WeightPerUnit"]] = weightPerM;
  newRow[map["Density"]] = 7850;
  newRow[map["CreatedAt"]] = new Date();

  sheet.appendRow(newRow);

  const lastRow = sheet.getLastRow();

  if (map["WeightPerUnit"] !== undefined) {
    sheet.getRange(
      lastRow,
      map["WeightPerUnit"] + 1
    ).setNumberFormat("0.000");
  }

  return newId;
}

function findElementByCode(code) {

  const sheet = getSheetByNameSafe('00_Elements');
  const data = sheet.getDataRange().getValues();

  const headers = data[0];
  const map = {};
  headers.forEach((h,i) => map[h] = i);

  for (let i = 1; i < data.length; i++) {
    if (data[i][map["Code"]] === code) {
      return {
        id: data[i][map["ID"]],
        code: data[i][map["Code"]]
      };
    }
  }

  return null;
}

function createPartFromParsed(parsed) {

  const newId = addElementCore({
    type: "part",
    code: parsed.code,
    name: parsed.name,
    category: parsed.category,
    unit: parsed.baseUnit,
    profileType: parsed.profileType,
    diameter: parsed.diameter,
    class: parsed.class,
    length: parsed.length,
    weightPerUnit: parsed.weightPerUnit
  });

  return {
    id: newId,
    code: parsed.code
  };
}

function getOrCreatePart(parsed) {

  const sheet = getSheetByNameSafe('00_Elements');
  const data = sheet.getDataRange().getValues();

  const headers = data[0];
  const map = {};
  headers.forEach((h,i) => map[h] = i);

  // 1️⃣ шукаємо існуючий part
  for (let i = 1; i < data.length; i++) {

    if (
      data[i][map["Type"]] === "part" &&
      data[i][map["Diameter"]] == parsed.diameter &&
      data[i][map["Class"]] == parsed.class &&
      data[i][map["Length"]] == parsed.length
    ) {
      return {
        id: data[i][map["ID"]],
        code: data[i][map["Code"]]
      };
    }
  }

  // 2️⃣ якщо не знайдено — створюємо
  return createPartFromParsed(parsed);
}

function createAssemblyIfMissing(code) {

  const existing = findElementByCode(code);

  if (existing) return existing.id;

  const newId = addElementAndReturnId({
    type: "assembly",
    code: code,
    name: "Виріб " + code,
    category: "Виріб",
    unit: "шт"
  });

  return newId;
}

function testBOM() {

  addBOMSmart("КП-1", "12А3 1015", 1);
  addBOMSmart("КП-1", "4Вр1 340", 1);

}