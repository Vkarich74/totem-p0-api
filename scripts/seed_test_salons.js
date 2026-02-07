import db from "../db.js";

async function main() {
  const salons = [
    { id: 1, slug: "salon-1", name: "Salon 1" },
    { id: 2, slug: "salon-2", name: "Salon 2" },
    { id: 3, slug: "salon-3", name: "Salon 3" },
    { id: 4, slug: "salon-4", name: "Salon 4" },
    { id: 5, slug: "salon-5", name: "Salon 5" },
  ];

  for (const s of salons) {
    await db.run(
      `
      INSERT OR IGNORE INTO salons (id, slug, name, status)
      VALUES (?, ?, ?, 'active')
      `,
      [s.id, s.slug, s.name]
    );
  }

  console.log("[OK] TEST SALONS SEEDED:", salons.map(s => s.slug).join(", "));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("SEED ERROR:", e);
    process.exit(1);
  });
