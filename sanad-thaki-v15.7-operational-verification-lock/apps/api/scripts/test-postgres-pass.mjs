import pg from "pg";
const { Client } = pg;

const passwords = [
  "",
  "postgres",
  "admin",
  "root",
  "password",
  "123456",
  "12345678",
  "sanad_test_password",
  "REPLACE_WITH_STRONG_DB_PASSWORD",
  "ChangeMe123!Secure",
  "postgres123",
  "manager",
  "db_password"
];

for (const password of passwords) {
  const client = new Client({
    connectionString: `postgresql://postgres:${password}@127.0.0.1:5432/postgres`,
    connectionTimeoutMillis: 500
  });
  try {
    await client.connect();
    console.log("WORKING PASSWORD:", password);
    await client.end();
    break;
  } catch (err) {
    // try next
  }
}
