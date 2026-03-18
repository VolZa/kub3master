import { debug } from '../utils/debug';

export function _addElement(data: any): string {
  return 'OK';
}

export const addElement = debug('addElement', _addElement);
