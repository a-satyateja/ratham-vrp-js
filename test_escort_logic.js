const { RathamPreprocessor } = require('./escort_processor');

// Mock Data Setup
const officeLoc = [12.9716, 77.5946]; // Bangalore coordinates

// Create mock employees
// 5 Females, 3 Males
// F1: Far (10km)
// F2: Far (9km)
// F3: Medium (5km)
// F4: Medium (4km)
// F5: Close (1km)
// M1: Far (10km) - Good match for F1
// M2: Close (2km) - Bad match for F1 (huge detour)
// M3: Medium (5km)

const employees = [
    { id: 'F1', gender: 'F', original_idx: 1, lat: 13.0, lon: 77.6 },
    { id: 'F2', gender: 'F', original_idx: 2, lat: 13.0, lon: 77.6 },
    { id: 'F3', gender: 'F', original_idx: 3, lat: 13.0, lon: 77.6 },
    { id: 'F4', gender: 'F', original_idx: 4, lat: 13.0, lon: 77.6 },
    { id: 'F5', gender: 'F', original_idx: 5, lat: 13.0, lon: 77.6 },
    { id: 'M1', gender: 'M', original_idx: 6, lat: 13.0, lon: 77.6 },
    { id: 'M2', gender: 'M', original_idx: 7, lat: 13.0, lon: 77.6 },
    { id: 'M3', gender: 'M', original_idx: 8, lat: 13.0, lon: 77.6 },
];

// Mock Matrices (9x9 including office at 0)
// Distances in meters
const n = 9;
const distMatrix = Array(n).fill(0).map(() => Array(n).fill(0));
const timeMatrix = Array(n).fill(0).map(() => Array(n).fill(0)); // Not critical for this test

// Helper to set symmetric distance
function setDist(i, j, d) {
    distMatrix[i][j] = d;
    distMatrix[j][i] = d;
}

// Office (0) distances
setDist(0, 1, 10000); // F1
setDist(0, 2, 9000);  // F2
setDist(0, 3, 5000);  // F3
setDist(0, 4, 4000);  // F4
setDist(0, 5, 1000);  // F5
setDist(0, 6, 10000); // M1
setDist(0, 7, 2000);  // M2
setDist(0, 8, 5000);  // M3

// Inter-node distances
// F1 is close to M1
setDist(1, 6, 500); 

// F2 is far from everyone except maybe F1
setDist(2, 1, 1000);
setDist(2, 6, 1500);

// F5 is close to M2
setDist(5, 7, 200);

// F3, F4 close to M3
setDist(3, 8, 300);
setDist(4, 8, 400);
setDist(3, 4, 200);

// F2 is very far from M2 (detour check)
// Office -> F2 (9000) -> M2 (2000)
// Direct M2: 2000
// Detour: (9000 + dist(F2, M2) - 2000) / 2000
// If dist(F2, M2) is large, detour is huge.
setDist(2, 7, 8000); 

// Run Test
console.log("Running Escort Logic Test...");
const preprocessor = new RathamPreprocessor();

// Test 1: Standard Capacity 4, 50% Detour
console.log("\n--- Test 1: Cap 4, Detour 50% ---");
const res1 = preprocessor.processEscorts(employees, officeLoc, distMatrix, timeMatrix, 4, 0.5);
printResults(res1);

// Test 2: Small Capacity 2 (1F + 1M), 50% Detour
console.log("\n--- Test 2: Cap 2, Detour 50% ---");
const res2 = preprocessor.processEscorts(employees, officeLoc, distMatrix, timeMatrix, 2, 0.5);
printResults(res2);

// Test 3: Strict Detour 10%
console.log("\n--- Test 3: Cap 4, Detour 10% ---");
const res3 = preprocessor.processEscorts(employees, officeLoc, distMatrix, timeMatrix, 4, 0.1);
printResults(res3);

function printResults(result) {
    let groups = 0;
    let guarded = 0;
    let males = 0;
    
    result.nodes.forEach(node => {
        const comps = node.components.map(c => c.id).join(',');
        if (node.type === 'group') {
            groups++;
            console.log(`  [GROUP] ${node.id}: [${comps}]`);
        } else if (node.type === 'guarded_group') {
            guarded++;
            console.log(`  [GUARDED] ${node.id}: [${comps}]`);
        } else if (node.type === 'male') {
            males++;
            console.log(`  [MALE] ${node.id}: [${comps}]`);
        }
    });
    console.log(`  Summary: ${groups} Groups, ${guarded} Guarded, ${males} Males`);
}
