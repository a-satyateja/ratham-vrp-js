const {
  OSRMClient,
  RathamPreprocessor,
  solveVrp,
} = require("./ratham_vrp_solver");

/**
 * Floyd-Warshall algorithm to normalize distance matrix
 * Finds shortest paths between all pairs of vertices
 * @param {number[][]} matrix - Input distance/time matrix
 * @returns {number[][]} - Normalized matrix with shortest paths
 */
function floydWarshall(matrix) {
  const n = matrix.length;
  // Create a deep copy of the matrix
  const dist = matrix.map((row) => [...row]);

  // Floyd-Warshall algorithm
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }

  return dist;
}

/**
 * Solves the VRP for the given payload
 * @param {Object} payload - Input payload matching generateRoutePayload.json structure
 * @returns {Object} - Output response matching response.json structure
 */
async function solveRoute(payload) {
  try {
    const { employees, config, trip_type } = payload;
    const officeLoc = config.office; // [lat, lon]

    // 1. Prepare locations list for OSRM (Office + Employees)
    const locations = [officeLoc];

    // Convert employees to internal format
    const formattedEmployees = [];
    for (let i = 0; i < employees.length; i++) {
      const e = employees[i];
      formattedEmployees.push({
        id: e.id,
        gender: e.gender === "Male" ? "M" : "F",
        location: [e.lat, e.lon],
        service_time: 120, // Default 2 mins, or could be from config if available
        original_idx: i + 1, // 0 is office
      });
      locations.push([e.lat, e.lon]);
    }

    // 2. Fetch Matrix
    console.log("Fetching Matrix from OSRM...");
    const osrm = new OSRMClient();
    // Note: OSRMClient might need config if it's not hardcoded.
    // Assuming it picks up env vars or defaults.
    // If the payload has osrm_endpoint, we might need to pass it if OSRMClient supports it.
    // Looking at run_real_data.js, it just does `new OSRMClient()`.

    const { distances: distMatrix, durations: timeMatrix } =
      await osrm.getDistanceMatrix(locations);

    console.log(`OSRM Request: ${locations.length} locations.`);
    if (distMatrix) {
      console.log(
        `OSRM Response: Matrix Size ${distMatrix.length}x${distMatrix[0].length}`
      );
      if (distMatrix.length !== locations.length) {
        console.error("CRITICAL ERROR: OSRM returned truncated matrix!");
        console.error(`Expected ${locations.length}, got ${distMatrix.length}`);
      }
    } else {
      console.error("CRITICAL ERROR: OSRM returned null matrix!");
    }

    // 2.1 Apply Floyd-Warshall normalization
    const normalizedDistMatrix = floydWarshall(distMatrix);
    const normalizedTimeMatrix = floydWarshall(timeMatrix);

    const n_vehicles = employees.length; // Safe upper bound
    const vehicle_capacity = config.max_cab_capacity || 4;
    const max_detour_time = 7200; // 2 hours default
    // Dynamic detour percent from input (e.g. 20 -> 0.2), default to 0.3
    const max_detour_percent = config.extra_dist_pct
      ? config.extra_dist_pct / 100
      : 0.3;

    // 3. Pre-process (Escort Logic)
    const preprocessor = new RathamPreprocessor();

    let BYPASS_ESCORT = false;
    if (config.escort_required === false) {
      BYPASS_ESCORT = true;
    }
    let result;

    if (BYPASS_ESCORT) {
      console.log("⚠️ ESCORT LOGIC BYPASSED ⚠️");
      result = {
        dist_matrix: normalizedDistMatrix,
        time_matrix: normalizedTimeMatrix,
        groups: [],
        total_employees: employees.length,
        nodes: [],
      };
    } else {
      console.log("🚨 Escort enabled. Processing escorts...");
      result = preprocessor.processEscorts(
        formattedEmployees,
        officeLoc,
        normalizedDistMatrix,
        normalizedTimeMatrix,
        vehicle_capacity,
        max_detour_percent
      );
      console.log(" 🚨 Escorts processed. Proceeding to solver...");
      console.log(JSON.stringify(result, null, 2));
    }

    // const nodes = result.nodes; // No longer used for solver, only for logging if needed
    const totalLocations = result.total_employees + 1; // Office + Employees

    // Calculate time limit: 10 + (nodes / 6)
    const time_limit = Math.ceil(10 + totalLocations / 6);
    console.log(
      `Calculated Time Limit: ${time_limit}s (Nodes: ${totalLocations})`
    );

    console.log("Attempting to solve with cuOpt Server...");
    const { solution: solutionJson } = await solveVrp(
      result,
      n_vehicles, // Use calculated n_vehicles (employees.length)
      vehicle_capacity,
      max_detour_time,
      max_detour_percent,
      time_limit,
      BYPASS_ESCORT
    );

    // 5. Format Response
    console.log("Solver Response received. Checking structure...");
    if (solutionJson) {
      if (solutionJson.response?.solver_infeasible_response) {
        console.log(
          "Solution JSON:",
          JSON.stringify(solutionJson.response?.solver_infeasible_response)
        );
      }
      if (solutionJson.warnings) {
        console.log("Solution JSON:", JSON.stringify(solutionJson.warnings));
      }
      if (solutionJson.notes) {
        console.log("Solution JSON:", JSON.stringify(solutionJson.notes));
      }
      if (solutionJson.response?.total_solve_time) {
        console.log(
          "Total Solve Time:",
          solutionJson.response.total_solve_time
        );
      }
      console.log("Solution JSON keys:", Object.keys(solutionJson));
      console.log(
        "Solution Response JSON keys:",
        Object.keys(solutionJson.response)
      );
      if (solutionJson.response) {
        console.log(
          "Response status:",
          solutionJson.response.solver_response
            ? solutionJson.response.solver_response.status
            : "No solver_response"
        );
      } else {
        console.log(
          "No 'response' field in solutionJson:",
          JSON.stringify(solutionJson, null, 2)
        );
      }
    } else {
      console.log("solutionJson is null or undefined");
    }

    if (solutionJson.response && solutionJson.response.solver_response) {
      const solverResp = solutionJson.response.solver_response;

      if (solverResp.status === 0) {
        const vehicleData = solverResp.vehicle_data || {};
        const routes = [];

        let cabCounter = 1;
        let totalCost = solverResp.solution_cost;
        let totalDistance = 0;
        let totalFemales = 0;
        let totalMales = 0;
        let maleLedCabs = 0;
        let escortCabs = 0;
        const highDetourEmployees = [];

        for (const [vId, vInfo] of Object.entries(vehicleData)) {
          const routeIndices = vInfo.route || [];

          // Skip empty routes or routes with only office (start/end)
          // Usually route includes start(0) -> nodes -> end(0)
          // We need to check if there are any actual employee nodes
          // Tasks are 1..N
          const employeeNodeIndices = routeIndices.filter((idx) => idx !== 0);

          if (employeeNodeIndices.length === 0) continue;

          const routeEmployees = [];
          let routeDistance = 0;
          let hasFemale = false;
          let hasMale = false;

          // Calculate cumulative distances for the route
          const cumulativeDistances = [0];
          for (let i = 0; i < routeIndices.length - 1; i++) {
            const fromIdx = routeIndices[i];
            const toIdx = routeIndices[i + 1];
            if (fromIdx < totalLocations && toIdx < totalLocations) {
              const legDist = result.dist_matrix[fromIdx][toIdx]; // Original Matrix
              cumulativeDistances.push(
                cumulativeDistances[cumulativeDistances.length - 1] + legDist
              );
              routeDistance += legDist;
            }
          }

          totalDistance += routeDistance;

          let pickupSequence = 1;

          // Iterate through route to build employee details
          for (let i = 0; i < routeIndices.length; i++) {
            const nodeIdx = routeIndices[i];
            if (nodeIdx === 0) continue; // Skip Office

            // NodeIdx i corresponds to employees[i-1]
            // Because we constructed tasks as 0 (Office), 1..N (Employees)
            // And formattedEmployees matches this order.
            const emp = formattedEmployees[nodeIdx - 1];

            if (emp) {
              if (emp.gender === "F") {
                hasFemale = true;
                totalFemales++;
              } else {
                hasMale = true;
                totalMales++;
              }

              const routeDistanceToNode = cumulativeDistances[i] || 0;
              const directDistance = normalizedDistMatrix[0][emp.original_idx];

              // For Drop: Distance is from Office to Employee
              // plannedRouteDistance is cumulative distance from start (Office)
              const plannedRouteDistance = routeDistanceToNode;

              const extraDistanceMeters = plannedRouteDistance - directDistance;
              const percentExtraDistance =
                directDistance > 0
                  ? (extraDistanceMeters / directDistance) * 100
                  : 0;

              routeEmployees.push({
                description: `Pickup #${pickupSequence}`,
                direct_km: parseFloat((directDistance / 1000).toFixed(2)),
                employee_id: emp.id,
                extra_percentage: parseFloat(percentExtraDistance.toFixed(2)),
                gender: emp.gender === "M" ? "Male" : "Female",
                pickup_sequence: pickupSequence,
                trip_km: parseFloat((plannedRouteDistance / 1000).toFixed(2)),
              });

              if (percentExtraDistance > 50) {
                highDetourEmployees.push({
                  id: emp.id,
                  detour_percent: parseFloat(percentExtraDistance.toFixed(2)),
                  direct_km: parseFloat((directDistance / 1000).toFixed(2)),
                  trip_km: parseFloat((plannedRouteDistance / 1000).toFixed(2)),
                });
              }

              pickupSequence++;
            }
          }

          const firstPassenger = routeEmployees[0];
          const isMaleLed = firstPassenger && firstPassenger.gender === "Male";

          const requiresEscort = !isMaleLed;

          if (isMaleLed) maleLedCabs++;
          else escortCabs++;

          routes.push({
            cab_number: cabCounter++,
            employee_details: routeEmployees,
            is_male_led: isMaleLed,
            requires_escort: requiresEscort,
            route_type: isMaleLed ? "MALE-LED PICKUP" : "FEMALE-LED PICKUP",
            total_cost: parseFloat(routeDistance.toFixed(2)),
            total_distance_km: parseFloat((routeDistance / 1000).toFixed(2)),
            trip_type: trip_type,
          });

          const farePerKm = config.fare_per_km || 10;
          routes[routes.length - 1].total_cost = parseFloat(
            (routes[routes.length - 1].total_distance_km * farePerKm).toFixed(2)
          );
        }

        if (highDetourEmployees.length > 0) {
          console.log("\n⚠️  High Detour Alert (>50%):");
          highDetourEmployees.forEach((e) => {
            console.log(
              `  - Employee ${e.id}: ${e.detour_percent}% detour (Direct: ${e.direct_km}km, Actual: ${e.trip_km}km)`
            );
          });
          console.log(""); // Empty line for readability
        }

        return {
          metadata: {
            config_used: {
              ...config,
              osrm_endpoint: "http://35.244.42.110:5000", // Hardcoded or from env
            },
            matrix_status: {
              coordinates_processed: locations.length,
              endpoint_used: "http://35.244.42.110:5000",
              status: "success",
              trip_type: trip_type,
            },
            processing_timestamp: new Date().toISOString(),
            trip_type: trip_type,
          },
          routes: routes,
          groups: result.groups, // Return groups for visualization
          statistics: {
            escort_avoidance_rate: 0,
            escorts_avoided: 0,
            females_added_to_male_routes: totalFemales, // Placeholder logic
            route_reorganizations: 0,
            total_escort_attempts: 0,
          },
          summary: {
            escort_cabs: escortCabs,
            male_led_cabs: maleLedCabs,
            total_cabs: routes.length,
            total_cost: routes.reduce((sum, r) => sum + r.total_cost, 0),
            total_employees: employees.length,
            total_females: totalFemales,
            total_males: totalMales,
            trip_type: trip_type,
          },
        };
      } else {
        throw new Error(`Solver failed with status: ${solverResp.status}`);
      }
    } else {
      throw new Error("Invalid solver response structure");
    }
  } catch (error) {
    console.error("Error in solveRoute:", error);
    throw error;
  }
}

module.exports = { solveRoute };
