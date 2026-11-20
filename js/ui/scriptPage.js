import { h, mount } from './dom.js';
import { answersAsText } from './scriptText.js';

// The student script page. Pure rendering: the built script comes from scriptText.js, answers are kept in
// `store` (see storage.js) as the student types, and nothing leaves the device.

const NAME_KEY = '__name'; // the student's name, kept with their answers

// Makes the game links in the text clickable (they are always "index.html?persona=...").
function linkify(text) {
  return text.split(/(index\.html\?[^\s)]+)/).map((part, i) => (i % 2 ? h('a', { href: part, target: '_blank', rel: 'noopener', text: part }) : part));
}

const paragraphs = (lines) => lines.map(line => h('p', {}, linkify(line)));

// A box the student writes in. It grows with what they type, so nothing is hidden when printed.
function promptBox(prompt, answers, save) {
  const area = h('textarea', { id: `answer-${prompt.id}`, rows: '3' });
  area.value = answers[prompt.id] ?? '';
  const grow = () => { if (area.style) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; } };
  area.addEventListener('input', () => { save(prompt.id, area.value); grow(); });
  queueMicrotask?.(grow);
  return h('div', { class: 'answer' },
    h('label', { for: `answer-${prompt.id}`, text: prompt.label }),
    area);
}

function choiceCard(choice) {
  return h('div', { class: 'script-choice' },
    h('p', { class: 'script-choice-head' }, h('strong', { text: choice.question }), ` (${choice.stage}, ${choice.ages})`),
    h('p', { class: 'hint', text: choice.why }),
    h('ul', { class: 'script-options' }, choice.options.map(o => h('li', {}, h('strong', { text: o.title }), ` – ${o.blurb}`))),
    h('p', { class: 'script-weigh-head', text: 'Weigh up:' }),
    h('ul', {}, choice.weigh.map(w => h('li', { text: w }))));
}

const planTable = (plan) => h('details', { class: 'script-plan' },
  h('summary', { text: 'The plan for every other question' }),
  plan.map(s => h('div', {},
    h('h4', { text: `${s.stage} (${s.ages})` }),
    h('ul', {}, s.rows.map(r => h('li', {}, h('strong', { text: `${r.decision}: ` }), r.pick))))));

function facilitatorNote(step, rubric) {
  const f = step.facilitator;
  const parts = [
    f.lead.length > 0 && h('div', {}, paragraphs(f.lead)),
    f.reference.length > 0 && h('div', {},
      h('p', { class: 'script-note-head', text: 'The reference plan behind the expected findings:' }),
      h('ul', {}, f.reference.map(r => h('li', {}, h('strong', { text: `${r.title}: ` }), r.pick)))),
    f.expect.length > 0 && h('div', {},
      h('p', { class: 'script-note-head', text: 'Expected on this luck:' }),
      h('ul', {}, f.expect.map(e => h('li', { text: e.text })))),
    f.discuss.length > 0 && h('div', {},
      h('p', { class: 'script-note-head', text: 'Discuss:' }),
      h('ul', {}, f.discuss.map(d => h('li', { text: d })))),
    step.id === 'explain' && h('div', {},
      h('p', { class: 'script-note-head', text: 'Rubric for the explanation:' }),
      h('ul', {}, rubric.map(r => h('li', {}, h('strong', { text: `${r.label}: ` }), r.looksLike)))),
  ].filter(Boolean);
  return parts.length ? h('aside', { class: 'facilitator-note', 'aria-label': 'Facilitator notes' }, h('p', { class: 'script-note-tag', text: 'Facilitator' }), parts) : null;
}

function stepSection(step, number, built, answers, save) {
  const choiceIds = new Set(step.student.choices.map(c => c.id));
  const byId = Object.fromEntries(step.student.prompts.map(p => [p.id, p]));
  return h('section', { class: `card script-step${step.extra ? ' extra' : ''}`, id: `step-${step.id}` },
    h('h2', {}, `${number}. ${step.title} `, h('span', { class: 'script-minutes', text: `${step.minutes} min` })),
    paragraphs(step.student.lead),
    step.student.choices.map(c => h('div', {}, choiceCard(c), promptBox(byId[c.id], answers, save))),
    step.student.plan.length > 0 && planTable(step.student.plan),
    step.student.prompts.filter(p => !choiceIds.has(p.id)).map(p => promptBox(p, answers, save)),
    facilitatorNote(step, built.rubric));
}

// Copies text to the clipboard; resolves true when it worked.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the old way */ }
  try {
    const box = h('textarea', { 'aria-hidden': 'true' });
    box.value = text;
    document.body.append(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch { return false; }
}

// Renders the script into `root`. `options`: { store, facilitator (start with the notes showing) }.
export function renderScript(root, built, { store, facilitator = false } = {}) {
  const answers = { ...store.loadAnswers(built.id) };
  const save = (id, value) => { answers[id] = value; store.saveAnswers(built.id, answers); };
  const status = h('p', { class: 'script-status', role: 'status' });
  const pageClass = (show) => (show ? 'script-page show-facilitator' : 'script-page');

  const switchBox = h('input', { type: 'checkbox', id: 'show-facilitator', checked: facilitator });
  const nameBox = h('input', { type: 'text', id: 'student-name', autocomplete: 'name' });
  nameBox.value = answers[NAME_KEY] ?? '';
  nameBox.addEventListener('input', () => save(NAME_KEY, nameBox.value));

  const copy = async () => {
    const ok = await copyText(answersAsText(built, answers, { student: answers[NAME_KEY] ?? '' }));
    status.textContent = ok ? 'Copied. Paste it into your document.' : 'Could not copy. Use Print or Save as PDF instead.';
  };
  const clear = () => {
    if (typeof confirm === 'function' && !confirm('Clear everything you have written for this script?')) return;
    store.saveAnswers(built.id, {});
    renderScript(root, built, { store, facilitator: switchBox.checked });
  };

  let number = 0;
  // Everything the facilitator switch controls lives inside this wrapper, which carries the switch's class.
  const page = h('div', { class: pageClass(facilitator) },
    h('section', { class: 'card script-intro' },
      h('label', { for: 'student-name', text: 'Your name (optional)' }), nameBox,
      paragraphs(built.intro),
      h('aside', { class: 'facilitator-note', 'aria-label': 'Facilitator notes' }, h('p', { class: 'script-note-tag', text: 'Facilitator' }), paragraphs(built.facilitatorIntro))),
    built.steps.map(step => stepSection(step, ++number, built, answers, save)),
    h('section', { class: 'card script-finish no-print' },
      h('h2', { text: 'Hand it in' }),
      h('p', { text: 'Your answers are saved on this device only. Print them or copy them as text.' }),
      h('div', { class: 'actions inline' },
        h('button', { class: 'btn', type: 'button', text: 'Print or save as PDF', onClick: () => globalThis.print?.() }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Copy as text', onClick: copy }),
        h('button', { class: 'btn secondary small', type: 'button', text: 'Clear my answers', onClick: clear })),
      status));
  switchBox.addEventListener('change', () => { page.className = pageClass(switchBox.checked); });

  mount(root,
    h('section', { class: 'hero compact' },
      h('h1', { text: built.title }),
      h('p', { class: 'script-time', text: `About ${built.minutes} minutes` })),
    h('div', { class: 'script-tools no-print' },
      h('label', { class: 'script-switch' }, switchBox, h('span', { text: ' Show facilitator notes' })),
      h('a', { class: 'link-button', href: 'index.html', text: 'Open the game' })),
    page);
}

// The list shown when no persona is chosen: one card per script.
export function renderScriptIndex(root, entries) {
  mount(root,
    h('section', { class: 'hero compact' },
      h('h1', { text: 'Student scripts' }),
      h('p', { text: 'Pick a person to walk through their life in the game: predict, choose, watch, change one thing, and explain.' })),
    h('ul', { class: 'learn-list' }, entries.map(e => h('li', {},
      h('a', { class: 'learn-item', href: `scripts.html?persona=${e.id}` },
        h('span', { class: 'learn-emoji', 'aria-hidden': 'true', text: e.emoji }),
        h('span', { class: 'learn-item-title', text: e.name }),
        h('span', { class: 'learn-item-blurb', text: e.tagline }))))));
}
