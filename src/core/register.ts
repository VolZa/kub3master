export function register(functions: Record<string, Function>) {
  Object.entries(functions).forEach(([name, fn]) => {
    const target = globalThis as any;
    target.__kubGasHandlers_ ??= {};
    target.__kubGasHandlers_[name] = fn;
  });
}
