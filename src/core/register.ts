export function register(functions: Record<string, Function>) {
  Object.entries(functions).forEach(([name, fn]) => {
    (globalThis as any)[name] = fn;
  });
}
