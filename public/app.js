// Initialize map
const map = L.map('map').setView([12.9716, 77.5946], 12); // Default to Bangalore

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const groupLayers = {};
const colors = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF',
    '#33FFF5', '#FF8C33', '#8C33FF', '#FF3333', '#33FF8C',
    '#581845', '#900C3F', '#C70039', '#FFC300', '#DAF7A6'
];

document.getElementById('loadBtn').addEventListener('click', loadAndOptimize);

// Auto-load on start
loadAndOptimize();

async function loadAndOptimize() {
    const btn = document.getElementById('loadBtn');
    btn.disabled = true;
    btn.textContent = 'Optimizing...';

    try {
        // Use a default payload or fetch from a file if needed. 
        // For now, we'll use a hardcoded sample payload similar to what the server expects,
        // or fetch 'generateRoutePayload.json' if available via a static route (not currently served).
        // Let's try to fetch the payload from the server if we expose it, or just construct a dummy one.
        // Better yet, let's try to fetch a known test payload or just send a request if the server has a default.
        // The server expects a POST body.
        
        // We will fetch the local generateRoutePayload.json content if we can, but we can't read server files from client directly.
        // So I will embed a small sample payload here for testing, or fetch it if I serve it.
        // Since I didn't expose the JSON file, I'll use a hardcoded one based on the file I saw earlier.
        
        // Fetch the payload from the static file served by map_server
        const payloadResponse = await fetch('generateRoutePayload.json');
        if (!payloadResponse.ok) {
            throw new Error(`Failed to load payload: ${payloadResponse.statusText}`);
        }
        const payload = await payloadResponse.json();

        const response = await fetch('http://localhost:3000/optimise', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Optimization Result:", data);
        
        renderGroups(data.groups, payload.config.office);

    } catch (error) {
        console.error("Error:", error);
        alert("Failed to load/optimize: " + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Load & Optimize';
    }
}

function renderGroups(groups, officeLoc) {
    // Clear existing
    const list = document.getElementById('group-list');
    list.innerHTML = '';
    Object.values(groupLayers).forEach(layer => map.removeLayer(layer));
    
    // Add Office Marker
    L.marker(officeLoc).addTo(map).bindPopup("Office").openPopup();

    if (!groups || groups.length === 0) {
        list.innerHTML = '<p style="padding:10px">No groups found.</p>';
        return;
    }

    groups.forEach((group, index) => {
        const color = colors[index % colors.length];
        const groupId = group.id;
        
        // Create Layer Group
        const layerGroup = L.layerGroup();
        
        // 1. Collect points: Office -> Members (in order)
        // Note: The group components might be sorted by distance from office in the backend.
        // For visualization, we want to see the path.
        // If it's "login" (Pickup), path is: Member 1 -> Member 2 -> ... -> Office.
        // If it's "logout" (Drop), path is: Office -> Member 1 -> Member 2 ...
        // The backend logic seemed to assume Drop (Office -> F -> M).
        // Let's assume Drop order for drawing: Office -> Components.
        
        const points = [officeLoc];
        const latLngs = [officeLoc];
        
        group.components.forEach(member => {
            // Member location is not directly in the group object components?
            // Wait, `components` in `escort_processor.js` are employee objects.
            // But `formattedEmployees` had `location: [lat, lon]`.
            // Let's check if that was preserved.
            // `escort_processor.js` uses `employees` passed to it.
            // `solver_service.js` passes `formattedEmployees`.
            // So `member` should have `.location`.
            
            if (member.location) {
                points.push(member.location);
                latLngs.push(member.location);
                
                // Add Marker
                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color:${color};width:10px;height:10px;border-radius:50%;border:1px solid #fff;"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                
                L.marker(member.location, {icon: icon})
                    .bindPopup(`${member.id} (${member.gender})`)
                    .addTo(layerGroup);
            }
        });

        // Draw Polyline
        const polyline = L.polyline(latLngs, {color: color, weight: 4, opacity: 0.7}).addTo(layerGroup);
        
        // Store layer
        groupLayers[groupId] = layerGroup;
        layerGroup.addTo(map); // Show by default

        // Add to Sidebar
        const item = document.createElement('div');
        item.className = 'group-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'group-checkbox';
        checkbox.checked = true;
        checkbox.onchange = (e) => {
            if (e.target.checked) {
                map.addLayer(layerGroup);
            } else {
                map.removeLayer(layerGroup);
            }
        };

        const label = document.createElement('span');
        label.className = 'group-label';
        label.innerHTML = `<span class="color-indicator" style="background-color:${color}"></span> ${groupId}`;
        
        item.appendChild(checkbox);
        item.appendChild(label);
        list.appendChild(item);
    });
    
    // Fit bounds
    const group = new L.featureGroup(Object.values(groupLayers));
    if (group.getLayers().length > 0) {
        map.fitBounds(group.getBounds(), {padding: [50, 50]});
    }
}
