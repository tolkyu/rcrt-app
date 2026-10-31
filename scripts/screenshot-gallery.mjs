import { existsSync, writeFileSync } from 'node:fs';

const variants = [
  'desktop-light',
  'desktop-dark',
  'mobile-light',
  'mobile-dark',
];
const cards = variants.map((variant) => {
  const file = `01-public-not-found-${variant}.png`;
  if (!existsSync(`screenshots/foundation/${file}`))
    throw new Error(`Missing screenshot: ${file}`);
  return `<figure><a href="${file}"><img src="${file}" alt="404 — ${variant}" loading="lazy"></a><figcaption>${variant}</figcaption></figure>`;
});

writeFileSync(
  'screenshots/foundation/index.html',
  `<!doctype html>
<html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HRIS — перевірка фундаменту</title>
<style>body{margin:32px;background:#f8fafc;color:#0f172a;font:16px/1.5 system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;border:1px solid #94a3b8}figcaption{padding:8px 0}</style>
<h1>HRIS — перевірка фундаменту</h1>
<p>Публічна сторінка 404. Бізнес-екрани та повна рольова галерея фази 1 ще не реалізовані.</p>
<main>${cards.join('\n')}</main></html>\n`,
);
