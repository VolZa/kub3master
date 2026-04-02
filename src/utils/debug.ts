// export function debug<T extends (...args: any[]) => any>(
//   fnName: string,
//   fn: T,
// ): T {
//   return function (...args: Parameters<T>): ReturnType<T> {
//     try {
//       console.log(`>>> ${fnName} start`, JSON.stringify(args));

//       const result = fn(...args);

//       console.log(`<<< ${fnName} end`, JSON.stringify(result));

//       return result;
//     } catch (e) {
//       console.error(`XXX ${fnName} error`, e);
//       throw e;
//     }
//   } as T;
// }

export function debug(fnName: string, fn: (...args: any[]) => any) {
  return function (...args: any[]) {
    try {
      console.log(`>>> ${fnName} start`, JSON.stringify(args));

      const result = fn(...args);

      console.log(`<<< ${fnName} end`, JSON.stringify(result));

      return result;
    } catch (e) {
      console.error(`XXX ${fnName} error`, e);
      throw e;
    }
  };
}
