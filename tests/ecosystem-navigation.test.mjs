import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStudioRoute,
  studioLocation,
  parseGuideRoute,
  parseEcosystemTool,
  ecosystemLocation,
} from '../app/studio/navigation.mjs';
import { projects } from '../lib/pebble/projects.js';
const known = projects.map((project) => project.id);
test('ecosystem home and editor route remain explicit', () => {
  assert.deepEqual(parseStudioRoute('', known), {
    view: 'ecosystem',
    example: null,
  });
  assert.deepEqual(parseStudioRoute('?view=studio', known), {
    view: 'studio',
    example: null,
  });
  assert.deepEqual(parseStudioRoute('?view=ecosystem', known), {
    view: 'ecosystem',
    example: null,
  });
});
test('cross-product handoff selects only known examples', () => {
  assert.deepEqual(
    parseStudioRoute('?view=studio&example=functions-v2', known),
    { view: 'studio', example: 'functions-v2' },
  );
  assert.deepEqual(parseStudioRoute('?example=json', known), {
    view: 'studio',
    example: 'json',
  });
  for (const input of [
    'https://untrusted.invalid/',
    'custom-personal',
    'print("untrusted");',
    '../secret',
    '__proto__',
  ]) {
    assert.deepEqual(
      parseStudioRoute('?example=' + encodeURIComponent(input), known),
      { view: 'ecosystem', example: null },
    );
  }
});
test('handoff never takes arbitrary code or external destinations', () => {
  assert.equal(
    studioLocation('studio', 'json', known),
    '?view=studio&example=json',
  );
  assert.equal(
    studioLocation('studio', 'print("untrusted");', known),
    '?view=studio',
  );
  assert.equal(studioLocation('ecosystem', 'json', known), '?view=ecosystem');
  assert.equal(
    studioLocation('https://untrusted.invalid/', null, known),
    '?view=ecosystem',
  );
  assert.deepEqual(
    parseStudioRoute(
      '?view=studio&code=print("untrusted");&redirect=https://untrusted.invalid/',
      known,
    ),
    { view: 'studio', example: null },
  );
});

test('machine learning handoff opens only the approved guide tab', () => {
  assert.equal(parseGuideRoute('?view=studio&guide=machine-learning'), 'ml');
  for (const input of ['unknown', '<script>', 'https://untrusted.invalid/'])
    assert.equal(parseGuideRoute('?guide=' + encodeURIComponent(input)), null);
  assert.equal(parseGuideRoute('?view=studio'), null);
});

test('ecosystem tool journeys are closed, refreshable local routes', () => {
  for (const tool of ['language', 'model', 'sentinel']) {
    const route = ecosystemLocation(tool);
    assert.equal(route, '?view=ecosystem&tool=' + tool);
    assert.equal(parseEcosystemTool(route), tool);
    assert.equal(ecosystemLocation(tool, true), route + '#ecosystem-workbench');
    assert.deepEqual(parseStudioRoute(route, known), {
      view: 'ecosystem',
      example: null,
    });
  }
  for (const tool of [
    'https://untrusted.invalid/',
    'print("bad");',
    '__proto__',
    '../secret',
  ]) {
    assert.equal(parseEcosystemTool('?tool=' + encodeURIComponent(tool)), null);
    assert.equal(
      ecosystemLocation(tool, true),
      '?view=ecosystem&tool=language#ecosystem-workbench',
    );
  }
  assert.equal(parseEcosystemTool('?view=ecosystem'), null);
});
