import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
for(const f of ['site/index.html','api/[...path].mjs','server/cloud-server.mjs','supabase/migrations/001_doards.sql'])assert.ok(existsSync(f),f);
const html=readFileSync('site/index.html','utf8');
for(const [,asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))assert.ok(existsSync('site'+asset),asset);
console.log('DOARDS prebuilt publish package verified.');
