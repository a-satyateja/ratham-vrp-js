/**
 * Calculates time window constraints for VRP nodes based on deviation percentage.
 * 
 * Logic:
 * For each employee, the drop-off time window is [DirectTime, DirectTime * (1 + maxDeviation)].
 * 
 * For a Group Node (which represents the start of the group's route):
 * - The solver determines the arrival time T at the first component.
 * - For each member i in the group at offset O_i from the start:
 *      Arrival_i = T + O_i
 *      Constraint: DirectTime_i <= Arrival_i <= DirectTime_i * (1 + maxDeviation)
 *      Therefore:  DirectTime_i - O_i <= T <= DirectTime_i * (1 + maxDeviation) - O_i
 * 
 * - The Group's time window [Start, End] is the intersection of these constraints:
 *      Start = Max(DirectTime_i - O_i) for all i
 *      End   = Min(DirectTime_i * (1 + maxDeviation) - O_i) for all i
 * 
 * @param {Array} nodes - List of processed nodes (groups, males, etc.)
 * @param {Array} distMatrix - Distance matrix (not strictly needed if using timeMatrix, but good for ref)
 * @param {Array} timeMatrix - Time matrix (seconds)
 * @param {number} maxDetourPercent - Allowed deviation (e.g., 0.5 for 50%)
 * @returns {Array} - Array of [start, end] time windows for each node
 */
/**
 * Calculates time window constraints for VRP tasks (Employees).
 * 
 * Logic:
 * For each employee (Task i), the drop-off time window is [DirectTime, DirectTime * (1 + maxDeviation)].
 * Task 0 (Office) has [0, 86400].
 * 
 * @param {number} totalEmployees - Total number of employees (excluding office)
 * @param {Array} timeMatrix - Original Time matrix (seconds)
 * @param {number} maxDetourPercent - Allowed deviation (e.g., 0.5 for 50%)
 * @returns {Array} - Array of [start, end] time windows for each task (0..N)
 */
function buildTimeWindows(totalEmployees, timeMatrix, maxDetourPercent) {
    const timeWindows = [];
    
    // DEBUG: Check Matrix Dimensions
    if (!timeMatrix || !timeMatrix.length) {
        console.error("ConstraintBuilder: timeMatrix is undefined or empty!");
        return [];
    } else {
        console.log(`ConstraintBuilder: timeMatrix size: ${timeMatrix.length}x${timeMatrix[0].length}`);
    }

    // Task 0: Office
    timeWindows.push([0, 86400]);

    // Tasks 1..N: Employees
    // Assuming task index i maps to original_idx i in timeMatrix
    for (let i = 1; i <= totalEmployees; i++) {
        // Direct Time from Office (Node 0) to Employee i
        if (!timeMatrix[0] || timeMatrix[0][i] === undefined) {
             console.error(`ConstraintBuilder Error: timeMatrix[0][${i}] is undefined!`);
             timeWindows.push([0, 86400]); // Fallback
             continue;
        }

        const directTime = timeMatrix[0][i];
        
        // Earliest Drop = Direct Time
        // Latest Drop = Direct Time * (1 + deviation)
        const earliestDrop = directTime;
        const latestDrop = directTime * (1 + maxDetourPercent);
        
        timeWindows.push([Math.floor(earliestDrop), Math.floor(latestDrop)]);
    }

    return timeWindows;
}

module.exports = { buildTimeWindows };
