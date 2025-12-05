const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function testServer() {
    try {
        console.log('Reading payload from generateRoutePayload.json...');
        const payloadPath = path.join(__dirname, 'generateRoutePayload.json');
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

        console.log('Sending request to http://localhost:3000/optimise...');
        const response = await axios.post('http://localhost:3000/optimise', payload);

        console.log('Response received!');
        console.log('Status:', response.status);
        
        const output = response.data;
        console.log('Response keys:', Object.keys(output));
        
        // Verify structure
        if (output.routes && output.summary && output.metadata) {
            console.log('✅ Response structure looks correct.');
            console.log(`Generated ${output.routes.length} routes.`);
            console.log(`Total cost: ${output.summary.total_cost}`);
        } else {
            console.error('❌ Response structure is missing required keys.');
            return;
        }

        // --- Escort Capacity Sanity Check ---
        console.log('\nRunning Escort Capacity Sanity Check...');
        const maxCapacity = payload.config.max_cab_capacity;
        const escortRequiredGlobal = payload.config.escort_required;
        let violations = 0;

        output.routes.forEach(route => {
            if (escortRequiredGlobal && route.requires_escort) {
                // +1 for the escort
                const totalOccupants = route.employee_details.length + 1;
                if (totalOccupants > maxCapacity) {
                    console.error(`❌ Violation in Cab #${route.cab_number}: ${route.employee_details.length} employees + 1 escort = ${totalOccupants} > Max Capacity (${maxCapacity})`);
                    violations++;
                }
            }
        });

        if (violations === 0) {
            console.log('✅ Escort capacity sanity check passed. All escorted trips fit within capacity.');
        } else {
            console.error(`❌ Escort capacity sanity check failed. Found ${violations} violations.`);
        }
        // ------------------------------------

        // Save response for inspection
        fs.writeFileSync('test_response.json', JSON.stringify(output, null, 2));
        console.log('Saved response to test_response.json');

    } catch (error) {
        console.error('Error testing server:', error.message);
        if (error.response) {
            console.error('Server response:', error.response.data);
        }
    }
}

testServer();
