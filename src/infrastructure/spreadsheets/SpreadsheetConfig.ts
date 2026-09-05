import { SpreadsheetKey } from './SpreadsheetKey';
import { SpreadsheetInfo } from './SpreadsheetInfo';

export const SpreadsheetConfig: Record<SpreadsheetKey, SpreadsheetInfo> = {
  MASTER: {
    key: SpreadsheetKey.MASTER,
    id: SpreadsheetApp.getActiveSpreadsheet().getId(),
    title: 'ERP_KUB_MASTER',
  },

  OPERATIONAL: {
    key: SpreadsheetKey.OPERATIONAL,
    id: '1zH8Zia-McjfBAWnghc6vkSetbgxn96xpRPi57rJ46uo',
    title: 'КУБ_Оперативний_облік',
  },

  REPORTING: {
    key: SpreadsheetKey.REPORTING,
    id: '1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc',
    title: 'КУБ_Звітність',
  },
};
