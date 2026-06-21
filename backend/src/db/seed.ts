import bcrypt from "bcryptjs";
import { pool } from "./pool";

const users = [
  ["alice", "123456", "Alice"],
  ["bob", "123456", "Bob"]
] as const;

async function main() {
  for (const [username, password, displayName] of users) {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `
        INSERT INTO users (username, password_hash, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING
      `,
      [username, passwordHash, displayName]
    );
  }

  console.log("Seed users created: alice, bob. Password: 123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
