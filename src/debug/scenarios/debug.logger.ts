export function debugTitle(title: string): void {
  Logger.log('');
  Logger.log('========================================');
  Logger.log(title);
  Logger.log('========================================');
}

export function debugFooter(): void {
  Logger.log('========================================');
}

export function debugLine(message: string): void {
  Logger.log(message);
}
