const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'microsoft-hyd-bnglr.employeeinfos.json');
const targetLat = 12.97865194914692;
const targetLon = 77.65806479231671;
const thresholdKm = 50;

function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Earth radius in km

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

try {
    console.log(`Reading file: ${inputFile}`);
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const employees = JSON.parse(rawData);
    console.log(`Total employees found: ${employees.length}`);

    const longDistanceEmployees = employees.filter(emp => {
        if (!emp.address || !emp.address.latitude || !emp.address.longitude) {
            return false;
        }
        const empLat = parseFloat(emp.address.latitude);
        const empLon = parseFloat(emp.address.longitude);
        
        if (isNaN(empLat) || isNaN(empLon)) return false;

        const dist = haversineDistance(empLat, empLon, targetLat, targetLon);
        emp.distanceFromTarget = dist; // Attach distance for output
        return dist > thresholdKm;
    });

    console.log(`Found ${longDistanceEmployees.length} employees more than ${thresholdKm}km away:`);
    longDistanceEmployees.forEach(emp => {
        console.log(`ID: ${emp.employeeId || 'N/A'}, Name: ${emp.employeeName || 'N/A'}, Distance: ${emp.distanceFromTarget.toFixed(2)} km, Lat: ${emp.address.latitude}, Lon: ${emp.address.longitude}`);
    });

} catch (err) {
    console.error("Error processing file:", err);
}
