import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotes } from "./release-notes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = "injoonH/kokko";

export function releaseVersion(tag) {
  const semver =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  const match = typeof tag === "string" ? semver.exec(tag) : null;
  if (!match || match[0] !== tag)
    throw new Error("Provide a full semantic version tag, such as v1.2.0.");
  return { version: tag.replace(/^v/, ""), prerelease: !!match[4] };
}

function gh(...args) {
  return execFileSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
const api = (path, ...args) =>
  JSON.parse(gh("api", `repos/${repo}/${path}`, ...args));

async function waitForWorkflow(ref, sha, requireImage) {
  let lastStatus = "";
  const deadline = Date.now() + 90 * 60_000;
  while (Date.now() < deadline) {
    const data = api(`actions/runs?head_sha=${sha}&event=push&per_page=100`);
    const run = data.workflow_runs.find(
      (item) =>
        item.head_branch === ref && item.path === ".github/workflows/ci.yaml",
    );
    const status = run
      ? `${run.status}${run.conclusion ? `: ${run.conclusion}` : ""}`
      : "waiting for workflow";
    if (status !== lastStatus) {
      process.stdout.write(
        `${ref}: ${status}${run ? ` (${run.html_url})` : ""}\n`,
      );
      lastStatus = status;
    }
    if (run?.status === "completed") {
      if (run.conclusion !== "success")
        throw new Error(`Validation failed: ${run.html_url}`);
      if (requireImage) {
        const jobs = api(`actions/runs/${run.id}/jobs?per_page=100`).jobs;
        if (
          !jobs.some(
            (job) =>
              job.name === "Publish image to GHCR" &&
              job.conclusion === "success",
          )
        )
          throw new Error(`Image publication did not succeed: ${run.html_url}`);
      }
      return run;
    }
    await new Promise((done) => setTimeout(done, 10_000));
  }
  throw new Error(`Timed out waiting for ${ref} validation.`);
}

async function release(tag) {
  const { prerelease } = releaseVersion(tag);
  const sha = api("git/ref/heads/main").object.sha;
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (head !== sha)
    throw new Error("Sync the local checkout to origin/main before releasing.");
  // Release committed notes, never a local, unreviewed changelog draft.
  const committed = execFileSync("git", ["show", `${sha}:CHANGELOG.md`], {
    cwd: root,
    encoding: "utf8",
  });
  const notes = releaseNotes(committed, tag);
  const refs = api(`git/matching-refs/tags/${encodeURIComponent(tag)}`);
  const existing = refs.find((ref) => ref.ref === `refs/tags/${tag}`);
  if (
    existing &&
    (existing.object.type !== "commit" || existing.object.sha !== sha)
  )
    throw new Error(
      "This release tag already exists on another object; choose a new version.",
    );
  await waitForWorkflow("main", sha, false);
  if (!existing) {
    api(
      "git/refs",
      "--method",
      "POST",
      "-f",
      `ref=refs/tags/${tag}`,
      "-f",
      `sha=${sha}`,
    );
    process.stdout.write(`Created ${tag} on ${sha}.\n`);
  } else
    process.stdout.write(`Resuming ${tag} on ${sha}; the tag is unchanged.\n`);
  await waitForWorkflow(tag, sha, true);
  const releases = api("releases?per_page=100");
  const published = releases.find((item) => item.tag_name === tag);
  if (published) {
    process.stdout.write(`Release already published: ${published.html_url}\n`);
    return;
  }
  const temporary = mkdtempSync(join(tmpdir(), "kokko-release-"));
  try {
    const path = join(temporary, "notes.md");
    writeFileSync(path, notes);
    const args = [
      "release",
      "create",
      tag,
      "--repo",
      repo,
      "--verify-tag",
      "--title",
      tag,
      "--notes-file",
      path,
    ];
    if (prerelease) args.push("--prerelease");
    process.stdout.write(`${gh(...args)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  release(process.argv[2]).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
