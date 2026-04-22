#!/usr/bin/env node

/**
 * Generate zones.geojson and provinces.geojson from source data
 *
 * Usage:
 *   node scripts/generate-geojson.js [source-file] [simplification-pct]
 *
 * Args:
 *   source-file: Path to source GeoJSON file (default: data/data.geojson)
 *   simplification-pct: Simplification percentage 0-100 (default: 20)
 *                       Higher = more simplification = smaller files
 *
 * This script:
 * 1. Reads source GeoJSON data with zone geometries
 * 2. Simplifies zone geometries using mapshaper (Douglas-Peucker)
 * 3. Outputs simplified zones.geojson
 * 4. Aggregates zones by province and outputs provinces.geojson
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Configuration
const config = {
  sourceFile: process.argv[2] || path.join(projectRoot, 'data', 'data.geojson'),
  simplificationPct: parseFloat(process.argv[3]) || 20, // 0-100, higher = more simplified
  outputDir: path.join(projectRoot, 'data'),
  tempDir: path.join(os.tmpdir(), 'immureach-geojson'),
};

/**
 * Read GeoJSON file
 */
function readGeoJSON(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

/**
 * Write GeoJSON file
 */
function writeGeoJSON(filePath, geojson) {
  fs.writeFileSync(filePath, JSON.stringify(geojson), 'utf8');
  console.log(`✓ Written ${path.relative(projectRoot, filePath)}`);
}

/**
 * Simplify geometries using mapshaper CLI
 */
function simplifyWithMapshaper(sourceFile, outputFile, simplificationPct) {
  // Ensure temp directory exists
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  const tempFile = path.join(config.tempDir, 'temp-simplified.geojson');

  // Use mapshaper to simplify
  // -simplify pct: simplifies using percentage of vertices to keep
  // keep-shapes: prevents removal of small shapes
  const command = `npx mapshaper "${sourceFile}" -simplify ${simplificationPct}% keep-shapes -o format=geojson "${tempFile}"`;

  try {
    console.log(`   Running mapshaper with ${simplificationPct}% simplification...`);
    execSync(command, { stdio: 'pipe' });

    // Copy temp file to output
    fs.copyFileSync(tempFile, outputFile);

    // Clean up temp file
    fs.unlinkSync(tempFile);

    return true;
  } catch (error) {
    console.error(`   ❌ mapshaper error: ${error.message}`);
    return false;
  }
}

/**
 * Aggregate zone metrics to province level
 * Uses proper aggregation: sum counts, recalculate percentages from counts
 */
function aggregateMetricsForProvince(zones) {
  const aggregated = {
    q101: zones[0].properties?.q101
  };

  // Metrics configuration: how to aggregate each metric
  const metricsToAggregate = [
    // Population metrics - sum them
    { name: 'pop_0_12mo', aggregate: 'sum' },
    { name: 'pop_0_5yo', aggregate: 'sum' },
    { name: 'pop_6_12mo', aggregate: 'sum' },
    { name: 'pop_12_24mo', aggregate: 'sum' },
    { name: 'pop_6_24mo', aggregate: 'sum' },
    { name: 'births_per_year', aggregate: 'sum' },

    // Count metrics - sum them
    { name: 'pred_zerodosepenta_count', aggregate: 'sum' },
    { name: 'pred_zerodoseall_count', aggregate: 'sum' },
    { name: 'pred_bcg_count', aggregate: 'sum' },
    { name: 'pred_rota_count', aggregate: 'sum' },
    { name: 'pred_var_count', aggregate: 'sum' },
    { name: 'pred_vaa_count', aggregate: 'sum' },
    { name: 'pred_polio_count', aggregate: 'sum' },
    { name: 'pred_pcv_count', aggregate: 'sum' },

    // IMR - average
    { name: 'imr', aggregate: 'average' },

    // Coverage percentages - recalculate from counts
    { name: 'pred_zerodosepenta', denominator: 'pop_6_24mo', countField: 'pred_zerodosepenta_count', aggregate: 'recalculate' },
    { name: 'pred_zerodoseall', denominator: 'pop_6_24mo', countField: 'pred_zerodoseall_count', aggregate: 'recalculate' },
    { name: 'pred_bcg', denominator: 'pop_6_24mo', countField: 'pred_bcg_count', aggregate: 'recalculate' },
    { name: 'pred_rota', denominator: 'pop_6_24mo', countField: 'pred_rota_count', aggregate: 'recalculate' },
    { name: 'pred_var', denominator: 'pop_6_24mo', countField: 'pred_var_count', aggregate: 'recalculate' },
    { name: 'pred_vaa', denominator: 'pop_6_24mo', countField: 'pred_vaa_count', aggregate: 'recalculate' },
    { name: 'pred_polio', denominator: 'pop_6_24mo', countField: 'pred_polio_count', aggregate: 'recalculate' },
    { name: 'pred_pcv', denominator: 'pop_6_24mo', countField: 'pred_pcv_count', aggregate: 'recalculate' },
  ];

  // First pass: sum and average metrics
  metricsToAggregate.forEach(metric => {
    if (metric.aggregate === 'sum') {
      const values = zones
        .map(z => z.properties?.[metric.name])
        .filter(v => typeof v === 'number' && v >= 0);
      aggregated[metric.name] = values.reduce((a, b) => a + b, 0);
    } else if (metric.aggregate === 'average') {
      const values = zones
        .map(z => z.properties?.[metric.name])
        .filter(v => typeof v === 'number' && v >= 0);
      aggregated[metric.name] = values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
    }
  });

  // Second pass: recalculate coverage percentages from aggregated counts and populations
  metricsToAggregate.forEach(metric => {
    if (metric.aggregate === 'recalculate') {
      const count = aggregated[metric.countField] || 0;
      const denominator = aggregated[metric.denominator] || 1;
      aggregated[metric.name] = denominator > 0 ? count / denominator : 0;
    }
  });

  return aggregated;
}

/**
 * Create provinces GeoJSON by dissolving zones by province using mapshaper
 */
function createProvincesGeoJSON(zonesPath, simplificationPct) {
  // Create a temporary GeoJSON with province field for dissolving
  const tempZonesFile = path.join(config.tempDir, 'temp-zones-for-dissolve.geojson');
  const zonesData = readGeoJSON(zonesPath);

  // Write zones with a field for dissolving
  fs.writeFileSync(tempZonesFile, JSON.stringify(zonesData), 'utf8');

  // Use mapshaper to dissolve zones by province (q101)
  const tempProvincesFile = path.join(config.tempDir, 'temp-provinces-dissolved.geojson');
  const dissolveCommand = `npx mapshaper "${tempZonesFile}" -dissolve q101 -o format=geojson "${tempProvincesFile}"`;

  try {
    console.log(`   Running mapshaper dissolve to create province boundaries...`);
    execSync(dissolveCommand, { stdio: 'pipe' });

    // Read the dissolved provinces
    const provincesData = readGeoJSON(tempProvincesFile);

    // Now aggregate metrics and add them to province properties
    const zonesMap = new Map();
    zonesData.features.forEach(feature => {
      const province = feature.properties?.q101;
      if (!province) return;
      if (!zonesMap.has(province)) {
        zonesMap.set(province, []);
      }
      zonesMap.get(province).push(feature);
    });

    // Add aggregated metrics to each province
    const enrichedFeatures = provincesData.features.map(provinceFeature => {
      const provinceName = provinceFeature.properties?.q101;
      const zoneFeatures = zonesMap.get(provinceName) || [];

      // Aggregate metrics from all zones in this province
      const aggregatedProperties = aggregateMetricsForProvince(zoneFeatures);

      return {
        type: 'Feature',
        properties: aggregatedProperties,
        geometry: provinceFeature.geometry
      };
    });

    // Clean up temp files
    fs.unlinkSync(tempZonesFile);
    fs.unlinkSync(tempProvincesFile);

    return {
      type: 'FeatureCollection',
      features: enrichedFeatures
    };
  } catch (error) {
    console.error(`   ❌ mapshaper dissolve error: ${error.message}`);
    throw error;
  }
}

/**
 * Main function
 */
function main() {
  console.log('🗺️  Generating GeoJSON files with mapshaper...\n');

  // Check if source file exists
  if (!fs.existsSync(config.sourceFile)) {
    console.error(`❌ Source file not found: ${config.sourceFile}`);
    process.exit(1);
  }

  console.log(`📂 Source: ${path.relative(projectRoot, config.sourceFile)}`);
  console.log(`📦 Output: ${path.relative(projectRoot, config.outputDir)}`);
  console.log(`📊 Simplification: ${config.simplificationPct}%\n`);

  // Ensure output directory exists
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // Read source data
  console.log('📖 Reading source data...');
  const sourceData = readGeoJSON(config.sourceFile);
  console.log(`   Found ${sourceData.features.length} zones\n`);

  // Simplify zone geometries using mapshaper
  console.log(`🔧 Simplifying geometries...`);
  const zonesPath = path.join(config.outputDir, 'zones.geojson');

  const simplifySuccess = simplifyWithMapshaper(
    config.sourceFile,
    zonesPath,
    config.simplificationPct
  );

  if (!simplifySuccess) {
    console.error('❌ Simplification failed');
    process.exit(1);
  }

  // Read simplified zones
  const simplifiedData = readGeoJSON(zonesPath);
  console.log(`   Simplified to ${simplifiedData.features.length} zones\n`);

  // Create provinces GeoJSON
  console.log('🏛️  Creating provinces from zones...');
  const provincesGeoJSON = createProvincesGeoJSON(zonesPath, config.simplificationPct);
  console.log(`   Created ${provincesGeoJSON.features.length} provinces\n`);

  const provincesPath = path.join(config.outputDir, 'provinces.geojson');
  writeGeoJSON(provincesPath, provincesGeoJSON);

  console.log('✅ Done!');
  console.log(`
Generated files:
  • zones.geojson (${simplifiedData.features.length} zones)
  • provinces.geojson (${provincesGeoJSON.features.length} provinces)

To regenerate when source data changes, run:
  npm run generate-geojson

To adjust simplification:
  node scripts/generate-geojson.js src_data_new.geojson 30
`);
}

main();
