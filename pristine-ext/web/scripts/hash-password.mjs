import { hashPassword } from '../src/adminAuth.js';

// Generate a scrypt password hash for an admin user.
//
// Usage:
//   node scripts/hash-password.mjs '<password>'              -> prints the hash
//   node scripts/hash-password.mjs '<password>' '<username>' -> prints a ready
//        ADMIN_CREDENTIALS JSON array entry to paste into the env var.
//
// For multiple users, run once per user and merge the arrays:
//   ADMIN_CREDENTIALS=[{"username":"ops1","hash":"..."},{"username":"ops2","hash":"..."}]

const password = process.argv[2];
const username = process.argv[3];

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs '<password>' ['<username>']");
  process.exit(1);
}

const hash = hashPassword(password);

if (username) {
  console.log(JSON.stringify([{ username, hash }]));
} else {
  console.log(hash);
}
