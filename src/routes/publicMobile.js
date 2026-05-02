import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/config", async (req, res) => {
  try {
    const versionsResult = await pool.query(
      `SELECT
         id,
         platform,
         version,
         build_number,
         min_supported_version,
         status,
         force_update,
         rollout_percent,
         release_notes_ru,
         release_notes_en,
         created_at,
         updated_at
       FROM public.mobile_app_versions
       ORDER BY platform, version, build_number`
    );

    const featureFlagsResult = await pool.query(
      `SELECT
         id,
         flag_key,
         scope_type,
         scope_code,
         enabled,
         status,
         payload_json,
         description_ru,
         description_en,
         created_at,
         updated_at
       FROM public.mobile_feature_flags
       ORDER BY flag_key, scope_type, scope_code`
    );

    return res.status(200).json({
      ok: true,
      config: {
        versions: versionsResult.rows,
        feature_flags: featureFlagsResult.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_CONFIG_FAILED",
    });
  }
});

router.get("/locations", async (req, res) => {
  try {
    const countriesResult = await pool.query(
      `SELECT
         code,
         name_ru,
         name_en,
         currency_code,
         timezone,
         phone_prefix,
         status,
         created_at,
         updated_at
       FROM public.countries
       ORDER BY code`
    );

    const citiesResult = await pool.query(
      `SELECT
         id,
         country_code,
         slug,
         name_ru,
         name_en,
         timezone,
         currency_code,
         status,
         created_at,
         updated_at
       FROM public.cities
       ORDER BY country_code, slug`
    );

    return res.status(200).json({
      ok: true,
      locations: {
        countries: countriesResult.rows,
        cities: citiesResult.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_LOCATIONS_FAILED",
    });
  }
});

export default router;
