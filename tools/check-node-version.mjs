/**
 * Fails when the Node major in the Docker image, the `engines` range and every
 * workflow `node-version` disagree.
 *
 * Dependabot bumps the base image automatically (its `docker` ecosystem) but
 * has no mechanism for a `node-version` input, so the workflows only move when
 * someone edits them. That asymmetry is what let fourteen of them sit on 22 or
 * 24 while the image shipped 26. Nothing else checks it.
 */
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const root = path.join(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')

/** `FROM node:26.3.0-alpine3.22` -> 26. Stops at the first dot, so the Alpine version cannot be mistaken for Node's. */
const imageMajor = () => {
  const line = read('Dockerfile')
    .split('\n')
    .find((l) => l.startsWith('FROM node:'))
  if (!line) throw new Error('Dockerfile has no `FROM node:` line')
  const version = line.slice('FROM node:'.length)
  const end = version.indexOf('.')
  return version.slice(0, end === -1 ? undefined : end)
}

/** `>=26.0.0` -> 26. The range is expected to be a single floor, which is what makes it comparable. */
const enginesMajor = () => {
  const range = JSON.parse(read('package.json')).engines?.node ?? ''
  let start = 0
  while (start < range.length && (range[start] < '0' || range[start] > '9')) {
    start += 1
  }
  const end = range.indexOf('.', start)
  return range.slice(start, end === -1 ? undefined : end)
}

const workflowPins = () => {
  const dir = '.github/workflows'
  const pins = []
  for (const file of readdirSync(path.join(root, dir))) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue
    const lines = read(path.join(dir, file)).split('\n')
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('node-version:')) return
      pins.push({
        where: `${dir}/${file}:${index + 1}`,
        value: trimmed.slice('node-version:'.length).trim(),
      })
    })
  }
  return pins
}

const expected = imageMajor()
const problems = []

const engines = enginesMajor()
if (engines !== expected) {
  problems.push(`package.json engines is Node ${engines}, image ships ${expected}`)
}

const pins = workflowPins()
for (const pin of pins) {
  if (pin.value !== expected) {
    problems.push(`${pin.where} pins Node ${pin.value}, image ships ${expected}`)
  }
}

if (problems.length > 0) {
  console.error('Node version drift:\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    `\nThe Docker image is the source of truth. Dependabot bumps it on its own but never touches ${pins.length} workflow pins or engines, so they have to move by hand.`,
  )
  process.exit(1)
}

console.log(
  `Node ${expected} everywhere: Dockerfile, engines, and ${pins.length} workflow pins.`,
)
