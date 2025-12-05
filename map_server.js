const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3005;

app.use(cors());
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`Map Visualization Server running on http://localhost:${PORT}`);
});
