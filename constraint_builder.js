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
        
        // Earliest Drop = Direct Time (Physical minimum)
        // Latest Drop = Direct Time + (SafeDirectTime * deviation)
        // This matches: (Actual - Direct) / SafeDirect <= Percent
        const safeDirectTime = Math.max(directTime, 1800);
        const earliestDrop = directTime;
        const latestDrop = safeDirectTime + (safeDirectTime * maxDetourPercent);
        
        timeWindows.push([Math.floor(earliestDrop), Math.floor(latestDrop)]);
    }

    return timeWindows;
}

module.exports = { buildTimeWindows };
