import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIpaDownloadUrls,
  normalizeGithubRepoInput,
  resolveGithubRepo,
} from './ipaDownload';

test('normalizeGithubRepoInput handles slugs and full GitHub URLs', () => {
  assert.equal(normalizeGithubRepoInput('ruben/rs-setups'), 'ruben/rs-setups');
  assert.equal(
    normalizeGithubRepoInput('https://github.com/ruben/rs-setups.git'),
    'ruben/rs-setups'
  );
  assert.equal(
    normalizeGithubRepoInput('https://github.com/ruben/rs-setups/releases'),
    'ruben/rs-setups'
  );
  assert.equal(normalizeGithubRepoInput('invalid repo'), null);
});

test('resolveGithubRepo auto-detects github.io Pages URLs and builds direct IPA links', () => {
  const detected = resolveGithubRepo({
    locationHostname: 'rubenplays.github.io',
    locationPathname: '/rs-setups/settings',
  });
  assert.equal(detected, 'rubenplays/rs-setups');

  const urls = buildIpaDownloadUrls(detected, '/rs-setups/');
  assert.equal(urls.sameOriginIpaUrl, '/rs-setups/downloads/RS-Setups-unsigned.ipa');
  assert.equal(
    urls.releaseDirectIpaUrl,
    'https://github.com/rubenplays/rs-setups/releases/download/ipa-latest/RS-Setups-unsigned.ipa'
  );
  assert.equal(
    urls.actionsBuildUrl,
    'https://github.com/rubenplays/rs-setups/actions/workflows/build-ios.yml'
  );
});
