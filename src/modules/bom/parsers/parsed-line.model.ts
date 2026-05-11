import { ParsedSpec } from '../model/parsed-spec.model';

export type ParsedLine = {
  spec: ParsedSpec;
  qty: number;
  raw: string;

  // 🔥 опціонально
  name?: string;
  code?: string;
};
