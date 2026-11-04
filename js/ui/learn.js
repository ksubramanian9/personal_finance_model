import { h } from './dom.js';
import { fill } from './learnText.js';

const CONFIDENCE = { high: 'high confidence', medium: 'medium confidence', low: 'low confidence' };

// The Learn dialog: an index of reference pages, and one page at a time. A native dialog, like About, so it
// traps focus, closes on Escape and leaves the game underneath exactly as it was. Nothing opens it but the
// player. `learn` is { index, pages } from loadLearn; `values` are the game's own numbers (see learnText.js).
export function createLearn({ index, pages }, values = {}) {
  const text = (t) => fill(t, values);
  const dialog = h('dialog', { class: 'about learn', 'aria-labelledby': 'learn-title' });

  const closeButton = () => h('button', { class: 'btn small', type: 'button', text: 'Close', onClick: () => close() });
  const paragraphs = (list) => list.map(t => h('p', { text: text(t) }));
  const bullets = (list) => list.length > 0 && h('ul', {}, list.map(t => h('li', { text: text(t) })));
  const fold = (title, ...children) => h('details', { class: 'learn-fold' }, h('summary', { text: title }), children.flat(Infinity));

  function sourceLine(p) {
    return h('p', { class: 'hint learn-source' },
      `Source: ${p.basis.replace(/\.$/, '')} (${CONFIDENCE[p.confidence] ?? p.confidence}, ${p.asOf}). `,
      p.url && h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open the source' }));
  }

  function indexView() {
    return [
      h('h2', { id: 'learn-title', text: index.title }),
      h('p', { text: index.intro }),
      h('ul', { class: 'learn-list' }, index.pages.map(p => h('li', {},
        h('button', { class: 'learn-item', type: 'button', onClick: () => show(p.id) },
          h('span', { class: 'learn-emoji', 'aria-hidden': 'true', text: p.emoji }),
          h('span', { class: 'learn-item-title', text: p.title }),
          h('span', { class: 'learn-item-blurb', text: p.blurb }))))),
    ];
  }

  function pageView(page) {
    return [
      h('button', { class: 'link-button learn-back', type: 'button', text: '← All topics', onClick: () => show(null) }),
      h('h2', { id: 'learn-title', text: `${page.emoji} ${page.title}` }),
      h('p', { class: 'learn-short', text: text(page.short) }),
      fold('How it works', paragraphs(page.how.paragraphs), bullets(page.how.bullets)),
      h('section', { class: 'learn-decide' },
        h('h3', { text: 'What to decide' }),
        paragraphs(page.decide.paragraphs), bullets(page.decide.bullets),
        page.decide.notes.length > 0 && h('ul', { class: 'learn-notes' }, page.decide.notes.map(n =>
          h('li', {}, h('strong', { text: `${n.who}: ` }), text(n.text))))),
      fold('Common traps', bullets(page.traps)),
      fold('India, as of 2026', page.india.map(item => h('div', { class: 'learn-fact' },
        h('p', { text: text(item.text) }), sourceLine(item.provenance)))),
      h('section', { class: 'learn-game' },
        h('h3', { text: 'How this game treats it' }),
        paragraphs(page.game.paragraphs), bullets(page.game.bullets)),
      h('p', { class: 'hint', text: 'General information to help you think, not financial or tax advice.' }),
    ];
  }

  // Draws the index (pageId null) or one page, with focus at the top and the Close button at the bottom.
  function show(pageId) {
    const page = pageId && pages[pageId];
    // Skip anything that is not a node (a false from `cond && el`), which the DOM would print as the word "false".
    dialog.replaceChildren(...[...(page ? pageView(page) : indexView()), h('div', { class: 'actions inline' }, closeButton())]
      .flat(Infinity).filter(c => c != null && c !== false));
    const heading = dialog.querySelector?.('h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus?.(); }
    if (dialog.scrollTo) dialog.scrollTo(0, 0);
  }

  const close = () => { if (dialog.close) dialog.close(); else dialog.removeAttribute?.('open'); };
  // open() shows the index; open('health-insurance') goes straight to that page.
  const open = (pageId = null) => {
    if (dialog.showModal) { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
    show(pageId);
  };
  // Which page, if any, belongs to a decision card: { id, title } or null.
  const pageFor = (decisionId) => {
    const id = index.decisions[decisionId];
    return id && pages[id] ? { id, title: pages[id].title } : null;
  };

  return { element: dialog, open, close, pageFor };
}
