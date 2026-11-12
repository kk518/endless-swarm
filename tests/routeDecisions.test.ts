import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  FIRST_FORK_ROUTES, SECOND_FORK_ROUTES, eligibleRouteChoices,
  resolveRouteChoice, validateRouteChoices,
} from '../src/game/routeDecisions.ts';
import {
  THREE_ACT_BLUEPRINT, advanceCampaignReward, beginCampaign,
  encountersOf, tickCampaign, validateCampaign,
} from '../src/game/campaignDirector.ts';

test('both route forks are validated, offer a safe recovery and a real high-risk tradeoff', () => {
  for (const choices of [FIRST_FORK_ROUTES, SECOND_FORK_ROUTES]) {
    validateRouteChoices(choices);
    assert.equal(choices.length, 2);
    assert.deepEqual(choices.map(option => option.risk), ['safe', 'hazard']);
    assert.ok(choices[1].runDamageMultiplier > 1);
    assert.ok(choices[1].nextPressureMultiplier > 1);
    assert.equal(resolveRouteChoice(choices, choices[0].id, 3, 6)?.hp, 5);
    const risk = resolveRouteChoice(choices, choices[1].id, 3, 6)!;
    assert.equal(risk.hp, 2);
    assert.ok(risk.nextPressureMultiplier >= 1.25);
    assert.ok(risk.runDamageMultiplier > 1);
  }
});

test('hazard routes are hidden at critical health and cannot cause a menu death', () => {
  assert.deepEqual(eligibleRouteChoices(FIRST_FORK_ROUTES, 1).map(x => x.id), ['landing-supply']);
  assert.equal(resolveRouteChoice(FIRST_FORK_ROUTES, 'landing-assault', 1, 6), null);
  assert.equal(resolveRouteChoice(FIRST_FORK_ROUTES, 'not-offered', 4, 6), null);
  assert.equal(resolveRouteChoice(FIRST_FORK_ROUTES, 'landing-supply', 6, 6)?.hp, 6);
  assert.equal(resolveRouteChoice(FIRST_FORK_ROUTES, 'landing-supply', -1, 6), null);
  assert.equal(resolveRouteChoice(FIRST_FORK_ROUTES, 'landing-supply', 9, 6), null);
});

test('malformed forks and a route-less route encounter are rejected', () => {
  assert.throws(() => validateRouteChoices([]), /2–3 choices/);
  assert.throws(() => validateRouteChoices([FIRST_FORK_ROUTES[0], FIRST_FORK_ROUTES[0]]), /Invalid/);
  assert.throws(() => validateRouteChoices([FIRST_FORK_ROUTES[1], SECOND_FORK_ROUTES[1]]), /safe alternative/);
  assert.throws(() => validateRouteChoices([{ ...FIRST_FORK_ROUTES[0], nextPressureMultiplier: Infinity }, FIRST_FORK_ROUTES[1]]), /Invalid/);
  const cloned = structuredClone(THREE_ACT_BLUEPRINT);
  cloned.acts[0].encounters[1].routes = undefined;
  assert.throws(() => validateCampaign(cloned), /2–3 choices/);
  const invalid = structuredClone(THREE_ACT_BLUEPRINT);
  invalid.acts[0].encounters[0].routes = FIRST_FORK_ROUTES;
  assert.throws(() => validateCampaign(invalid), /Non-route encounter/);
});

test('real nine-stage expedition advances through 6 cards, 2 route forks and a boss', () => {
  const stages = encountersOf(THREE_ACT_BLUEPRINT);
  assert.equal(stages.length, 9);
  let state = beginCampaign(THREE_ACT_BLUEPRINT, 5218);
  const actual: string[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const encounter = stages[i].encounter;
    state = tickCampaign(THREE_ACT_BLUEPRINT, state, encounter.wave.durationMs);
    assert.equal(state.phase, 'reward');
    actual.push(encounter.decision);
    assert.equal(tickCampaign(THREE_ACT_BLUEPRINT, state, 1000), state);
    state = advanceCampaignReward(THREE_ACT_BLUEPRINT, state);
    assert.equal(state.stageIndex, i + 1);
    assert.equal(state.phase, 'playing');
  }
  assert.deepEqual(actual, ['card', 'route', 'card', 'card', 'route', 'card', 'card', 'card']);
  const bossState = tickCampaign(THREE_ACT_BLUEPRINT, state, 1200);
  assert.equal(bossState.phase, 'playing');
  assert.equal(tickCampaign(THREE_ACT_BLUEPRINT, bossState, 0, true).phase, 'victory');
  assert.equal(tickCampaign(THREE_ACT_BLUEPRINT, state, stages[8].encounter.wave.durationMs).phase, 'timeout');
});

test('route overlay is wired to scene, has no training UI and expedition is opt-in', () => {
  const scene = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(scene.includes('chooseRoute(routeId: string): boolean'));
  assert.ok(scene.includes('this.routePressureMultiplier = effect.nextPressureMultiplier'));
  assert.ok(scene.includes('pressure.intervalMs / this.routePressureMultiplier'));
  assert.ok(scene.includes("new CustomEvent<RouteOffer>('swarm:route'"));
  assert.ok(scene.includes("this.campaign = mode === 'expedition' ? THREE_ACT_BLUEPRINT : PROTOTYPE_CAMPAIGN"));
  assert.ok(main.includes("window.addEventListener('swarm:route'"));
  assert.ok(main.includes('scene.chooseRoute(choice.id)'));
  assert.ok(html.includes('<option value="prototype">'));
  assert.ok(html.includes('<option value="expedition">'));
  assert.ok(html.includes('暂无中途存档'));
  assert.ok(css.includes('.reward-overlay[data-mode="route"] .wave-training { display: none; }'));
  assert.ok(!main.includes('new CustomEvent<RouteOffer>')); // only scene sends game events
});
