import { h } from './dom.js';

// The "About this tool" panel: a native dialog, so it traps focus, closes on Escape and leaves the game
// underneath exactly as it was. `about` is data/about.json: { title, sections: [{ heading, paragraphs?, bullets? }] }.
export function createAbout(about) {
  const dialog = h('dialog', { class: 'about', 'aria-labelledby': 'about-title' },
    h('h2', { id: 'about-title', text: about.title }),
    about.sections.map(s => h('section', {},
      h('h3', { text: s.heading }),
      (s.paragraphs ?? []).map(p => h('p', { text: p })),
      s.bullets && h('ul', {}, s.bullets.map(b => h('li', { text: b }))))),
    h('div', { class: 'actions inline' },
      h('button', { class: 'btn small', type: 'button', text: 'Close', onClick: () => close() })));
  const close = () => { if (dialog.close) dialog.close(); else dialog.removeAttribute?.('open'); };
  const open = () => {
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    // Start at the top, not at the Close button (which would scroll a long panel to its end).
    const heading = dialog.querySelector?.('h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus?.(); }
  };
  return { element: dialog, open, close };
}
