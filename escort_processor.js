class RathamPreprocessor {
    constructor(guardCost = 50000.0) {
        this.guardCost = guardCost;
    }

    processEscorts(employees, officeLoc, distMatrix, timeMatrix, vehicleCapacity = 4, maxDetourPercent = 0.5) {
        // Helper to validate a group
        const isGroupValid = (members) => {
            const males = members.filter(m => m.gender === 'M');
            const females = members.filter(m => m.gender === 'F');

            // Sort females by distance from office (Ascending: Office -> Close -> Far)
            females.sort((a, b) => a.dist_from_office - b.dist_from_office);
            
            // Construct Route: Office -> Females -> Male(s)
            // If multiple males, we assume they are dropped last. 
            // For this specific logic where we have 1 escort, he is last.
            // If we had multiple males, maybe we sort them too? 
            // But usually only 1 escort is needed.
            // Let's put all males at the end.
            const routeOrder = [...females, ...males];
            
            let currentRouteDist = 0;
            let prevIdx = 0; // Office
            
            for (const member of routeOrder) {
                currentRouteDist += distMatrix[prevIdx][member.original_idx];
                prevIdx = member.original_idx;
                
                const directDist = distMatrix[0][member.original_idx];
                const detour = directDist > 0 ? (currentRouteDist - directDist) / directDist : 0;
                
                if (detour > maxDetourPercent) return false;
            }
            return true;
        };

        // Separate by gender
        const males = employees.filter(e => e.gender === 'M');
        const females = employees.filter(e => e.gender === 'F');

        // Calculate distance from office for all females
        // distMatrix[0] is distances from office (index 0) to all others
        females.forEach(f => {
            f.dist_from_office = distMatrix[0][f.original_idx];
        });

        // --- Step 1: Identify Unmatchable Females ---
        const unmatchableFemales = [];
        const matchableFemales = [];

        for (const f of females) {
            let canBeMatched = false;
            // Check if there is ANY male that satisfies the detour constraint
            for (const m of males) {
                const distOfficeToM = distMatrix[0][m.original_idx];
                const distOfficeToF = f.dist_from_office;
                const distFToM = distMatrix[f.original_idx][m.original_idx];
                
                // Route: Office -> Female -> Male
                // Detour is calculated for the MALE (who is the "anchor" or driver-like figure in this logic?)
                // Actually, the constraint is usually on the PASSENGER's detour or the TOTAL detour.
                // The prompt says: "ensure all the employees added to this group are satisfying the % detour constarint."
                // Usually detour is (Actual Path - Direct Path) / Direct Path.
                // For Female: Direct is Office->F. Actual is Office->F->M (if she is dropped first? No, M is last).
                // If M is last, the route is Office -> F -> M.
                // Female travels Office -> F. (Wait, is this pickup or drop?)
                // If it's DROP (Office -> Home):
                // Route: Office -> F -> M.
                // F travels Office -> F. Distance is dist(Office, F). This is direct. 0 detour for F?
                // M travels Office -> F -> M. Direct is dist(Office, M).
                // Detour for M: (dist(Office, F) + dist(F, M) - dist(Office, M)) / dist(Office, M).
                
                // If it's PICKUP (Home -> Office):
                // Route: F -> M -> Office.
                // F travels F -> M -> Office. Direct is dist(F, Office).
                // Detour for F: (dist(F, M) + dist(M, Office) - dist(F, Office)) / dist(F, Office).
                // M travels M -> Office. Direct is dist(M, Office). 0 detour for M.
                
                // The code in `run_real_data.js` seems to imply "Pickup" logic or "Drop" logic depending on how you read it.
                // But `processEscorts` creates groups.
                // The previous logic calculated `minDetour` as `distMatrix[fIdx][mIdx]`.
                // This is just the distance between F and M.
                
                // Let's assume the constraint is on the MALE's detour if he is the escort?
                // "ensure all the employees added to this group are satisfying the % detour constarint"
                // If it's a shared cab, everyone should satisfy the constraint.
                // Let's assume the standard VRP definition:
                // Detour = (Actual Travel Time/Dist - Direct Travel Time/Dist) / Direct.
                
                // In a group [F1, F2, M], the route is likely optimized.
                // But here we are building the group.
                // Let's assume the route order is F1 -> F2 -> M (or optimized).
                // For simplicity in this pre-processor, let's assume we check if M can pick up F without M suffering too much detour?
                // OR if F can join M without F suffering?
                // Usually "Escort" means M is there to protect F.
                // If M is the last one out (Drop) or first one in (Pickup), he is the escort.
                // Let's assume DROP: Office -> F -> M.
                // M has to travel extra to drop F.
                // So we check M's detour.
                
                if (distOfficeToM > 0) {
                    const detour = (distOfficeToF + distFToM - distOfficeToM) / distOfficeToM;
                    if (detour <= maxDetourPercent) {
                        canBeMatched = true;
                        break;
                    }
                } else {
                    // If M is at office (0 dist), any deviation is infinite detour?
                    // Or maybe he is the driver?
                    // Let's assume if dist is 0, he can't be an escort for someone far away?
                    // Or he is just available.
                    if (distFToM < 1000) canBeMatched = true; // Arbitrary small dist
                }
            }

            if (canBeMatched) {
                matchableFemales.push(f);
            } else {
                unmatchableFemales.push(f);
            }
        }

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

        // --- Step 2: Guarded Groups (Unmatchable) ---
        // Sort by distance (descending) - Start with farthest
        unmatchableFemales.sort((a, b) => b.dist_from_office - a.dist_from_office);
        const assignedUnmatchable = new Set();

        for (const f of unmatchableFemales) {
            if (assignedUnmatchable.has(f.id)) continue;
            
            const group = [f];
            assignedUnmatchable.add(f.id);
            
            // Try to fill with other unmatchable females
            for (const candidate of unmatchableFemales) {
                if (assignedUnmatchable.has(candidate.id)) continue;
                if (group.length >= vehicleCapacity - 1) break; // -1 for guard

                // Check if adding candidate is valid
                if (isGroupValid([...group, candidate])) {
                    group.push(candidate);
                    assignedUnmatchable.add(candidate.id);
                }
            }

            // Create Node
            // Sort internally for time calculation
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

        // --- Step 3: Male Escorted Groups (Matchable) ---
        matchableFemales.sort((a, b) => b.dist_from_office - a.dist_from_office);
        const availableMales = new Set(males.map(m => m.id));
        const assignedFemales = new Set();

        for (const fFar of matchableFemales) {
            if (assignedFemales.has(fFar.id)) continue;

            // Find best male
            let bestM = null;
            let minDetour = Infinity;
            
            for (const m of males) {
                if (availableMales.has(m.id)) {
                    const distOfficeToM = distMatrix[0][m.original_idx];
                    const distOfficeToF = fFar.dist_from_office;
                    const distFToM = distMatrix[fFar.original_idx][m.original_idx];
                    
                    let detour = Infinity;
                    if (distOfficeToM > 0) {
                        detour = (distOfficeToF + distFToM - distOfficeToM) / distOfficeToM;
                    } else {
                        detour = distFToM; // Fallback
                    }

                    if (detour <= maxDetourPercent && detour < minDetour) {
                        minDetour = detour;
                        bestM = m;
                    }
                }
            }

            if (bestM) {
                const groupFemales = [fFar];
                assignedFemales.add(fFar.id);
                availableMales.delete(bestM.id);

                // Try to fill the vehicle
                // We can add (vehicleCapacity - 1) females total (1 Male is already there)
                while (groupFemales.length < vehicleCapacity - 1) {
                    let bestCand = null;
                    let minCandDist = Infinity;
                    
                    for (const fCand of matchableFemales) {
                        if (!assignedFemales.has(fCand.id)) {
                            // Use helper to validate
                            if (isGroupValid([...groupFemales, fCand, bestM])) {
                                // Valid candidate. Pick the one closest to the last added female?
                                // Or just the one that minimizes detour increase?
                                // Let's pick closest to the current group centroid or last female.
                                // Simple: Closest to fFar (the anchor of this group).
                                const d = distMatrix[fFar.original_idx][fCand.original_idx];
                                if (d < minCandDist) {
                                    minCandDist = d;
                                    bestCand = fCand;
                                }
                            }
                        }
                    }

                    if (bestCand) {
                        groupFemales.push(bestCand);
                        assignedFemales.add(bestCand.id);
                    } else {
                        break;
                    }
                }

                // Finalize Group
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

        // --- Step 4: Remaining Matchable Females (Fallback) ---
        // If any matchable females were left because their best male was taken
        const remainingFemales = matchableFemales.filter(f => !assignedFemales.has(f.id));
        // Add them to guarded groups
        if (remainingFemales.length > 0) {
             // Sort by distance (descending)
             remainingFemales.sort((a, b) => b.dist_from_office - a.dist_from_office);
             const assignedRemaining = new Set();

             for (const f of remainingFemales) {
                 if (assignedRemaining.has(f.id)) continue;

                 const group = [f];
                 assignedRemaining.add(f.id);

                 // Try to fill
                 for (const candidate of remainingFemales) {
                     if (assignedRemaining.has(candidate.id)) continue;
                     if (group.length >= vehicleCapacity - 1) break;

                     if (isGroupValid([...group, candidate])) {
                         group.push(candidate);
                         assignedRemaining.add(candidate.id);
                     }
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
                     id: `GuardedGroup_Fallback_${group[0].id}`,
                     type: 'guarded_group',
                     demand: group.length + 1,
                     components: group,
                     original_indices: group.map(c => c.original_idx),
                     internal_time: internalTime
                 };
                 processedNodes.push(gNode);
                 nodeMapping[currentIdx] = gNode;
                 currentIdx++;
             }
        }

        // --- Step 5: Remaining Males ---
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

        // --- Logging Grouping Details ---
        console.log("\n--- Initial Grouping Details ---");
        const groupingLog = [];
        
        for (const node of processedNodes) {
            if (node.type === 'group' || node.type === 'guarded_group') {
                // Assume route: Office -> Comp1 -> Comp2 -> ... -> CompN
                // Note: This is an ESTIMATE based on the grouping order (sorted by distance).
                // The actual solver might reorder them.
                let currentIdx = 0; // Office
                let routeDist = 0;
                
                for (let i = 0; i < node.components.length; i++) {
                    const comp = node.components[i];
                    const compIdx = comp.original_idx;
                    
                    // Add leg distance
                    routeDist += distMatrix[currentIdx][compIdx];
                    
                    // Direct Distance
                    const directDist = distMatrix[0][compIdx];
                    
                    // Deviation
                    let deviation = 0;
                    if (directDist > 0) {
                        deviation = ((routeDist - directDist) / directDist) * 100;
                    }
                    
                    groupingLog.push({
                        Group: node.id,
                        Type: node.type,
                        Employee: comp.id,
                        Gender: comp.gender,
                        Direct_Km: parseFloat((directDist / 1000).toFixed(2)),
                        Est_Route_Km: parseFloat((routeDist / 1000).toFixed(2)),
                        Deviation_Percent: parseFloat(deviation.toFixed(2))
                    });
                    
                    currentIdx = compIdx;
                }
            }
        }
        
        if (groupingLog.length > 0) {
            console.table(groupingLog);
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

module.exports = {
    RathamPreprocessor
};
