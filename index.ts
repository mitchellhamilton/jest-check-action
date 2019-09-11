import * as core from "@actions/core";
import * as github from "@actions/github";
import { ChecksUpdateParamsOutputAnnotations } from "@octokit/rest";
import fs from "fs-extra";
import path from "path";

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to use the Jest Check Action");
    return;
  }
  let repo = `${github.context.repo.owner}/${github.context.repo.repo}`;

  const octokit = new github.GitHub(githubToken);
  let json = await fs.readJson("report.json");
  let assertionsGroups: ChecksUpdateParamsOutputAnnotations[][] = [[]];
  for (let testResult of json.testResults) {
    let filename = path.relative(process.cwd(), testResult.name.toString());
    for (let assertionResult of testResult.assertionResults) {
      if (assertionResult.status === "failed") {
        let assertionGroup = assertionsGroups[assertionsGroups.length - 1];
        if (assertionGroup.length === 50) {
          assertionGroup = [];
          assertionsGroups.push(assertionGroup);
        }
        assertionGroup.push({
          path: filename,
          start_line: assertionResult.location.line,
          end_line: assertionResult.location.line,
          annotation_level: "failure",
          message: assertionResult.failureMessages.join("\n\n\n")
        });
      }
    }
  }

  if (!assertionsGroups[0].length) {
    let output = await octokit.checks.create({
      ...github.context.repo,
      name: github.context.workflow,
      status: "completed",
      conclusion: "success",
      head_sha: github.context.sha
    });
  } else {
    let output = await octokit.checks.create({
      ...github.context.repo,
      name: github.context.workflow,
      status: "completed",
      conclusion: "failure",
      head_sha: github.context.sha,
      output: {
        title: `${json.numFailedTests} tests failed`,
        summary: `${json.numFailedTests} tests failed in ${json.numFailedTestSuites}`,
        annotations: assertionsGroups[0]
      }
    });
    for (let assertionsGroup of assertionsGroups.slice(1)) {
      await octokit.checks.update({
        ...github.context.repo,
        check_run_id: output.data.id,
        output: {
          annotations: assertionsGroup,
          title: `${json.numFailedTests} tests failed`,
          summary: `${json.numFailedTests} tests failed in ${json.numFailedTestSuites}`
        }
      });
    }
  }
})().catch(err => {
  console.error(err);
  core.setFailed(err.message);
});
