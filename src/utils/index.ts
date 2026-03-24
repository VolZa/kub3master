// import { register } from './src/core/register';
// // import { addElement } from '../modules/elements/element.service';
// // import { test_addElement } from '../services/test/test';
// import { openForm } from './src/ui/openForm';
// import { onOpen } from './src/main';
// export * from './main';
// register({
//   // addElement,
//   openForm,
//   onOpen,
// });
import { register } from '../core/register';
import { openForm } from '../ui/openForm';
import { onOpen } from '../main';

register({
  openForm,
  onOpen,
});
