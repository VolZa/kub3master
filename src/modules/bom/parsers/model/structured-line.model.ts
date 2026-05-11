export interface StructuredLine {
  prefix: string;
  code: string;
  suffix?: string;
  qty: number;

  // optional технічні поля
  baseUnit?: string;
  length?: number;
}
