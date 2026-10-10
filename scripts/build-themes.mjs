#!/usr/bin/env node
/**
 * Builds the stylesheet of every theme (themes/<name>/css/app.css) with
 * Tailwind to public/build/themes/<name>/app.css - what `vite build` did in the
 * PHP release. Each theme keeps its own isolated stylesheet and the active one
 * is selected at runtime from the "theme" setting.
 *
 *   node scripts/build-themes.mjs          one-off build
 *   node scripts/build-themes.mjs --watch  rebuild when sources change
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');

const watch = process.argv.includes('--watch');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));

const themesDir = path.join(root, 'themes');
const themes = fs
    .readdirSync(themesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(themesDir, d.name, 'css', 'app.css')))
    .map((d) => d.name)
    .filter((n) => !only || n === only);

async function build(name) {
    const from = path.join(themesDir, name, 'css', 'app.css');
    const to = path.join(root, 'public', 'build', 'themes', name, 'app.css');
    const started = Date.now();
    const css = fs.readFileSync(from, 'utf8');
    const result = await postcss([tailwind({ optimize: process.env.NODE_ENV === 'production' })]).process(css, { from, to });
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, result.css);
    console.log(`[themes] ${name}: ${(result.css.length / 1024).toFixed(1)} kB in ${Date.now() - started} ms`);
}

for (const name of themes) await build(name);

if (watch) {
    const dirs = [path.join(root, 'themes'), path.join(root, 'src', 'components'), path.join(root, 'extensions')].filter((d) => fs.existsSync(d));
    let timer;
    const trigger = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            for (const name of themes) {
                try {
                    await build(name);
                } catch (e) {
                    console.error(`[themes] ${name} failed:`, e.message);
                }
            }
        }, 150);
    };
    for (const dir of dirs) fs.watch(dir, { recursive: true }, (_e, file) => file && /\.(tsx?|css|jsx?)$/.test(file) && trigger());
    console.log('[themes] watching for changes...');
}

void pathToFileURL;
