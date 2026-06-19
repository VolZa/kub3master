import { ParsedSpec } from '../model/parsed-spec.model';

// export function parseConcrete(input: string): ParsedSpec | null {
//   const match = input.match(/^C\s*(\d+)\s*\/\s*(\d+)(?:\s*(М3|M3))?$/i);

//   if (!match) {
//     return null;
//   }

//   return {
//     kind: 'concrete',
//     className: `${match[1]}_${match[2]}`,
//   };
// }

export function parseConcrete(input: string): ParsedSpec | null {
  console.log('🧱 parseConcrete:', input);

  const match = input.match(/C\s*(\d+)\s*\/\s*(\d+)/i);

  console.log('🧱 concrete match:', match);

  if (!match) {
    return null;
  }

  return {
    kind: 'concrete',
    className: `C${match[1]}/${match[2]}`,
  };
}

// export function parseConcrete(input: string): ParsedSpec | null {
//   console.log('🧱 parseConcrete:', input);

//   const match = input.match(/C\s*(\d+)\s*\/\s*(\d+)/i);

//   if (!match) {
//     return null;
//   }

//   return {
//     kind: 'concrete',
//     className: `C${match[1]}/${match[2]}`,
//   };
// }

// export function parseConcrete(input: string): ParsedSpec | null {
//   const match = input.match(/^C\s*(\d+)\s*\/\s*(\d+)\s*(М3|M3)?$/i);

//   if (!match) {
//     return null;
//   }

//   return {
//     kind: 'concrete',
//     className: `${match[1]}_${match[2]}`,
//   };
// }
