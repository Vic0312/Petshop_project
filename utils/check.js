import { readFile, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { compile } from '@vue/compiler-dom';

const paths = ['server.js'];
for (const directory of ['config', 'controllers', 'middlewares', 'models', 'routes', 'utils', 'view', 'tests']) {
  for (const entry of await readdir(directory)) if (entry.endsWith('.js')) paths.push(`${directory}/${entry}`);
}
for (const path of paths) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const html = await readFile('view/index.html', 'utf8');
if (/<icon\b[^<]*?\/>/.test(html)) throw new Error('Componentes no template HTML precisam de fechamento explícito: </icon>.');
const template = html.slice(html.indexOf('<div id="app" v-cloak>'), html.indexOf('<noscript>'));
compile(template);
for (const asset of ['golden.jpg', 'dog.jpg', 'cat.jpg', 'mark.svg']) await access(`assets/images/${asset}`);
for (const font of ['montserrat-600', 'montserrat-700', 'montserrat-800', 'poppins-400', 'poppins-500', 'poppins-600']) await access(`assets/fonts/${font}.ttf`);
console.log(`${paths.length} arquivos JavaScript válidos; template Vue compilado; imagens e fontes locais verificadas.`);
