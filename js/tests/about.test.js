import { test, assert, assertEqual } from './harness.js';
import { installFakeDom, findAll } from './fakeDom.js';
import { createAbout } from '../ui/about.js';
import { validate, schemas } from '../data/validate.js';
import { getFetch } from './dataFetch.js';

installFakeDom();
const about = await (await getFetch())('data/about.json').then(r => r.json());

test('about.json matches its schema and says the important things plainly', () => {
  validate(about, schemas.about, 'about.json');
  const text = JSON.stringify(about);
  assert(/not financial, tax or investment advice/.test(text), 'the disclaimer');
  assert(/Nothing leaves your browser/.test(text), 'privacy');
  assert(/Where the numbers come from/.test(text), 'where numbers come from');
  assert(about.sections.length >= 4);
});

test('the About panel is a labelled dialog with every section and a close button', () => {
  const { element } = createAbout(about);
  assertEqual(element.tagName, 'DIALOG');
  assertEqual(element.attrs['aria-labelledby'], 'about-title');
  const headings = findAll(element, n => n.tagName === 'H3').map(n => n.textContent);
  assertEqual(headings, about.sections.map(s => s.heading));
  assert(findAll(element, n => n.tagName === 'BUTTON' && /Close/.test(n.textContent)).length === 1);
  assert(!/undefined|null|NaN|false|\[object/.test(element.textContent), 'no stray words');
});

test('open and close work with or without the native dialog methods', () => {
  const a = createAbout(about);
  a.open();
  assertEqual(a.element.attrs.open, '');
  a.element.showModal = () => { a.element.attrs.modal = 'yes'; };
  a.element.close = () => { delete a.element.attrs.modal; };
  a.open();
  assertEqual(a.element.attrs.modal, 'yes');
  a.close();
  assertEqual(a.element.attrs.modal, undefined);
});
