const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  const baseUrl = process.env.TOTEM_VALIDATION_BASE || "http://localhost:8080";
  const token = process.env.TOTEM_VALIDATION_TOKEN || "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJyb2xlIjoib3duZXIiLCJpYXQiOjE3NzUyODIyMTl9.ZQEdncQ7gnaKlnCrooXe9XPiMmoYRWmfWd_eh6YaMQY";
  const demoSalonSlug = process.env.TOTEM_DEMO_SALON_SLUG || "totem-demo-salon";

  const validationModuleUrl = pathToFileURL(path.join(__dirname, "provisionValidation.js")).href;
  const dbModuleUrl = pathToFileURL(path.join(__dirname, "..", "db.js")).href;

  const [{ validateProvisionFlow }, { pool }] = await Promise.all([
    import(validationModuleUrl),
    import(dbModuleUrl),
  ]);

  try {
    const result = await validateProvisionFlow({
      db: pool,
      baseUrl,
      token,
      demoSalonSlug,
    });

    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("PROVISION_VALIDATION_FAILED");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
