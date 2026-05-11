import { ElementType } from '../../../config/config';
export interface Classification {
  type: ElementType;
  category: string;
  baseUnit: string;
  profileType?: string;
}
