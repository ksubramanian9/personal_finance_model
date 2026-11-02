import { loadJSON, applyTheme } from '../data/loader.js';
import { schemas } from '../data/validate.js';

const app = document.getElementById('app');

function showError(err) {
  app.innerHTML = '';
  const card = document.createElement('section');
  card.className = 'card error';
  const h = document.createElement('h2');
  h.textContent = 'Oops, something is off';
  const pre = document.createElement('pre');
  pre.textContent = err.message;
  card.append(h, pre);
  app.append(card);
}

function renderLanding() {
  app.innerHTML = `
    <section class="hero">
      <div class="blobs" aria-hidden="true">💰 📈 🏠 🎲</div>
      <h1>Live a <span class="pop-1">lifetime</span> of <span class="pop-2">money</span> choices</h1>
      <p>Pick a person, make the big calls, and watch how your choices and a bit of luck
         add up over the decades. No spreadsheets, just a story.</p>
      <button class="btn" id="start" type="button">Let's start!</button>
    </section>
    <section class="card" id="coming" hidden>
      <h2>Next up: meet the people</h2>
      <p>The persona picker arrives in the next step.</p>
    </section>`;
  document.getElementById('start').addEventListener('click', () => {
    document.getElementById('coming').hidden = false;
  });
}

async function boot() {
  try {
    const theme = await loadJSON('data/theme.json', { schema: schemas.theme, label: 'theme.json' });
    applyTheme(theme, document.documentElement);
    if (theme.fonts.googleFontsUrl) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = theme.fonts.googleFontsUrl;
      document.head.append(link);
    }
    renderLanding();
  } catch (err) {
    showError(err);
  }
}

boot();
