import { loadJSON } from './loader.js';
import { schemas } from './validate.js';

// The Learn pages: data/learn/index.json lists the pages and which decision opens which; each page is
// data/learn/<id>.json. All are loaded and checked up front, so a bad page is found at start-up and the
// dialog never fails in the middle of a life.
export async function loadLearn({ fetchImpl = fetch } = {}) {
  const index = await loadJSON('data/learn/index.json', { schema: schemas.learnIndex, label: 'learn/index.json', fetchImpl });
  const pages = {};
  for (const entry of index.pages) {
    const label = `learn/${entry.id}.json`;
    const page = await loadJSON(`data/learn/${entry.id}.json`, { schema: schemas.learnPage, label, fetchImpl });
    if (page.id !== entry.id) throw new Error(`${label} says its id is "${page.id}", but the index lists it as "${entry.id}".`);
    for (const item of page.india) {
      const p = item?.provenance;
      if (typeof item?.text !== 'string' || typeof p?.basis !== 'string' || typeof p?.confidence !== 'string' || typeof p?.asOf !== 'number') {
        throw new Error(`${label}: every "india" item needs text and a provenance block (basis, confidence, asOf).`);
      }
    }
    pages[entry.id] = page;
  }
  for (const [decisionId, pageId] of Object.entries(index.decisions)) {
    if (!pages[pageId]) throw new Error(`learn/index.json opens "${pageId}" from the "${decisionId}" decision, but there is no such page.`);
  }
  return { index, pages };
}
