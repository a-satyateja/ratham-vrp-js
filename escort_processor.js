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

module.exports = {
    RathamPreprocessor
};
