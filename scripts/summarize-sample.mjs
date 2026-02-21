import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/common.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'apps/api/data/reports');

const args = parseArgs();

const average = (values) => {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const longestZeroStreakMinutes = (samples, key) => {
  if (samples.length === 0) {
    return 0;
  }

  let longest = 0;
  let current = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const currentCount = samples[index][key].entities || 0;
    if (currentCount === 0) {
      if (index === 0) {
        current = 0;
      } else {
        const previous = new Date(samples[index - 1].sampled_at).getTime();
        const now = new Date(samples[index].sampled_at).getTime();
        current += Math.max(0, (now - previous) / 60_000);
      }
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return Math.round(longest);
};

const loadLatestSamplePath = async () => {
  const files = await fs.readdir(reportsDir);
  const matches = files.filter((file) => file.startsWith('feed-sample-') && file.endsWith('.jsonl')).sort();
  if (matches.length === 0) {
    throw new Error('No feed-sample-*.jsonl files found in apps/api/data/reports');
  }

  return path.join(reportsDir, matches[matches.length - 1]);
};

const buildBucketStats = (samples, bucket) => {
  const selected = samples.filter((sample) => sample.hst_bucket === bucket);
  return {
    samples: selected.length,
    avg_vehicles: Number(average(selected.map((sample) => sample.vehiclepositions.entities || 0)).toFixed(2)),
    avg_tripupdates: Number(average(selected.map((sample) => sample.tripupdates.entities || 0)).toFixed(2))
  };
};

const main = async () => {
  const inputPath = args.file ? path.resolve(args.file) : await loadLatestSamplePath();
  const raw = await fs.readFile(inputPath, 'utf8');
  const samples = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (samples.length === 0) {
    throw new Error(`No samples found in ${inputPath}`);
  }

  const vehicleCounts = samples.map((sample) => sample.vehiclepositions.entities || 0);
  const tripUpdateCounts = samples.map((sample) => sample.tripupdates.entities || 0);
  const alertCounts = samples.map((sample) => sample.alerts.entities || 0);

  const summary = {
    source_file: inputPath,
    generated_at: new Date().toISOString(),
    samples: samples.length,
    start: samples[0].sampled_at,
    end: samples[samples.length - 1].sampled_at,
    vehicles: {
      avg: Number(average(vehicleCounts).toFixed(2)),
      min: Math.min(...vehicleCounts),
      max: Math.max(...vehicleCounts),
      longest_zero_streak_minutes: longestZeroStreakMinutes(samples, 'vehiclepositions')
    },
    tripupdates: {
      avg: Number(average(tripUpdateCounts).toFixed(2)),
      min: Math.min(...tripUpdateCounts),
      max: Math.max(...tripUpdateCounts),
      longest_zero_streak_minutes: longestZeroStreakMinutes(samples, 'tripupdates')
    },
    alerts: {
      avg: Number(average(alertCounts).toFixed(2)),
      min: Math.min(...alertCounts),
      max: Math.max(...alertCounts)
    },
    join_consistency: {
      vehiclepositions_trip_join_ratio_avg: Number(
        average(samples.map((sample) => sample.vehiclepositions.trip_join_match_ratio).filter((value) => Number.isFinite(value))).toFixed(3)
      ),
      tripupdates_trip_join_ratio_avg: Number(
        average(samples.map((sample) => sample.tripupdates.trip_join_match_ratio).filter((value) => Number.isFinite(value))).toFixed(3)
      )
    },
    hst_buckets: {
      morning_6_8: buildBucketStats(samples, 'morning_6_8'),
      midday_11_14: buildBucketStats(samples, 'midday_11_14'),
      afternoon_15_17: buildBucketStats(samples, 'afternoon_15_17')
    }
  };

  const markdown = `# Hele-On GTFS-RT Sampling Summary

- Source file: \`${summary.source_file}\`
- Generated at: ${summary.generated_at}
- Samples: ${summary.samples}
- Window: ${summary.start} to ${summary.end}

## VehiclePositions
- Avg entities: ${summary.vehicles.avg}
- Min/Max entities: ${summary.vehicles.min}/${summary.vehicles.max}
- Longest zero streak: ${summary.vehicles.longest_zero_streak_minutes} minutes

## TripUpdates
- Avg entities: ${summary.tripupdates.avg}
- Min/Max entities: ${summary.tripupdates.min}/${summary.tripupdates.max}
- Longest zero streak: ${summary.tripupdates.longest_zero_streak_minutes} minutes

## Alerts
- Avg entities: ${summary.alerts.avg}
- Min/Max entities: ${summary.alerts.min}/${summary.alerts.max}

## Join Consistency (trip_id vs static trips)
- VehiclePositions avg trip join ratio: ${summary.join_consistency.vehiclepositions_trip_join_ratio_avg}
- TripUpdates avg trip join ratio: ${summary.join_consistency.tripupdates_trip_join_ratio_avg}

## Time-of-day Buckets (HST)
- Morning (6-8): vehicles avg ${summary.hst_buckets.morning_6_8.avg_vehicles}, tripupdates avg ${summary.hst_buckets.morning_6_8.avg_tripupdates}
- Midday (11-14): vehicles avg ${summary.hst_buckets.midday_11_14.avg_vehicles}, tripupdates avg ${summary.hst_buckets.midday_11_14.avg_tripupdates}
- Afternoon (15-17): vehicles avg ${summary.hst_buckets.afternoon_15_17.avg_vehicles}, tripupdates avg ${summary.hst_buckets.afternoon_15_17.avg_tripupdates}
`;

  const outputJsonPath = path.join(reportsDir, `feed-sample-summary-${Date.now()}.json`);
  const outputMarkdownPath = outputJsonPath.replace(/\.json$/, '.md');

  await fs.writeFile(outputJsonPath, JSON.stringify(summary, null, 2));
  await fs.writeFile(outputMarkdownPath, markdown);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nSaved summary JSON: ${outputJsonPath}`);
  console.log(`Saved summary Markdown: ${outputMarkdownPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
