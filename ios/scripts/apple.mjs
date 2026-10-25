#!/usr/bin/env node
// App Store Connect setup and build status. Credentials stay in files/environment.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { join } from 'node:path';
import { validateReleaseVersion } from './version.mjs';

const keyId = process.env.ASC_KEY_ID;
const issuer = process.env.ASC_ISSUER_ID;
const key = process.env.ASC_PRIVATE_KEY || (process.env.ASC_KEY_PATH && readFileSync(process.env.ASC_KEY_PATH, 'utf8'));
if (!keyId || !issuer || !key) throw new Error('ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH (or ASC_PRIVATE_KEY) are required.');
const pem = key.includes('\\n') && !key.includes('\n') ? key.replaceAll('\\n', '\n') : key;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function authorization() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${authorization()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 204) return {};
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result.errors)}`);
  return result;
}
const bundleId = 'com.ericjohney.mailthing';
const command = process.argv[2] || 'status';
let app = (await api(`apps?filter[bundleId]=${bundleId}`)).data[0];
if (command === 'setup-autofill') {
  const targets = [
    { identifier: bundleId, name: 'Mailthing', profile: 'Mailthing_AppStore.mobileprovision', capabilities: ['PUSH_NOTIFICATIONS', 'AUTOFILL_CREDENTIAL_PROVIDER', 'APP_GROUPS'] },
    { identifier: `${bundleId}.autofill`, name: 'Mailthing AutoFill', profile: 'Mailthing_AutoFill_AppStore.mobileprovision', capabilities: ['AUTOFILL_CREDENTIAL_PROVIDER', 'APP_GROUPS'] },
  ];
  const output = process.env.SIGNING_DIRECTORY;
  if (!output) throw new Error('SIGNING_DIRECTORY is required.');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const target of targets) {
    let bundle = (await api(`bundleIds?filter[identifier]=${target.identifier}`)).data[0];
    if (!bundle) bundle = (await api('bundleIds', 'POST', { data: { type: 'bundleIds', attributes: { identifier: target.identifier, name: target.name, platform: 'IOS' } } })).data;
    const capabilities = (await api(`bundleIds/${bundle.id}/bundleIdCapabilities`)).data;
    for (const capabilityType of target.capabilities) {
      if (!capabilities.some(value => value.attributes.capabilityType === capabilityType)) {
        await api('bundleIdCapabilities', 'POST', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType }, relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } } } });
      }
    }
    console.log(`${target.identifier}: capabilities ready (${bundle.id})`);
    // Run once to register identifiers/capabilities, assign the shared group in
    // Apple's portal, then request fresh profiles. Never revoke working profiles.
    if (process.env.CREATE_AUTOFILL_PROFILES === '1') {
      const certificateId = process.env.IOS_CERTIFICATE_ID || 'RDNP6DRY65';
      const profile = (await api('profiles', 'POST', { data: { type: 'profiles', attributes: { name: `${target.name} AutoFill ${new Date().toISOString().replace(/[^0-9]/g, '')}`, profileType: 'IOS_APP_STORE' }, relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } }, certificates: { data: [{ type: 'certificates', id: certificateId }] } } } })).data;
      writeFileSync(join(output, target.profile), Buffer.from(profile.attributes.profileContent, 'base64'), { mode: 0o600 });
      console.log(`${target.profile}: saved fresh profile`);
    }
  }
  if (process.env.CREATE_AUTOFILL_PROFILES !== '1') console.log('Assign group.com.ericjohney.mailthing to BOTH identifiers in Apple Developer, then rerun with CREATE_AUTOFILL_PROFILES=1.');
} else if (command === 'setup') {
  let bundle = (await api(`bundleIds?filter[identifier]=${bundleId}`)).data[0];
  if (!bundle) bundle = (await api('bundleIds', 'POST', { data: { type: 'bundleIds', attributes: { identifier: bundleId, name: 'Mailthing', platform: 'IOS' } } })).data;
  const capabilities = (await api(`bundleIds/${bundle.id}/bundleIdCapabilities`)).data;
  if (!capabilities.some(value => value.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) {
    await api('bundleIdCapabilities', 'POST', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' }, relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } } } });
  }
  if (!app) throw new Error('Bundle and push capability registered. Create the Mailthing app record in App Store Connect (My Apps → New App), then run setup again; Apple does not permit app creation through its public API.');
  console.log(`App: ${app.attributes.name} (${app.id}); Bundle: ${bundle.id}`);
  const output = process.env.SIGNING_DIRECTORY;
  if (!output) throw new Error('SIGNING_DIRECTORY is required to save the provisioning profile.');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  let profile = (await api(`profiles?filter[name]=${encodeURIComponent('Mailthing App Store')}`)).data.find(p => p.attributes.profileState === 'ACTIVE');
  if (!profile) {
    const certificateId = process.env.IOS_CERTIFICATE_ID || 'RDNP6DRY65';
    profile = (await api('profiles', 'POST', { data: { type: 'profiles', attributes: { name: 'Mailthing App Store', profileType: 'IOS_APP_STORE' }, relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } }, certificates: { data: [{ type: 'certificates', id: certificateId }] } } } })).data;
  }
  writeFileSync(join(output, 'Mailthing_AppStore.mobileprovision'), Buffer.from(profile.attributes.profileContent, 'base64'), { mode: 0o600 });
  writeFileSync(join(output, 'app-id'), `${app.id}\n`, { mode: 0o600 });
  writeFileSync(join(output, 'asc-issuer-id'), `${issuer}\n`, { mode: 0o600 });
  let group = (await api(`apps/${app.id}/betaGroups`)).data.find(g => g.attributes.isInternalGroup && g.attributes.name === 'Me');
  if (!group) group = (await api('betaGroups', 'POST', { data: { type: 'betaGroups', attributes: { name: 'Me', isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
  const testers = (await api(`betaGroups/${group.id}/betaTesters`)).data;
  const owner = testers.some(t => t.attributes.email === 'eric@ericjohney.com');
  console.log('AutoFill releases also require the com.ericjohney.mailthing.autofill extension identifier, AutoFill Credential Provider capability on BOTH identifiers, and group.com.ericjohney.mailthing assigned to BOTH identifiers. Regenerate the app profile and save an extension App Store profile as Mailthing_AutoFill_AppStore.mobileprovision. See ios/README.md.');
  console.log(`Profile saved; internal group Me: ${group.id}; owner included: ${owner}`);
  if (!owner) console.log('Add Eric through TestFlight → Me → Invite Testers. Internal testers must be selected as App Store Connect users, not copied from another app’s beta tester records.');
} else {
  if (!app) throw new Error('Mailthing has no App Store Connect app record yet. Run setup.');
  if (command === 'validate-version') {
    const versions = [];
    let next = `https://api.appstoreconnect.apple.com/v1/preReleaseVersions?filter[app]=${app.id}&limit=200`;
    while (next) {
      const page = await api(next.replace('https://api.appstoreconnect.apple.com/v1/', ''));
      versions.push(...page.data.filter(v => v.attributes.platform === 'IOS').map(v => v.attributes.version));
      next = page.links?.next;
    }
    validateReleaseVersion(process.env.RELEASE_VERSION, versions);
    console.log(`Mailthing release version ${process.env.RELEASE_VERSION} validated against App Store Connect`);
  } else {
    const builds = (await api(`builds?filter[app]=${app.id}&sort=-uploadedDate&limit=10`)).data;
    if (command === 'allocate') {
      const floor = Number(process.env.BUILD_NUMBER_FLOOR || 1);
      const history = builds.map(b => Number(b.attributes.version)).filter(Number.isSafeInteger);
      const number = Math.max(floor, ...history.map(n => n + 1));
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid build number');
      console.log(number);
    } else console.log(JSON.stringify({ appId: app.id, versions: (await api(`preReleaseVersions?filter[app]=${app.id}&limit=200`)).data.map(v => ({ id: v.id, version: v.attributes.version })), builds: builds.map(b => ({ id: b.id, build: b.attributes.version, state: b.attributes.processingState, expired: b.attributes.expired })) }, null, 2));
  }

}
