const express = require('express');
const cors = require('cors');
const { solveRoute } = require('./solver_service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post('/optimise', async (req, res) => {
    try {
        const payload = req.body;
        
        // Basic validation
        if (!payload || !payload.employees || !payload.config) {
            return res.status(400).json({ 
                error: 'Invalid payload. Must contain employees and config.' 
            });
        }

        console.log(`Received optimization request for ${payload.employees.length} employees.`);
        
        const result = await solveRoute(payload);
        
        res.json(result);
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message 
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
