import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'supabase')
const migDir = path.join(root, 'migrations')
const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()

let out =
  '-- RoboCup Tabarestan ALL-IN-ONE (UTF-8)\n-- Paste into Supabase SQL Editor and Run once\n\n'

for (const f of files) {
  out += `\n-- >>> BEGIN ${f}\n`
  out += fs.readFileSync(path.join(migDir, f), 'utf8')
  if (!out.endsWith('\n')) out += '\n'
  out += `-- <<< END ${f}\n`
}

out += '\n-- >>> BEGIN seed.sql\n'
out += fs.readFileSync(path.join(root, 'seed.sql'), 'utf8')
if (!out.endsWith('\n')) out += '\n'
out += '-- <<< END seed.sql\n'

const dest = path.join(root, 'all-in-one.sql')
fs.writeFileSync(dest, out, 'utf8')

const sample = fs.readFileSync(dest, 'utf8')
const i = sample.indexOf('Humanoid')
console.log(sample.slice(i, i + 70))
