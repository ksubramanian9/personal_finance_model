import { formatINR } from './format.js';

// Turns the common template plus one persona's script into the steps the page shows. Pure: no DOM.
// Text may hold {tokens}; an unknown token is an error, not the word "undefined".

export function fillTokens(text, tokens, where = 'script text') {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error(`${where} uses {${name}}, which is not a script token (known: ${Object.keys(tokens).join(', ')})`);
    return String(tokens[name]);
  });
}

const titleOf = (decisions, decisionId, optionId) => decisions[decisionId].options.find(o => o.id === optionId).title;

// The numbers and words a persona's script can use.
export function scriptTokens({ persona, script, template, decisions, keyCount }) {
  const link = (seed) => `index.html?persona=${persona.id}&seed=${seed}&retire=${script.retirementAge}`;
  const placed = Object.values(script.picks).find(p => script.change.decision in p);
  return {
    firstName: persona.firstName, name: persona.name, story: persona.story, job: persona.profile.job.toLowerCase(), city: persona.profile.city,
    age: persona.profile.startAge, seed: script.seed, freshSeed: script.freshSeed, retireAge: script.retirementAge,
    startLink: link(script.seed), freshLink: link(script.freshSeed),
    changeDecision: decisions[script.change.decision].title,
    changeFrom: titleOf(decisions, script.change.decision, placed[script.change.decision]),
    changeTo: titleOf(decisions, script.change.decision, script.change.to),
    minutes: template.minutes, keyCount: `${keyCount} choices`,
    layoffRiskPct: +(persona.career.layoffRisk * 100).toFixed(1),
    support: formatINR(persona.obligations.parentsSupportMonthly + persona.obligations.siblingSupportMonthly),
  };
}

const agesOf = (stage, retirementAge) => `age ${stage.fromAge} to ${stage.toAge ?? retirementAge}`;

// { id, title, intro, facilitatorIntro, minutes, links, steps[], rubric[] }. Each step has
//   student:     { lead[], prompts[{ id, label }], choices[], plan[] }
//   facilitator: { lead[], discuss[], expect[], reference[] }  (reference: the picks behind the expected findings)
export function buildScript({ template, script, persona, stages, decisions }) {
  const tokens = scriptTokens({ persona, script, template, decisions, keyCount: script.keyChoices.length });
  const fill = (text, where) => fillTokens(text, tokens, where);
  const fillAll = (list, where) => list.map(t => fill(t, where));
  const keyed = new Set(script.keyChoices.map(k => `${k.stage}/${k.decision}`));

  const choices = script.keyChoices.map(k => {
    const stage = stages.find(s => s.id === k.stage);
    const ref = stage.decisions.find(d => d.id === k.decision);
    const decision = decisions[k.decision];
    const where = `${script.personaId} key choice ${k.stage}/${k.decision}`;
    return {
      id: `choice-${k.stage}-${k.decision}`, stage: stage.name, ages: agesOf(stage, script.retirementAge),
      question: ref?.question ?? decision.question ?? decision.title, title: decision.title,
      why: fill(k.why, where), weigh: fillAll(k.weigh, where),
      options: decision.options.map(o => ({ title: o.title, blurb: o.blurb })),
      reference: titleOf(decisions, k.decision, script.picks[k.stage][k.decision]), // for the facilitator only
    };
  });

  // What every student does at the other questions, so that everyone starts level. A question the student already
  // decided in an earlier stage is asked again by the game, and the answer is to keep what they chose.
  const stageIndex = (id) => stages.findIndex(s => s.id === id);
  const decidedBefore = (stageId, decisionId) => script.keyChoices.some(k => k.decision === decisionId && stageIndex(k.stage) < stageIndex(stageId));
  const plan = stages.map(stage => ({
    stage: stage.name, ages: agesOf(stage, script.retirementAge),
    rows: Object.entries(script.picks[stage.id])
      .filter(([decisionId]) => !keyed.has(`${stage.id}/${decisionId}`))
      .map(([decisionId, optionId]) => ({
        decision: decisions[decisionId].title,
        pick: decidedBefore(stage.id, decisionId) ? 'Keep what you chose before' : titleOf(decisions, decisionId, optionId),
      })),
  })).filter(s => s.rows.length);

  const observe = stages.flatMap(stage => [
    { id: `observe-${stage.id}`, label: `After ${stage.name} (${agesOf(stage, script.retirementAge)}): what happened, and was it luck or your choice?` },
    ...(script.observe ?? []).filter(o => o.stage === stage.id).map(o => ({ id: o.id, label: fill(o.label, `${script.personaId} observe ${o.id}`) })),
  ]);

  const expect = (stepId) => (script.expect ?? []).filter(e => e.step === stepId).map(e => ({ text: fill(e.text, `${script.personaId} expect for ${stepId}`) }));

  const make = (step, extra) => {
    const over = script.overrides?.[step.id] ?? {};
    const at = `${script.personaId} step ${step.id}`;
    const lead = over.student?.lead ?? step.student.lead;
    const prompts = (step.student.prompts ?? []).map(p => ({ id: p.id, label: over.student?.prompts?.[p.id]?.label ?? p.label }));
    return {
      id: step.id, title: fill(step.title, at), minutes: step.minutes ?? 5, extra,
      student: {
        lead: fillAll(lead, at),
        prompts: [...(step.generated === 'stages' ? observe : []), ...(step.generated === 'keyChoices' ? choices.map(c => ({ id: c.id, label: `${c.title}: what did you pick, and why?` })) : []), ...prompts].map(p => ({ id: p.id, label: fill(p.label, `${at} prompt ${p.id}`) })),
        choices: step.generated === 'keyChoices' ? choices : [],
        plan: step.generated === 'keyChoices' ? plan : [],
      },
      facilitator: {
        lead: fillAll(over.facilitator?.lead ?? step.facilitator.lead, at),
        discuss: fillAll(over.facilitator?.discuss ?? step.facilitator.discuss, at),
        expect: expect(step.id),
        reference: step.generated === 'keyChoices' ? choices.map(c => ({ title: c.title, stage: c.stage, pick: c.reference })) : [],
      },
    };
  };

  const steps = [];
  for (const step of template.steps) {
    steps.push(make(step, false));
    for (const x of (script.extras ?? []).filter(e => e.after === step.id)) steps.push(make({ ...x, minutes: x.minutes }, true));
  }

  return {
    id: script.personaId, title: fill(template.title, 'the title'),
    intro: fillAll(template.intro, 'the introduction'), facilitatorIntro: fillAll(template.facilitatorIntro, 'the facilitator introduction'),
    minutes: template.minutes + (script.extras ?? []).reduce((n, x) => n + (x.minutes ?? 5), 0),
    links: { start: tokens.startLink, fresh: tokens.freshLink },
    steps,
    rubric: template.rubric,
  };
}

// The prompts in the order the page shows them, with their step, for exporting answers.
export const promptsOf = (built) => built.steps.flatMap(step => step.student.prompts.map(p => ({ ...p, step: step.title })));

// The student's answers as plain text, to paste into a document.
export function answersAsText(built, answers, { student = '' } = {}) {
  const lines = [built.title, ...(student ? [`Name: ${student}`] : []), ''];
  for (const step of built.steps) {
    const prompts = step.student.prompts;
    if (!prompts.length) continue;
    lines.push(step.title.toUpperCase());
    for (const p of prompts) {
      lines.push(p.label, (answers[p.id] ?? '').trim() || '(no answer yet)', '');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}
