import "dotenv/config";
import { db } from "@/shared/data/db/client";
import { users } from "@/shared/data/db/schema/users";
import { categories, type NewCategory } from "@/shared/data/db/schema/categories";
import { DEFAULT_CATEGORIES } from "@/shared/data/db/defaults";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

async function seed() {
  console.log("Creating dev user...");

  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: "dev@fintrack.app",
      passwordHash: "TODO-hash",
      name: "Desenvolvedor",
    })
    .onConflictDoNothing();

  console.log("Seeding default categories...");

  const defaultCategories: NewCategory[] = DEFAULT_CATEGORIES.map((cat) => ({
    name: cat.name,
    color: cat.color,
    icon: cat.icon,
    isDefault: false,
    userId: DEV_USER_ID,
  }));

  await db.insert(categories).values(defaultCategories).onConflictDoNothing();

  console.log("Seed completed.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
