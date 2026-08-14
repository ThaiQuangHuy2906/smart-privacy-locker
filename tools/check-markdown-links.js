#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || process.cwd());
const ignoredDirectories = new Set([
  '.git',
  '.pio',
  '.pioenvs',
  '.piolibdeps',
  '.tools',
  'build',
  'node_modules',
  'output',
]);

function collectMarkdownFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(absolutePath, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(absolutePath);
    }
  }
  return files;
}

function linkDestinations(markdown) {
  const contentLines = [];
  let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = { character: marker[0], length: marker.length };
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null;
      }
      contentLines.push('');
      continue;
    }

    contentLines.push(fence === null ? line.replace(/`[^`\r\n]*`/g, '') : '');
  }

  const linkableMarkdown = contentLines.join('\n');
  const destinations = [];
  const inlineLink = /!?\[[^\]\r\n]*\]\(\s*(<[^>\r\n]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
  const referenceLink = /^\s{0,3}\[[^\]\r\n]+\]:\s*(<[^>\r\n]+>|\S+)/gm;

  for (const expression of [inlineLink, referenceLink]) {
    for (const match of linkableMarkdown.matchAll(expression)) {
      destinations.push(match[1]);
    }
  }
  return destinations;
}

function localTarget(destination) {
  let target = destination.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  }

  if (!target || target.startsWith('#') || target.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return null;
  }

  target = target.split('#', 1)[0].split('?', 1)[0];
  if (!target) {
    return null;
  }

  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

const markdownFiles = collectMarkdownFiles(root);
const broken = [];
let localLinks = 0;

for (const markdownFile of markdownFiles) {
  const markdown = fs.readFileSync(markdownFile, 'utf8');
  for (const destination of linkDestinations(markdown)) {
    const target = localTarget(destination);
    if (target === null) {
      continue;
    }

    localLinks += 1;
    const resolved = path.resolve(path.dirname(markdownFile), target);
    if (!fs.existsSync(resolved)) {
      broken.push({
        file: path.relative(root, markdownFile),
        target: destination,
        resolved: path.relative(root, resolved),
      });
    }
  }
}

console.log(`Markdown files checked: ${markdownFiles.length}`);
console.log(`Local links checked: ${localLinks}`);

if (broken.length > 0) {
  console.error(`Broken local links: ${broken.length}`);
  for (const item of broken) {
    console.error(`- ${item.file}: ${item.target} -> ${item.resolved}`);
  }
  process.exitCode = 1;
} else {
  console.log('Broken local links: 0');
}
