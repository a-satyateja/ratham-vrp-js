class RathamPreprocessor {
    constructor(guardCost = 50000.0) {
        this.guardCost = guardCost;
    }

    processEscorts(employees, officeLoc, distMatrix, timeMatrix, vehicleCapacity = 4, maxDetourPercent = 0.5) {
        // Helper to validate a group using TIME and SERVICE TIME
        console.log("Processing escorts...");
        const isGroupValid = (members) => {
            const males = members.filter(m => m.gender === 'M');
            const females = members.filter(m => m.gender === 'F');

            // Sort females by distance from office (Ascending: Office -> Close -> Far)
            // Note: We use distance for sorting, but time for validation.
            females.sort((a, b) => a.dist_from_office - b.dist_from_office);
            
            // Construct Route: Office -> Females -> Male(s)
            const routeOrder = [...females, ...males];
            
            let currentRouteTime = 0;
            let prevIdx = 0; // Office
            
            for (const member of routeOrder) {
                const travelTime = timeMatrix[prevIdx][member.original_idx];
                currentRouteTime += travelTime;
                
                // Arrived at member. Check detour.
                // Direct time from office
                const directTime = timeMatrix[0][member.original_idx];
                
                // Detour = (Actual Arrival Time - Direct Arrival Time) / Direct Arrival Time
                // Note: Actual Arrival Time does NOT include service time at this stop (drop-off), 
                // but DOES include service times of PREVIOUS stops.
                
                // Handle small direct times to avoid huge percentages
                const safeDirectTime = Math.max(directTime, 1800); // Min 30 mins baseline
                
                const detour = (currentRouteTime - directTime) / safeDirectTime;
                
                if (detour > maxDetourPercent) return false;
                
                // Add service time for NEXT leg
                currentRouteTime += (member.service_time || 120);
                prevIdx = member.original_idx;
            }
            return true;
        };

        // Separate by gender
        const males = employees.filter(e => e.gender === 'M');
        const females = employees.filter(e => e.gender === 'F');

        // Calculate distance from office for all employees
        employees.forEach(e => {
            e.dist_from_office = distMatrix[0][e.original_idx];
        });

        const processedNodes = [];
        const nodeMapping = {};
        let currentIdx = 1;

        // Add Office (Node 0)
        processedNodes.push({
            id: 'OFFICE',
            type: 'office',
            demand: 0,
            original_indices: [0]
        });

        // --- Step 1: Male-Centric Grouping ---
        // We want to find the BEST male to lead a group, prioritizing filling the vehicle.
        
        const assignedFemales = new Set();
        const assignedMales = new Set();
        const MAX_FEMALES_PER_GROUP = vehicleCapacity - 1;
        const MAX_DIST_FEMALE_TO_MALE = 10000; // 10km in meters

        while (true) {
            let bestGroup = null;
            let bestScore = -Infinity;

            // Iterate through all available males
            for (const m of males) {
                if (assignedMales.has(m.id)) continue;

                // Find all compatible females for this male
                const compatibleFemales = [];
                for (const f of females) {
                    if (assignedFemales.has(f.id)) continue;

                    // Constraint 1: Distance between Female and Male <= 10km
                    const distFToM = distMatrix[f.original_idx][m.original_idx];
                    if (distFToM > MAX_DIST_FEMALE_TO_MALE) continue;

                    // Constraint 2: Detour Check (Quick pre-check, full validation later)
                    // Simple check: Office -> F -> M detour for M
                    const distOfficeToM = m.dist_from_office;
                    const distOfficeToF = f.dist_from_office;
                    
                    let detour = Infinity;
                    if (distOfficeToM > 0) {
                        detour = (distOfficeToF + distFToM - distOfficeToM) / distOfficeToM;
                    } else {
                        detour = distFToM < 1000 ? 0 : Infinity;
                    }

                    if (detour <= maxDetourPercent) {
                        compatibleFemales.push({ female: f, distToM: distFToM });
                    }
                }

                // If no compatible females, this male can't lead a group right now
                if (compatibleFemales.length === 0) continue;

                // Form the best possible group for this male
                // Heuristic: Pick closest females to the male to minimize internal distance
                compatibleFemales.sort((a, b) => a.distToM - b.distToM);
                
                // Try to take as many as possible up to capacity
                const candidateFemales = [];
                for (const item of compatibleFemales) {
                    if (candidateFemales.length >= MAX_FEMALES_PER_GROUP) break;
                    
                    // Verify group validity incrementally
                    const testGroup = [...candidateFemales, item.female, m];
                    if (isGroupValid(testGroup)) {
                        candidateFemales.push(item.female);
                    }
                }

                if (candidateFemales.length > 0) {
                    // Score this group
                    // Primary Goal: Maximize size (Weight: 1000 per female)
                    // Secondary Goal: Minimize total distance or detour (Weight: -1 * internal_dist)
                    // We use a simple score for now
                    const sizeScore = candidateFemales.length * 1000;
                    
                    // Calculate internal distance (proxy for efficiency)
                    // Sort by office dist for routing calculation
                    const groupForCalc = [...candidateFemales, m];
                    groupForCalc.sort((a, b) => a.dist_from_office - b.dist_from_office);
                    
                    let internalDist = 0;
                    for(let k=0; k<groupForCalc.length-1; k++) {
                        internalDist += distMatrix[groupForCalc[k].original_idx][groupForCalc[k+1].original_idx];
                    }

                    // Normalize distance impact (e.g., subtract km)
                    const score = sizeScore - (internalDist / 1000);

                    if (score > bestScore) {
                        bestScore = score;
                        bestGroup = {
                            male: m,
                            females: candidateFemales,
                            internalDist: internalDist
                        };
                    }
                }
            }

            // If we found a group in this pass, commit it
            if (bestGroup) {
                const { male, females: groupFemales } = bestGroup;
                
                // Mark assigned
                assignedMales.add(male.id);
                groupFemales.forEach(f => assignedFemales.add(f.id));

                // Create Node
                const components = [...groupFemales, male];
                // Sort for time calc (Office -> Closest -> Farthest)
                components.sort((a, b) => a.dist_from_office - b.dist_from_office);

                let internalTime = 0;
                for (let k = 0; k < components.length - 1; k++) {
                    const c1 = components[k];
                    const c2 = components[k+1];
                    const t = timeMatrix[c1.original_idx][c2.original_idx];
                    internalTime += (c1.service_time || 0) + t;
                }

                const pNode = {
                    id: `Group_${male.id}`,
                    type: 'group',
                    demand: components.length,
                    components: components,
                    original_indices: components.map(c => c.original_idx),
                    internal_time: internalTime
                };
                processedNodes.push(pNode);
                nodeMapping[currentIdx] = pNode;
                currentIdx++;

            } else {
                // No more groups can be formed
                break;
            }
        }

        // --- Step 2: Remaining Females (Guarded Groups) ---
        const remainingFemales = females.filter(f => !assignedFemales.has(f.id));
        // Sort by distance (descending) - Start with farthest
        remainingFemales.sort((a, b) => b.dist_from_office - a.dist_from_office);
        
        const assignedRemaining = new Set();

        for (const f of remainingFemales) {
            if (assignedRemaining.has(f.id)) continue;
            
            const group = [f];
            assignedRemaining.add(f.id);
            
            // Try to fill with other unmatchable females
            for (const candidate of remainingFemales) {
                if (assignedRemaining.has(candidate.id)) continue;
                if (group.length >= vehicleCapacity - 1) break; // -1 for guard

                // Check if adding candidate is valid
                if (isGroupValid([...group, candidate])) {
                    group.push(candidate);
                    assignedRemaining.add(candidate.id);
                }
            }

            // Create Node
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

        // --- Step 3: Remaining Males ---
        for (const m of males) {
            if (!assignedMales.has(m.id)) {
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

        // Collect all groups for solver constraints
        const groups = [];
        for (const node of processedNodes) {
            if (node.type === 'group' || node.type === 'guarded_group') {
                groups.push(node);
            }
        }
        
        return {
            nodes: processedNodes,
            dist_matrix: distMatrix,
            time_matrix: timeMatrix,
            groups: groups,
            total_employees: employees.length
        };
    }
}

module.exports = {
    RathamPreprocessor
};
