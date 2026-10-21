import { cleanReceivedMailHtml } from '../functions/_shared/mail-received.ts';
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };

Deno.test('received layout preserves nested table dimensions, spacing, typography and safe links', () => {
  const html = cleanReceivedMailHtml('<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td width="8"></td><td align="center"><table width="520" style="max-width:520px;border:1px solid #dadce0;border-radius:8px"><tr><td style="padding:32px 24px;font-family:Arial,sans-serif;font-size:16px;color:#202124;background-color:#ffffff"><h2 style="font-weight:normal;text-align:center">Verifique o e-mail adicionado à sua Conta</h2><p><a style="color:#1a73e8;text-decoration:underline" href="https://example.com/verify">Verificar</a></p></td></tr></table></td><td width="8"></td></tr></table>');
  for (const item of ['max-width:520px', 'width="8"', 'cellpadding="0"', 'padding:32px 24px', 'font-size:16px', 'border-radius:8px', 'color:#202124', 'target="_blank"', 'rel="noopener noreferrer"']) assert(html.includes(item), `Lost layout: ${item}`);
});

Deno.test('received formatting cannot load resources, execute content or escape isolation', () => {
  const html = cleanReceivedMailHtml('<script>alert(1)</script><style>@import "https://tracker.invalid"</style><link rel="stylesheet" href="https://tracker.invalid"><meta http-equiv="refresh" content="0;url=https://tracker.invalid"><base href="https://tracker.invalid"><form><input autofocus onfocus="evil()"></form><img src="https://tracker.invalid/pixel" onerror="evil()"><svg><script>evil()</script></svg><iframe src="https://tracker.invalid"></iframe><div onclick="evil()" style="color:#202124;position:fixed;inset:0;background-image:url(https://tracker.invalid);background:url(https://tracker.invalid);font-family:url(https://tracker.invalid);width:expression(alert(1));padding:20px">Safe</div><a href="javascript:alert(1)" target="_top">Bad</a><a href="//tracker.invalid">Relative</a>');
  assert(html.includes('padding:20px') && html.includes('Safe'), 'Safe content lost');
  assert(!/tracker\.invalid|javascript:|onclick|onerror|onfocus|position:|expression|<script|<style|<img|<form|<input|<iframe|<svg|<meta|<base|<link/i.test(html), 'Unsafe received content survived');
});

Deno.test('common Google typography preserves RGBA text and thin borders', () => {
  const html=cleanReceivedMailHtml('<div style="border-style:solid;border-width:thin;border-color:#dadce0;color:rgba(0,0,0,0.87);border-bottom:thin solid #dadce0;padding:40px 20px">Text</div>');
  for(const value of ['border-style:solid','border-width:thin','color:rgba(0,0,0,0.87)','border-bottom:thin solid #dadce0'])assert(html.includes(value), `Missing Google layout ${value}`);
});
