const fs = require("fs");
const path = require("path");

function main() {
  const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
  
  let targetProvider = "sqlite";
  if (databaseUrl.startsWith("postgres:") || databaseUrl.startsWith("postgresql:")) {
    targetProvider = "postgresql";
  }

  const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: schema.prisma not found at ${schemaPath}`);
    process.exit(1);
  }

  const originalContent = fs.readFileSync(schemaPath, "utf8");

  // Regex to match provider inside datasource db block
  const regex = /(datasource\s+db\s*{[\s\S]*?provider\s*=\s*")([^"]+)("[^}]*})/g;

  let currentProvider = "";
  const matches = originalContent.matchAll(regex);
  for (const match of matches) {
    currentProvider = match[2];
  }

  if (currentProvider === targetProvider) {
    console.log(`[prepare-db] schema.prisma provider is already "${targetProvider}". No change needed.`);
    return;
  }

  const updatedContent = originalContent.replace(regex, `$1${targetProvider}$3`);
  fs.writeFileSync(schemaPath, updatedContent, "utf8");
  console.log(`[prepare-db] Updated schema.prisma provider from "${currentProvider}" to "${targetProvider}".`);
}

main();
