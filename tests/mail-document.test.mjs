import test from 'node:test';
import assert from 'node:assert/strict';
import { mailDocument } from '../src/mail/mailDocument.mjs';

test('mail document preserves automatic table layout and isolates sender content', () => {
  const doc = mailDocument('<table width="520"><tr><td style="padding:24px">Message</td></tr></table>');
  assert.match(doc, /width="520"/); assert.match(doc, /padding:24px/);
  assert.doesNotMatch(doc, /table-layout:fixed|td,th\{padding|table\{width:100%/);
  assert.match(doc, /default-src 'none'/); assert.match(doc, /img-src 'none'/);
});

test('theme maps neutral colors with original fallbacks, preserving white labels and brand colors', () => {
  const html='<div style="background-color:#ffffff;color:#202124;border:1px solid #dadce0"><a style="color:#1a73e8">Link</a><b style="background-color:#1a73e8;color:white">Button</b></div>';
  const dark=mailDocument(html,true), original=mailDocument(html,false);
  assert.match(dark,/--mail-paper:#1b1b1b/); assert.match(dark,/background-color:var\(--mail-paper,#ffffff\)/);
  assert.match(dark,/color:var\(--mail-ink,#202124\)/); assert.match(dark,/color:white/); assert.match(dark,/color:#1a73e8/);
  assert.doesNotMatch(original,/--mail-paper:#1b1b1b/); assert.match(original,/var\(--mail-ink,#202124\)/);
  const rgba=mailDocument('<div style="color:rgba(0, 0, 0, 0.87);background-color:rgb(255,255,255);border-bottom:thin solid #dadce0"><span style="color:rgba(0,0,0,0.54)">Text</span></div>',true);
  assert.match(rgba,/color:var\(--mail-ink,rgba\(0, 0, 0, 0.87\)\)/);assert.match(rgba,/--mail-muted,rgba\(0,0,0,0.54\)/);assert.match(rgba,/border-bottom:thin solid var\(--mail-rule,#dadce0\)/);
});
