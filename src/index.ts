import { register } from './core/register';
import { addElement } from './services/element.service';
import { test_addElement } from './services/test/test';
import { openForm, onOpen } from './ui/openForm';

register({
  addElement,
  openForm,
  onOpen,
});
