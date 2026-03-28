import { generateBOM } from '../modules/bom/generateBOM';

function main() {
  const input = {
    houseId: 'KUB_1',
    elements: ['PLATE_1'],
  };

  const result = generateBOM(input);

  console.log(JSON.stringify(result, null, 2));
}

main();
