import { DashboardRepository } from './server/repository';

async function main() {
  process.env.DB_CLIENT = 'sqlite';
  const repo = new DashboardRepository();
  console.log("--- Testing with empty batches ---");
  const dataAll = await repo.getOverview([]);
  console.log("Overview Data (All):", dataAll.timeSeries.length, "items");
  if (dataAll.timeSeries.length > 0) {
    console.log("First item:", dataAll.timeSeries[0]);
  }

  console.log("\n--- Testing with specific UUID batch (exact match) ---");
  // Use one of the UUIDs from the tasks we know exist
  const testUuid = '1b68b815-3dc5-4045-84b8-84de36813e35';
  const dataFiltered = await repo.getOverview([testUuid]);
  console.log("Overview Data (Filtered):", dataFiltered.timeSeries.length, "items");
  if (dataFiltered.timeSeries.length > 0) {
    console.log("Filtered item:", dataFiltered.timeSeries[0]);
  }
}
main().catch(console.error);
