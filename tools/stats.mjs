// Print the tuning numbers. Usage: npm run stats            (everything)
//                                  npm run stats -- enemies  (one section)
//                                  npm run stats -- enemies.grunt.maxHealth
import { statRows } from '../src/data/stats.js';

const prefix = process.argv[2] ?? '';
const rows = statRows(prefix);
const width = Math.max(...rows.map(([p]) => p.length));
for (const [path, value] of rows) console.log(`${path.padEnd(width)}  ${JSON.stringify(value)}`);
