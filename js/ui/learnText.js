import { formatINR } from './format.js';

// Numbers the game already defines, formatted for the pages. Pages write {health.basic.cover} instead of
// typing the figure, so they follow the game when it is retuned.
export function gameNumbers(params, decisions) {
  const values = {};
  const health = decisions.health?.options ?? [];
  for (const o of health) {
    if (!o.effects.healthCover) continue;
    values[`health.${o.id}.cover`] = formatINR(o.effects.healthCover);
    values[`health.${o.id}.premium`] = formatINR(o.effects.healthPremium);
  }
  if (params.insurance) {
    values['health.employerCover'] = formatINR(params.insurance.employerCoverReal);
    values['health.ageLoadingPct'] = String(params.insurance.premiumAgeLoadingPct);
  }
  return values;
}

const TOKEN = /\{([a-zA-Z][\w.]*)\}/g;

export function tokensIn(text) {
  return [...String(text).matchAll(TOKEN)].map(m => m[1]);
}

// Replaces {name} with the game's number. An unknown name is an error, never printed as "undefined".
export function fill(text, values) {
  return String(text).replace(TOKEN, (_, name) => {
    if (!(name in values)) throw new Error(`Learn page uses {${name}}, which the game does not define.`);
    return values[name];
  });
}
