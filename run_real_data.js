const { OSRMClient, RathamPreprocessor, solveVrp } = require('./ratham_vrp_solver');
const fs = require('fs');

async function runRealData() {
    console.log("=== Ratham VRP: Real Data Run (JavaScript) ===\n");
    
    // 1. Load Data
    const employeesData = [
        {"id": "RR128", "gender": "Female", "lat": 13.056822, "lon": 77.605691},
        {"id": "RR159", "gender": "Female", "lat": 13.0616014, "lon": 77.6020946},
        {"id": "RR124", "gender": "Male", "lat": 13.1162201, "lon": 77.5762523},
        {"id": "RR110", "gender": "Female", "lat": 13.0706917, "lon": 77.5692748},
        {"id": "RR158", "gender": "Male", "lat": 13.0981717, "lon": 77.5715433},
        {"id": "RR160", "gender": "Female", "lat": 13.079793, "lon": 77.539245},
        {"id": "RR113", "gender": "Female", "lat": 13.0796352, "lon": 77.5251316},
        {"id": "RR109", "gender": "Male", "lat": 13.0793675672293, "lon": 77.5061745196685},
        {"id": "RR143", "gender": "Male", "lat": 13.0491681, "lon": 77.5712683},
        {"id": "RR021", "gender": "Female", "lat": 13.0322434, "lon": 77.46468},
        {"id": "RR166", "gender": "Female", "lat": 12.9789584, "lon": 77.5167599},
        {"id": "RR108", "gender": "Male", "lat": 12.9785139, "lon": 77.5085597},
        {"id": "RR007", "gender": "Male", "lat": 12.9719936, "lon": 77.5043809},
        {"id": "RR135", "gender": "Female", "lat": 12.9762136, "lon": 77.55436},
        {"id": "RR001", "gender": "Male", "lat": 12.9651494750095, "lon": 77.5443840257935},
        {"id": "RR020", "gender": "Male", "lat": 12.9617905, "lon": 77.5222874999999},
        {"id": "RR169", "gender": "Female", "lat": 12.9631595770108, "lon": 77.5154025405808},
        {"id": "RR156", "gender": "Female", "lat": 12.9099245, "lon": 77.5155384},
        {"id": "RR167", "gender": "Female", "lat": 13.0415942, "lon": 77.6128262},
        {"id": "RR140", "gender": "Male", "lat": 12.9689164, "lon": 77.5700385},
        {"id": "RR154", "gender": "Male", "lat": 12.9694858, "lon": 77.570347},
        {"id": "RR075", "gender": "Female", "lat": 13.0174846, "lon": 77.6052823},
        {"id": "RR126", "gender": "Female", "lat": 12.911402, "lon": 77.5623316},
        {"id": "RR123", "gender": "Female", "lat": 12.9555939981961, "lon": 77.6140363700687},
        {"id": "RR071", "gender": "Male", "lat": 12.9199706, "lon": 77.6150577},
        {"id": "RR032", "gender": "Male", "lat": 12.888442, "lon": 77.592306},
        {"id": "RR073", "gender": "Female", "lat": 13.036684, "lon": 77.612409},
        {"id": "RR145", "gender": "Female", "lat": 13.031367, "lon": 77.61768},
        {"id": "RR121", "gender": "Male", "lat": 13.0321578, "lon": 77.6173165},
        {"id": "RR141", "gender": "Female", "lat": 13.0115605, "lon": 77.6168982},
        {"id": "RR157", "gender": "Female", "lat": 13.003828, "lon": 77.60314},
        {"id": "RR162", "gender": "Male", "lat": 12.998901, "lon": 77.616203},
        {"id": "RR132", "gender": "Female", "lat": 13.012977, "lon": 77.623005},
        {"id": "RR003", "gender": "Male", "lat": 12.999416, "lon": 77.618177},
        {"id": "RR008", "gender": "Male", "lat": 12.999895, "lon": 77.618284},
        {"id": "RR170", "gender": "Female", "lat": 13.0415895, "lon": 77.613167},
        {"id": "RR131", "gender": "Female", "lat": 13.0275573, "lon": 77.6140269},
        {"id": "RR137", "gender": "Male", "lat": 13.0229168041138, "lon": 77.6238636486232},
        {"id": "RR070", "gender": "Female", "lat": 12.91719, "lon": 77.65375},
        {"id": "RR013", "gender": "Female", "lat": 12.7991264510038, "lon": 77.7048707194626},
        {"id": "RR010", "gender": "Female", "lat": 13.0283049, "lon": 77.6455248576308},
        {"id": "RR152", "gender": "Female", "lat": 13.01285, "lon": 77.67355},
        {"id": "RR006", "gender": "Male", "lat": 13.008985, "lon": 77.641918},
        {"id": "RR012", "gender": "Female", "lat": 13.0185849, "lon": 77.6668194},
        {"id": "RR129", "gender": "Female", "lat": 13.0172942, "lon": 77.6660174},
        {"id": "RR153", "gender": "Male", "lat": 12.962535, "lon": 77.67291},
        {"id": "RR138", "gender": "Female", "lat": 12.94706, "lon": 77.70778},
        {"id": "RR036", "gender": "Female", "lat": 12.9523482, "lon": 77.7010268},
        {"id": "RR120", "gender": "Male", "lat": 12.961084, "lon": 77.700257},
        {"id": "RR004", "gender": "Male", "lat": 13.000656, "lon": 77.722014},
        {"id": "RR150", "gender": "Female", "lat": 13.004104, "lon": 77.753713},
        {"id": "RR009", "gender": "Male", "lat": 13.0051472328508, "lon": 77.7528356574475},
        {"id": "RR025", "gender": "Female", "lat": 13.0385245999999, "lon": 77.6613819},
        {"id": "RR127", "gender": "Female", "lat": 13.04063, "lon": 77.67245},
        {"id": "RR076", "gender": "Female", "lat": 13.0238996982855, "lon": 77.6845083944499},
        {"id": "RR171", "gender": "Female", "lat": 13.0294872, "lon": 77.7110044},
        {"id": "RR133", "gender": "Female", "lat": 13.053525, "lon": 77.636678},
        {"id": "RR134", "gender": "Female", "lat": 13.05261, "lon": 77.66902},
        {"id": "RR164", "gender": "Female", "lat": 13.089297, "lon": 77.632139},
        {"id": "RR155", "gender": "Female", "lat": 13.089297, "lon": 77.632139},
        {"id": "RR161", "gender": "Male", "lat": 13.0939201, "lon": 77.6328566},
        {"id": "RR074", "gender": "Male", "lat": 13.0702604, "lon": 77.6278119999999},
        {"id": "RR122", "gender": "Male", "lat": 13.114651, "lon": 77.624069},
        {"id": "RR165", "gender": "Male", "lat": 13.118579, "lon": 77.611404},
        {"id": "RR139", "gender": "Male", "lat": 13.118579, "lon": 77.611404},
        {"id": "RR136", "gender": "Male", "lat": 13.112804, "lon": 77.61822}
    ];
    
    const officeLoc = [13.045063, 77.618812];
    
    // Prepare locations list for OSRM (Office + Employees)
    const locations = [officeLoc];
    
    // Convert employees to internal format
    const formattedEmployees = [];
    for (let i = 0; i < employeesData.length; i++) {
        const e = employeesData[i];
        formattedEmployees.push({
            id: e.id,
            gender: e.gender === 'Male' ? 'M' : 'F',
            location: [e.lat, e.lon],
            service_time: 120, // 2 mins default service time
            original_idx: i + 1 // 0 is office
        });
        locations.push([e.lat, e.lon]);
    }
    
    console.log(`Total Locations: ${locations.length}`);
    
    // 2. Fetch Matrix
    console.log("Fetching Matrix from OSRM...");
    const osrm = new OSRMClient();
    const { distances: distMatrix, durations: timeMatrix } = await osrm.getDistanceMatrix(locations);
    console.log(`Matrix Shape: ${distMatrix.length} x ${distMatrix[0].length}`);
    
    // 3. Pre-process (Escort Logic)
    console.log("\nRunning Pre-processor (Farthest Female First)...");
    const preprocessor = new RathamPreprocessor();
    const result = preprocessor.processEscorts(
        formattedEmployees, officeLoc, distMatrix, timeMatrix
    );
    
    const nodes = result.nodes;
    console.log(`\nGenerated ${nodes.length} Routing Nodes:`);
    
    let groups = 0;
    let guarded = 0;
    let males = 0;
    
    for (const node of nodes) {
        if (node.type === 'group') {
            groups++;
            const comps = node.components.map(c => c.id);
            console.log(`  [GROUP] ${node.id}: [${comps.join(', ')}] (Demand: ${node.demand})`);
        } else if (node.type === 'guarded_group') {
            guarded++;
            const comps = node.components.map(c => c.id);
            console.log(`  [GUARDED] ${node.id}: [${comps.join(', ')}] (Demand: ${node.demand})`);
        } else if (node.type === 'male') {
            males++;
        }
    }
    
    console.log(`\nSummary: ${groups} Groups (with Male), ${guarded} Guarded Groups, ${males} Single Males`);
    
    // 4. Solve
    console.log("\nAttempting to solve with cuOpt Server...");
    const { solution: solutionJson } = await solveVrp(
        result,
        40, // n_vehicles
        4,  // vehicle_capacity
        7200 // max_detour_time (2 hours in seconds)
    );
    
    // Parse Response
    if (solutionJson.response && solutionJson.response.solver_response) {
        const solverResp = solutionJson.response.solver_response;
        const status = solverResp.status !== undefined ? solverResp.status : -1;
        
        if (status === 0) {
            console.log("\n✅ Solution Found!");
            console.log(`Total Cost: ${solverResp.solution_cost}`);
            console.log(`Vehicles Used: ${solverResp.num_vehicles}`);
            
            // Build detailed JSON output
            const detailedOutput = {
                summary: {
                    total_cost: solverResp.solution_cost,
                    vehicles_used: solverResp.num_vehicles,
                    total_employees: employeesData.length,
                    office_location: {
                        lat: officeLoc[0],
                        lon: officeLoc[1]
                    }
                },
                vehicles: []
            };
            
            // Print Routes and build detailed output
            const vehicleData = solverResp.vehicle_data || {};
            for (const [vId, vInfo] of Object.entries(vehicleData)) {
                const route = vInfo.route || [];
                
                // Map route indices back to Node IDs
                const routeIds = route.map(idx => {
                    if (idx < nodes.length) {
                        return nodes[idx].id;
                    } else {
                        return `Unknown_${idx}`;
                    }
                });
                console.log(`  ${vId}: ${routeIds.join(' -> ')}`);
                
                // Build detailed vehicle info
                const vehicleInfo = {
                    vehicle_id: vId,
                    route_summary: routeIds.join(' -> '),
                    employees: [],
                    legs: [],
                    total_distance: 0
                };
                
                // Expand groups to individual employees
                // First, calculate cumulative distances from office to each node
                const cumulativeDistances = [0]; // Office is at index 0
                for (let i = 0; i < route.length - 1; i++) {
                    const fromIdx = route[i];
                    const toIdx = route[i + 1];
                    if (fromIdx < nodes.length && toIdx < nodes.length) {
                        const legDist = result.dist_matrix[fromIdx][toIdx];
                        cumulativeDistances.push(cumulativeDistances[cumulativeDistances.length - 1] + legDist);
                    }
                }
                
                for (let i = 0; i < route.length; i++) {
                    const nodeIdx = route[i];
                    if (nodeIdx >= nodes.length) continue;
                    
                    const node = nodes[nodeIdx];
                    
                    // Skip office nodes
                    if (node.type === 'office') continue;
                    
                    // Get cumulative distance to this node (start of the group)
                    const routeDistanceToNode = cumulativeDistances[i] || 0;
                    
                    // Add all employees in this node
                    if (node.components) {
                        // Calculate internal distances within the group
                        let internalDistance = 0;
                        
                        for (let j = 0; j < node.components.length; j++) {
                            const emp = node.components[j];
                            
                            // Find original employee data
                            const originalEmp = employeesData.find(e => e.id === emp.id);
                            if (originalEmp) {
                                // Calculate direct distance from office to this employee
                                const directDistance = distMatrix[0][emp.original_idx];
                                
                                // Planned route distance = distance to group node + internal travel to this employee
                                const plannedRouteDistance = routeDistanceToNode + internalDistance;
                                
                                // Calculate extra distance
                                const extraDistanceMeters = plannedRouteDistance - directDistance;
                                const extraDistanceKm = extraDistanceMeters / 1000;
                                const percentExtraDistance = directDistance > 0 
                                    ? (extraDistanceMeters / directDistance) * 100 
                                    : 0;
                                
                                vehicleInfo.employees.push({
                                    id: emp.id,
                                    gender: originalEmp.gender,
                                    location: {
                                        lat: originalEmp.lat,
                                        lon: originalEmp.lon
                                    },
                                    direct_distance_from_office_km: Math.round(directDistance) / 1000,
                                    planned_route_distance_km: Math.round(plannedRouteDistance) / 1000,
                                    extra_distance_travelled_km: Math.round(extraDistanceKm * 1000) / 1000,
                                    percent_extra_distance: Math.round(percentExtraDistance * 100) / 100,
                                    group: node.id,
                                    service_time: emp.service_time || 120
                                });
                                
                                // Add internal travel to next employee in the group
                                if (j < node.components.length - 1) {
                                    const nextEmp = node.components[j + 1];
                                    const internalLegDist = distMatrix[emp.original_idx][nextEmp.original_idx];
                                    internalDistance += internalLegDist;
                                }
                            }
                        }
                    }
                }
                
                // Calculate leg distances
                for (let i = 0; i < route.length - 1; i++) {
                    const fromIdx = route[i];
                    const toIdx = route[i + 1];
                    
                    if (fromIdx < nodes.length && toIdx < nodes.length) {
                        const fromNode = nodes[fromIdx];
                        const toNode = nodes[toIdx];
                        const legDistance = result.dist_matrix[fromIdx][toIdx];
                        const legTime = result.time_matrix[fromIdx][toIdx];
                        
                        vehicleInfo.legs.push({
                            from: fromNode.id,
                            to: toNode.id,
                            distance: Math.round(legDistance),
                            time: Math.round(legTime)
                        });
                        
                        vehicleInfo.total_distance += legDistance;
                    }
                }
                
                vehicleInfo.total_distance = Math.round(vehicleInfo.total_distance);
                
                // Only add vehicles that have employees
                if (vehicleInfo.employees.length > 0) {
                    detailedOutput.vehicles.push(vehicleInfo);
                }
            }
            
            // Write to JSON file
            const outputPath = './route_output.json';
            fs.writeFileSync(outputPath, JSON.stringify(detailedOutput, null, 2));
            console.log(`\n📄 Detailed output written to: ${outputPath}`);
            
            // Also print summary stats
            console.log(`\n📊 Summary Statistics:`);
            console.log(`  Total Employees Assigned: ${detailedOutput.vehicles.reduce((sum, v) => sum + v.employees.length, 0)}`);
            console.log(`  Average Employees per Vehicle: ${(detailedOutput.vehicles.reduce((sum, v) => sum + v.employees.length, 0) / detailedOutput.vehicles.length).toFixed(2)}`);
            console.log(`  Total Route Distance: ${detailedOutput.vehicles.reduce((sum, v) => sum + v.total_distance, 0).toLocaleString()} meters`);
            
        } else {
            console.log(`\n❌ Solution Failed with status: ${status}`);
            console.log(JSON.stringify(solverResp, null, 2));
        }
    } else {
        console.log("\n❌ Error or Invalid Response:");
        console.log(JSON.stringify(solutionJson, null, 2));
    }
}

// Run the function
runRealData().catch(err => {
    console.error("Error running real data:", err);
    process.exit(1);
});
