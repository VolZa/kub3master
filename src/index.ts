import { onOpen } from './main';
import { openForm } from './ui/openForm';
import { buildBOMFromText } from './modules/bom/bom.service';

// 🔥 експортуємо в глобал
(globalThis as any).onOpen = onOpen;
(globalThis as any).openForm = openForm;
(globalThis as any).buildBOMFromText = buildBOMFromText;

// import { onOpen } from './main';
// import { openForm } from './ui/openForm';

// // 🔥 просто виклик, без globalThis
// onOpen;
// openForm;
//==========

// import { onOpen } from './main';
// import { openForm } from './ui/openForm';

// (globalThis as any).onOpen = onOpen;
// (globalThis as any).openForm = openForm;
