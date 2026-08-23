import fs from 'node:fs'
import path from 'node:path'

const migrationsDir = path.resolve('db/migrations')
const output = path.resolve('db/all-in-one.sql')
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
const content = files.map((file) => `-- ===== ${file} =====\n${fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim()}\n`).join('\n')
fs.writeFileSync(output, `${content}\n`)
console.log(`Wrote ${output} from ${files.length} migrations`)
