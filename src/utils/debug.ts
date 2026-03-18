export function debug(fnName: string, fn: Function) {
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
