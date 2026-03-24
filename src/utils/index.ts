import { register } from '../core/register';
import { addElement } from '../modules/elements/element.service';
import { test_addElement } from '../services/test/test';
import { openForm } from '../ui/openForm';
import { onOpen } from '../main';

register({
  addElement,
  openForm,
  onOpen,
});
