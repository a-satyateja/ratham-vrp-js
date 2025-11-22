const axios = require('axios');
const { RathamPreprocessor } = require('./escort_processor');

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
