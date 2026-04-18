#!/usr/bin/env node
const { execSync } = require("child_process")

const ASSIGNEE = "chrismichaelps"

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", cwd: process.cwd() })
}

function main() {
  console.log("Fetching merged PRs...")

  const prs = JSON.parse(run(`gh pr list --state merged -L 100 --json number`))

  console.log(`Found ${prs.length} merged PRs`)

  for (const pr of prs) {
    const prNum = pr.number
    console.log(`\nAssigning #${prNum}...`)

    try {
      run(`gh pr edit ${prNum} --add-assignee ${ASSIGNEE}`)
      console.log(`  ✓ Assigned #${prNum} to ${ASSIGNEE}`)
    } catch (e) {
      console.error(`  ✗ Failed to assign #${prNum}: ${e.message}`)
    }
  }

  console.log(`\nDone! Assigned ${prs.length} PRs to ${ASSIGNEE}`)
}

main()