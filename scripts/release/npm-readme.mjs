#!/usr/bin/env node

/**
 * npm README transform.
 *
 * GitHub renders relative-path mp4 markdown embeds as inline video players,
 * while npmjs.com loads them as plain <img> tags and shows broken icons.
 * Before packing, `apply` swaps each video embed for the absolute-URL preview
 * image plus a play link; `restore` puts the GitHub version back afterwards.
 */

import { promises as fs } from 'fs';

const IMAGE_BASE = 'https://github.com/rpamis/comet/blob/master/img';

export const README_FILES = [
  { path: 'README.md', playLabel: '▶ Play the full demo' },
  { path: 'README-zh.md', playLabel: '▶ 播放完整演示' },
];

// GitHub shape: blank line, ![alt](img/<name>.mp4), blank line.
const GITHUB_VIDEO_EMBED = /\r?\n\r?\n!\[([^\]\r\n]+)\]\(img\/([a-z0-9-]+)\.mp4\)\r?\n\r?\n/g;

// Exact mirror of the block npmPreviewBlock() emits, used to restore.
// Top-level indentation only: inside a markdown paragraph, 4+ spaces of
// indentation would turn the block into a code fence.
const NPM_PREVIEW_BLOCK = new RegExp(
  String.raw`\r?\n<a href="https://github\.com/rpamis/comet/blob/master/img/([a-z0-9-]+)\.mp4">` +
    String.raw`\r?\n {2}<img src="https://github\.com/rpamis/comet/blob/master/img/\1-preview\.png" alt="([^"]*)" width="100%">` +
    String.raw`\r?\n</a><br>` +
    String.raw`\r?\n<a href="https://github\.com/rpamis/comet/blob/master/img/\1\.mp4">[^<\r\n]*</a>` +
    String.raw`\r?\n`,
  'g',
);

function detectEol(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

// Alt text is copied verbatim into an HTML attribute; anything that could
// break the attribute or the restore round-trip keeps the embed untouched.
function roundtripSafeAlt(alt) {
  return !/["<&>]/u.test(alt);
}

function npmPreviewBlock(alt, name, playLabel, eol) {
  return [
    `<a href="${IMAGE_BASE}/${name}.mp4">`,
    `  <img src="${IMAGE_BASE}/${name}-preview.png" alt="${alt}" width="100%">`,
    '</a><br>',
    `<a href="${IMAGE_BASE}/${name}.mp4">${playLabel}</a>`,
  ].join(eol);
}

export function transformReadmeForNpm(content, playLabel) {
  const eol = detectEol(content);
  let count = 0;
  let skipped = 0;
  const transformed = content.replace(GITHUB_VIDEO_EMBED, (match, alt, name) => {
    if (!roundtripSafeAlt(alt)) {
      skipped++;
      return match;
    }
    count++;
    return `${eol}${npmPreviewBlock(alt, name, playLabel, eol)}${eol}`;
  });
  return { content: transformed, count, skipped };
}

export function restoreReadmeForGithub(content) {
  const eol = detectEol(content);
  let count = 0;
  const restored = content.replace(NPM_PREVIEW_BLOCK, (match, name, alt) => {
    count++;
    return `${eol}${eol}![${alt}](img/${name}.mp4)${eol}${eol}`;
  });
  return { content: restored, count, skipped: 0 };
}

export async function runNpmReadmeCommand(command) {
  if (command !== 'apply' && command !== 'restore') {
    console.error(`[NPM-README] Unknown command: ${command ?? '(none)'}`);
    console.error('Usage: node scripts/release/npm-readme.mjs <apply|restore>');
    return 1;
  }

  let failures = 0;
  for (const file of README_FILES) {
    const original = await fs.readFile(file.path, 'utf8');
    const result =
      command === 'apply'
        ? transformReadmeForNpm(original, file.playLabel)
        : restoreReadmeForGithub(original);
    if (result.content !== original) {
      await fs.writeFile(file.path, result.content);
    }
    console.log(`[NPM-README] ${command}: ${file.path} — ${result.count} embed(s)`);
    if (result.skipped > 0) {
      console.error(
        `[NPM-README] ${file.path}: skipped ${result.skipped} embed(s) with unsafe alt text`,
      );
      failures++;
    }
  }
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('npm-readme.mjs')) {
  process.exit(await runNpmReadmeCommand(process.argv[2]));
}
