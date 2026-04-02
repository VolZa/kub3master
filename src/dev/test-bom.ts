import { parseSpec } from '../modules/bom/parsers/parseSpec';
import { getOrCreateElement } from '../modules/elements/element.factory';
import { MockElementRepository } from '../modules/elements/mock/mock.element.repository';

export function testBOM() {
  const repo = new MockElementRepository();

  const inputs = [
    'Арматура ø6 А500С, L=145',
    'Кутник L 100x63x8, L=440',
    'Пластина 200x100x10',
  ];

  for (const input of inputs) {
    console.log('INPUT:', input);

    const spec = parseSpec(input);

    console.log('SPEC:', spec);

    try {
      const element = getOrCreateElement(spec, repo);
      console.log('ELEMENT:', element);
    } catch (e) {
      if (e instanceof Error) {
        console.error('ERROR:', e.message);
      } else {
        console.error('ERROR:', e);
      }
    }

    console.log('--------------');
  }
}

// main();

// import { parseSpec } from '../modules/bom/bom.parser';
// import { getOrCreateElement } from '../modules/elements/element.factory';

// function main() {
//   const inputs = [
//     'A500C Ø12 L=6000',
//     'Кутник 75x50x6',
//     'Пластина 200x100x10',
//     'Щось невідоме',
//   ];

//   for (const input of inputs) {
//     console.log('INPUT:', input);

//     const spec = parseSpec(input);

//     console.log('SPEC:', spec);

//     //Закоментувати для тестування створення елементів
//     try {
//       const element = getOrCreateElement(spec);
//       console.log('ELEMENT:', element);
//     } catch (e) {
//       if (e instanceof Error) {
//         console.error('ERROR:', e.message);
//       } else {
//         console.error('ERROR:', e);
//       }
//     }

//     console.log('--------------');
//   }
// }

// main();

// import { parseSpec } from '../modules/bom/bom.parser';

// function main() {
//   const inputs = [
//     'A500 Ø12 L=6000',
//     'Кутник 75x50x6',
//     'Пластина 200x100x10',
//     'Лист 8мм',
//     'Полоса 40x5',
//     'Пластина 300х150х12',
//   ];

//   for (const input of inputs) {
//     const result = parseSpec(input);
//     console.log(input, result);
//   }
// }

// main();

// import { generateBOM } from '../modules/bom/generateBOM';
// import { MockRecipeSource } from '../modules/bom/mock/MockRecipeSource';

// function main() {
//   const input = {
//     houseId: 'KUB_1',
//     elements: ['PLATE_1'],
//   };

//   const source = new MockRecipeSource();

//   const result = generateBOM(input, source);

//   console.log(result);
// }

// main();

// import { generateBOM } from '../modules/bom/generateBOM';
// import { MockRecipeSource } from '../modules/bom/mock/MockRecipeSource';

// function main() {
//   const input = {
//     houseId: 'KUB_1',
//     elements: ['PLATE_1'],
//   };

//   const result = generateBOM(input);

//   console.log(JSON.stringify(result, null, 2));
// }

// main();
