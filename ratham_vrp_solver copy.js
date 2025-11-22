const axios = require('axios');

class OSRMClient {
    constructor(baseUrl = "http://35.244.42.110:5000") {
        this.baseUrl = baseUrl;
    }

    async getDistanceMatrix(locations) {
        // locations: [[lat, lon], ...]
        // OSRM expects lon,lat
        const coords = locations.map(loc => `${loc[1]},${loc[0]}`).join(';');
        const url = `${this.baseUrl}/table/v1/driving/${coords}?annotations=distance,duration`;

        try {
            const response = await axios.get(url);
            const data = response.data;
            
            // OSRM returns arrays of arrays (rows)
            // distances[i][j] is distance from i to j
            return {
                distances: data.distances,
                durations: data.durations
            };
        } catch (error) {
            console.error(`Error fetching from OSRM: ${error.message}`);
            // Fallback (Simple Euclidean approximation if OSRM fails, for testing)
            const n = locations.length;
            const dist = Array(n).fill(0).map(() => Array(n).fill(0));
            const time = Array(n).fill(0).map(() => Array(n).fill(0));
            
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    const d = Math.sqrt(
                        Math.pow(locations[i][0] - locations[j][0], 2) + 
                        Math.pow(locations[i][1] - locations[j][1], 2)
                    ) * 111000; // Rough meters
                    dist[i][j] = d;
                    time[i][j] = d / 10.0; // 10 m/s
                }
            }
            return { distances: dist, durations: time };
        }
    }
}

class CuOptServerClient {
    constructor(baseUrl = "https://cuopt-259264810953.asia-southeast1.run.app") {
        this.baseUrl = baseUrl;
        this.optimizeUrl = `${this.baseUrl}/cuopt/request`;
        this.healthUrl = `${this.baseUrl}/cuopt/health`;
    }

    async checkHealth() {
        try {
            const response = await axios.get(this.healthUrl, { timeout: 5000 });
            return response.status === 200;
        } catch (e) {
            return false;
        }
    }

    async getOptimizedRoutes(problemData) {
        try {
            const response = await axios.post(this.optimizeUrl, problemData, {
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 60000
            });
            
            const result = response.data;

            // Check if async
            if (result.reqId && !result.response) {
                console.log(`Async Response Received: ${JSON.stringify(result, null, 2)}`);
                console.log(`Request queued with ID: ${result.reqId}. Polling...`);
                return await this.pollResult(result.reqId);
            }

            return result;
        } catch (error) {
            console.error(`Error calling cuOpt Server: ${error.message}`);
            if (error.response) {
                console.error(`Response Data: ${JSON.stringify(error.response.data)}`);
            }
            return { status: -1, error: error.message };
        }
    }

    async pollResult(reqId, retries = 60) {
        const statusUrl = `${this.baseUrl}/cuopt/request/${reqId}`;
        const solutionUrl = `${this.baseUrl}/cuopt/solution/${reqId}`;
        const headers = { "Accept": "application/json" };

        for (let i = 0; i < retries; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                const response = await axios.get(statusUrl, { headers });
                if (response.status === 200) {
                    let statusData = response.data;
                    
                    // Handle potential MsgPack string response if axios auto-parsed it weirdly or if it's just a string
                    // But axios usually handles JSON. If server returns string "completed", statusData will be "completed"
                    
                    const isCompleted = statusData === "completed" || (typeof statusData === 'object' && statusData.status === "completed");
                    const isFailed = typeof statusData === 'object' && statusData.status === "failed";

                    if (isCompleted) {
                        const solResp = await axios.get(solutionUrl, { headers });
                        return solResp.data;
                    } else if (isFailed) {
                        return { status: -1, error: "Solver failed" };
                    }
                }
            } catch (error) {
                console.error(`Polling error: ${error.message}`);
            }
        }
        return { status: -1, error: "Polling timed out" };
    }
}

class RathamPreprocessor {
    constructor(guardCost = 50000.0) {
        this.guardCost = guardCost;
    }

    processEscorts(employees, officeLoc, distMatrix, timeMatrix) {
        // Separate by gender
        const males = employees.filter(e => e.gender === 'M');
        const females = employees.filter(e => e.gender === 'F');

        // Sort females by distance from office (descending)
        // distMatrix[0] is distances from office (index 0) to all others
        females.forEach(f => {
            f.dist_from_office = distMatrix[0][f.original_idx];
        });
        females.sort((a, b) => b.dist_from_office - a.dist_from_office);

        const availableMales = new Set(males.map(m => m.id));
        const assignedFemales = new Set();
        
        const processedNodes = [];
        const nodeMapping = {};
        
        // Add Office (Node 0)
        processedNodes.push({
            id: 'OFFICE',
            type: 'office',
            demand: 0,
            original_indices: [0]
        });
        let currentIdx = 1;

        // --- Farthest Female First Grouping ---
        for (const fFar of females) {
            if (assignedFemales.has(fFar.id)) continue;

            // Find best male
            let bestM = null;
            let minDetour = Infinity;
            const fIdx = fFar.original_idx;

            for (const m of males) {
                if (availableMales.has(m.id)) {
                    const mIdx = m.original_idx;
                    const d = distMatrix[fIdx][mIdx];
                    if (d < minDetour) {
                        minDetour = d;
                        bestM = m;
                    }
                }
            }

            if (bestM) {
                const groupFemales = [fFar];
                assignedFemales.add(fFar.id);
                availableMales.delete(bestM.id);

                // Batching
                while (groupFemales.length + 1 < 4) {
                    let bestCand = null;
                    let minCandDist = Infinity;
                    
                    for (const fCand of females) {
                        if (!assignedFemales.has(fCand.id)) {
                            const candIdx = fCand.original_idx;
                            const d = distMatrix[fIdx][candIdx];
                            if (d < minCandDist) {
                                minCandDist = d;
                                bestCand = fCand;
                            }
                        }
                    }

                    if (bestCand && minCandDist < 3000) {
                        groupFemales.push(bestCand);
                        assignedFemales.add(bestCand.id);
                    } else {
                        break;
                    }
                }

                groupFemales.sort((a, b) => a.dist_from_office - b.dist_from_office);
                const components = [...groupFemales, bestM];

                let internalTime = 0;
                for (let k = 0; k < components.length - 1; k++) {
                    const c1 = components[k];
                    const c2 = components[k+1];
                    const t = timeMatrix[c1.original_idx][c2.original_idx];
                    internalTime += (c1.service_time || 0) + t;
                }

                const pNode = {
                    id: `Group_${bestM.id}`,
                    type: 'group',
                    demand: components.length,
                    components: components,
                    original_indices: components.map(c => c.original_idx),
                    internal_time: internalTime
                };
                processedNodes.push(pNode);
                nodeMapping[currentIdx] = pNode;
                currentIdx++;
            }
        }

        // --- Remaining Females (Guarded) ---
        const remainingFemales = females.filter(f => !assignedFemales.has(f.id));
        remainingFemales.sort((a, b) => b.dist_from_office - a.dist_from_office);

        while (remainingFemales.length > 0) {
            const group = [remainingFemales.shift()];
            while (remainingFemales.length > 0 && group.length + 1 <= 4) {
                group.push(remainingFemales.shift());
            }

            group.sort((a, b) => a.dist_from_office - b.dist_from_office);
            
            let internalTime = 0;
            for (let k = 0; k < group.length - 1; k++) {
                const c1 = group[k];
                const c2 = group[k+1];
                const t = timeMatrix[c1.original_idx][c2.original_idx];
                internalTime += (c1.service_time || 0) + t;
            }

            const gNode = {
                id: `GuardedGroup_${group[0].id}`,
                type: 'guarded_group',
                demand: group.length + 1, // Females + 1 Guard
                components: group,
                original_indices: group.map(c => c.original_idx),
                internal_time: internalTime
            };
            processedNodes.push(gNode);
            nodeMapping[currentIdx] = gNode;
            currentIdx++;
        }

        // --- Remaining Males ---
        for (const m of males) {
            if (availableMales.has(m.id)) {
                const mNode = {
                    id: `Male_${m.id}`,
                    type: 'male',
                    demand: 1,
                    components: [m],
                    original_indices: [m.original_idx]
                };
                processedNodes.push(mNode);
                nodeMapping[currentIdx] = mNode;
                currentIdx++;
            }
        }

        // Rebuild Matrices
        const nNew = processedNodes.length;
        // Initialize 2D arrays with 0
        const newDist = Array(nNew).fill(0).map(() => Array(nNew).fill(0));
        const newTime = Array(nNew).fill(0).map(() => Array(nNew).fill(0));

        for (let i = 0; i < nNew; i++) {
            for (let j = 0; j < nNew; j++) {
                if (i === j) continue;
                const nodeI = processedNodes[i];
                const nodeJ = processedNodes[j];
                // Distance from LAST component of I to FIRST component of J
                const idxFrom = nodeI.original_indices[nodeI.original_indices.length - 1];
                const idxTo = nodeJ.original_indices[0];
                
                newDist[i][j] = distMatrix[idxFrom][idxTo];
                newTime[i][j] = timeMatrix[idxFrom][idxTo];
            }
        }

        // Calculate Service Times
        const serviceTimes = new Array(nNew).fill(0);
        for (let i = 0; i < nNew; i++) {
            const node = processedNodes[i];
            if (['group', 'guarded_group', 'pair'].includes(node.type)) {
                const lastComp = node.components[node.components.length - 1];
                serviceTimes[i] = node.internal_time + (lastComp.service_time || 0);
            } else if (node.type === 'office') {
                serviceTimes[i] = 0;
            } else {
                serviceTimes[i] = node.components[0].service_time || 0;
            }
        }

        return {
            nodes: processedNodes,
            dist_matrix: newDist,
            time_matrix: newTime,
            service_times: serviceTimes,
            node_mapping: nodeMapping
        };
    }
}

async function solveVrp(processedData, nVehicles, vehicleCapacity, maxDetourTime) {
    const nodes = processedData.nodes;
    const distMatrix = processedData.dist_matrix;
    const timeMatrix = processedData.time_matrix;
    const serviceTimes = processedData.service_times;
    const nLocations = nodes.length;

    // Prepare Time Windows
    const timeWindows = [];
    for (const node of nodes) {
        let limit = parseFloat(maxDetourTime);
        if (['pair', 'group', 'guarded_group'].includes(node.type)) {
            const internalTime = parseFloat(node.internal_time || 0);
            limit = Math.max(0.0, limit - internalTime);
        }

        if (node.type === 'office') {
            timeWindows.push([0, 86400]); // 24 hours
        } else {
            timeWindows.push([0, Math.floor(limit)]); // Use integer limit
        }
    }

    // Construct JSON Payload
    const payload = {
        "cost_matrix_data": {
            "data": {
                "0": distMatrix
            }
        },
        "travel_time_matrix_data": {
            "data": {
                "0": timeMatrix
            }
        },
        "fleet_data": {
            "vehicle_locations": Array(nVehicles).fill([0, 0]),
            "vehicle_ids": Array.from({length: nVehicles}, (_, i) => `Veh_${i}`),
            "vehicle_types": Array(nVehicles).fill(0),
            "capacities": [Array(nVehicles).fill(vehicleCapacity)],
            "vehicle_time_windows": Array(nVehicles).fill([0, 86400]),
            "drop_return_trips": Array(nVehicles).fill(false),  // false = don't return to depot
        },
        "task_data": {
            "task_locations": Array.from({length: nLocations}, (_, i) => i),
            "demand": [nodes.map(n => n.demand)],
            "task_time_windows": timeWindows,
            "service_times": serviceTimes.map(t => Math.floor(t)), // Ensure int
            "order_vehicle_match": (() => {
                // Create order_vehicle_match to ensure one group per vehicle
                // Each group gets assigned to a specific vehicle
                const orderVehicleMatch = [];
                let vehicleIdx = 0;
                
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    
                    if (node.type === 'group' || node.type === 'guarded_group') {
                        // Assign this group to one specific vehicle
                        // This ensures no two groups share a vehicle
                        orderVehicleMatch.push({
                            "order_id": i,
                            "vehicle_ids": [vehicleIdx % nVehicles]
                        });
                        vehicleIdx++;
                    }
                    // Office and single males don't need constraints - they can go on any vehicle
                }
                
                return orderVehicleMatch;
            })()
        },
        "solver_config": {
            "time_limit": 5,
            "objectives": {
                "cost": 1
            }
        }
    };

    const client = new CuOptServerClient();
    console.log("Sending request to cuOpt Server...");
    const result = await client.getOptimizedRoutes(payload);
    return { solution: result, processedData };
}

module.exports = {
    OSRMClient,
    CuOptServerClient,
    RathamPreprocessor,
    solveVrp
};
