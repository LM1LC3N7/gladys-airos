// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEFAULTS } from '../src/config.js';
import { ACTIONS, POLL_INTERVALS, SCENE_TRIGGERS } from '../src/constants.js';
import { buildRadioDevice } from '../src/devices.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const handlers = read('src/handlers.js');
const dockerfile = read('Dockerfile');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) yield* texts(item, `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) yield* texts(value, `${path}.${key}`);
  }
}

const keys = (list) => (list ?? []).map((item) => item.key);
const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));

test('the store basics; the version set by hand everywhere, never frozen here', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.gladys_version, '>=5.1.0');
  assert.equal(manifest.keywords, undefined, 'keywords need gladys_version >= 5.3.0 (TODO.md)');
  assert.equal(manifest.countries, undefined);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-airos:${manifest.version}`);
  assert.equal(pkg.name, 'gladys-airos');
  assert.equal(lock.name, 'gladys-airos');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['network']);
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
  assert.match(fields.intro.description.en, /Unofficial integration, not affiliated/);
  assert.match(fields.intro.description.fr, /non officielle, sans lien/);
  assert.match(read('docs/en.md'), /never been tested with a real radio/i);
  assert.match(read('docs/fr.md'), /jamais été testée avec une vraie radio/i);
});

test('the license and the notices ship in the image; no person named in LICENSE', () => {
  const license = read('LICENSE');
  assert.match(license, /Apache License\s+Version 2\.0/);
  assert.match(license, /Copyright \[yyyy\] \[name of copyright owner\]/, 'the standard text');
  assert.match(read('THIRD_PARTY_NOTICES.md'), /python-airos[\s\S]*MIT License[\s\S]*@CoMPaTech/);
  assert.match(dockerfile, /COPY[^\n]*LICENSE[^\n]*THIRD_PARTY_NOTICES\.md/);
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code; the reboot off by default; the secret without default', () => {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  assert.deepEqual(keys(manifest.config_schema), [
    'intro',
    'host',
    'username',
    'password',
    'certificate_fingerprint',
    'poll_interval',
    'options_section',
    'allow_reboot',
  ]);
  assert.deepEqual(
    fields.poll_interval.options.map((o) => o.value),
    POLL_INTERVALS,
  );
  for (const option of fields.poll_interval.options) {
    assert.equal(typeof option.label.en, 'string');
  }
  assert.equal(fields.allow_reboot.type, 'boolean');
  assert.equal(fields.allow_reboot.default, false);
  assert.equal(fields.password.type, 'secret');
  assert.equal(fields.password.default, undefined, 'never a default on a secret');
  assert.ok(
    manifest.config_schema.filter((f) => f.type === 'secret').every((f) => !('default' in f)),
  );
  assert.ok(
    !manifest.config_schema.some((f) => f.key.startsWith('gladys_')),
    'GLADYS_* is the core',
  );
  assert.doesNotMatch(JSON.stringify(manifest), /chiffré|encrypted/i);
  assert.match(fields.options_section.description.en, /never a switch/);
});

test('sections store nothing', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined, section.key);
    assert.equal(section.default, undefined, section.key);
    assert.ok(!(section.key in DEFAULTS), section.key);
    for (const link of section.links ?? []) assert.match(link.url, /^https:\/\//);
  }
});

test('the keys of the manifest are the keys of the code, all registered', () => {
  assert.deepEqual(keys(manifest.actions).sort(), Object.values(ACTIONS).sort());
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(handlers.includes(`onAction(ACTIONS.${name}`), name);
  }
  assert.ok(manifest.actions.every((a) => a.timeout_seconds >= 5 && a.timeout_seconds <= 120));
  assert.deepEqual(keys(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
  for (const trigger of manifest.scene_triggers) {
    assert.deepEqual(keys(trigger.variables), ['radio_name']);
  }
  assert.equal(manifest.scene_actions, undefined);
  assert.equal(manifest.widgets, undefined);
  for (const handler of ['onScanRequest(', 'onSetValue(', 'onConfigUpdated(']) {
    assert.ok(handlers.includes(handler), handler);
  }
});

test('units: only those the core lists for the category (server/utils/constants.js)', () => {
  // DEVICE_FEATURE_UNITS_BY_CATEGORY of the core, for the categories used here.
  const allowed = {
    'device-temperature-sensor': ['celsius', 'fahrenheit'],
    'distance-sensor': ['mm', 'cm', 'm', 'km', 'inch', 'feet', 'mile'],
    datarate: [
      'bits-per-second',
      'kilobits-per-second',
      'megabits-per-second',
      'gigabits-per-second',
      'bytes-per-second',
      'kilobytes-per-second',
      'megabytes-per-second',
      'gigabytes-per-second',
    ],
    duration: [
      'microseconds',
      'milliseconds',
      'seconds',
      'minutes',
      'hours',
      'days',
      'weeks',
      'months',
      'years',
    ],
  };
  const gladys = createFakeGladys({ selector: 'airos' });
  for (const feature of buildRadioDevice(gladys, {}).features) {
    if (feature.unit === undefined) {
      assert.ok(
        ['unknown', 'text', 'button'].includes(feature.category),
        `${feature.name}: no unit`,
      );
      continue;
    }
    assert.ok(Object.values(DEVICE_FEATURE_UNITS).includes(feature.unit));
    assert.ok(
      allowed[feature.category]?.includes(feature.unit),
      `${feature.name}: ${feature.unit}`,
    );
  }
});
