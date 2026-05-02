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

router.get("/city/:countryCode/:citySlug/home", async (req, res) => {
  try {
    const countryCode = String(req.params.countryCode || "").trim().toUpperCase();
    const citySlug = String(req.params.citySlug || "").trim().toLowerCase();

    if (!countryCode || !citySlug) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_CITY_NOT_FOUND",
      });
    }

    const countryResult = await pool.query(
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
       WHERE code = $1
       LIMIT 1`,
      [countryCode]
    );

    if (!countryResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_CITY_NOT_FOUND",
      });
    }

    const cityResult = await pool.query(
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
       WHERE country_code = $1
         AND slug = $2
       LIMIT 1`,
      [countryCode, citySlug]
    );

    if (!cityResult.rows.length) {
      return res.status(404).json({
        ok: false,
        error: "PUBLIC_MOBILE_CITY_NOT_FOUND",
      });
    }

    const salonsResult = await pool.query(
      `SELECT
         s.id,
         s.slug,
         s.name,
         s.enabled,
         s.status,
         s.description,
         s.logo_url,
         s.cover_url,
         s.city,
         s.phone,
         s.slogan
       FROM public.mobile_owner_locations mol
       JOIN public.salons s ON s.id = mol.owner_id
       WHERE mol.owner_type = 'salon'
         AND mol.country_code = $1
         AND mol.city_slug = $2
         AND mol.status = 'active'
         AND COALESCE(s.enabled, true) = true
       ORDER BY s.id`,
      [countryCode, citySlug]
    );

    const mastersResult = await pool.query(
      `SELECT
         m.id,
         m.slug,
         m.name,
         m.active
       FROM public.mobile_owner_locations mol
       JOIN public.masters m ON m.id = mol.owner_id
       WHERE mol.owner_type = 'master'
         AND mol.country_code = $1
         AND mol.city_slug = $2
         AND mol.status = 'active'
         AND COALESCE(m.active, true) = true
       ORDER BY m.id`,
      [countryCode, citySlug]
    );

    return res.status(200).json({
      ok: true,
      home: {
        country: countryResult.rows[0],
        city: cityResult.rows[0],
        salons: salonsResult.rows,
        masters: mastersResult.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_MOBILE_CITY_HOME_FAILED",
    });
  }
});

export default router;
