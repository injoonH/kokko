import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function releaseNotes(changelog, tag) {
  const version = tag?.replace(/^v/, "");
  if (!version) throw new Error("A release tag is required.");
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = /^## \[([^\]]+)\] - \d{4}-\d{2}-\d{2}$/.exec(line);
    return heading?.[1] === version;
  });
  if (start === -1)
    throw new Error(`Missing dated CHANGELOG.md entry for ${tag}.`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  // Reference definitions belong to the changelog rather than the release body.
  const notes = lines
    .slice(start + 1, end)
    .filter((line) => !/^\[[^\]]+\]:\s/.test(line))
    .join("\n")
    .trim();
  if (!notes || !/^\s*[-*] \S/m.test(notes))
    throw new Error(`Empty CHANGELOG.md entry for ${tag}.`);
  return `${notes}\n`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const changelog = readFileSync(
      new URL("../CHANGELOG.md", import.meta.url),
      "utf8",
    );
    process.stdout.write(releaseNotes(changelog, process.argv[2]));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
