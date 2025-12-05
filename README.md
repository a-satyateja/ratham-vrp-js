# Ratham VRP Solver - JavaScript Implementation

This is a JavaScript port of the Ratham VRP (Vehicle Routing Problem) solver, originally implemented in Python.

## Overview

The Ratham VRP solver handles employee transportation with special escort constraints:
- **Escort Constraint**: Female employees must be dropped off before male employees OR be accompanied by a security guard
- **Vehicle Capacity**: 4 passengers per vehicle
- **Max Detour Time**: 2 hours (7200 seconds) from office to drop-off
- **Service Time**: 2 minutes per stop

## Architecture

### Components

1. **OSRMClient**: Fetches real-world distance and time matrices from OSRM API
2. **RathamPreprocessor**: Implements "Farthest Female First" grouping logic
   - Pairs females with closest available males
   - Batches additional females into groups (up to capacity 4)
   - Creates "Guarded Groups" for unpaired females (adds +1 demand for guard)
3. **CuOptServerClient**: Communicates with NVIDIA cuOpt Server API
   - Submits optimization requests
   - Polls for async results
   - Retrieves optimized routes
4. **solveVrp**: Constructs JSON payload and orchestrates the optimization

### Files

- `ratham_vrp_solver.js`: Core solver logic (OSRMClient, CuOptServerClient, RathamPreprocessor, solveVrp)
- `run_real_data.js`: Demo script with ~60 real employee locations
- `package.json`: Node.js dependencies

## Installation

```bash
npm install
```

Dependencies:
- `axios`: HTTP client for API requests

## Usage

```bash
node run_real_data.js
```

### Expected Output

```
=== Ratham VRP: Real Data Run (JavaScript) ===

Total Locations: 67
Fetching Matrix from OSRM...
Matrix Shape: 67 x 67

Running Pre-processor (Farthest Female First)...

Generated 29 Routing Nodes:
  [GROUP] Group_RR071: [RR013, RR071] (Demand: 2)
  [GROUP] Group_RR020: [RR156, RR020] (Demand: 2)
  ...

Summary: 25 Groups (with Male), 0 Guarded Groups, 3 Single Males

Attempting to solve with cuOpt Server...
Sending request to cuOpt Server...
Request queued with ID: dba9c653-e146-4e9c-a0de-518db4533792. Polling...

✅ Solution Found!
Total Cost: 476401.2022705078
Vehicles Used: 18
  Veh_0: OFFICE -> Group_RR121 -> OFFICE
  Veh_1: OFFICE -> Group_RR124 -> OFFICE
  ...
```

## API Endpoints

- **OSRM**: `http://35.244.42.110:5000`
- **cuOpt Server**: `https://cuopt-259264810953.asia-southeast1.run.app`

### cuOpt Server Endpoints Used

1. `POST /cuopt/request` - Submit optimization problem
2. `GET /cuopt/request/{id}` - Check status
3. `GET /cuopt/solution/{id}` - Retrieve solution

## Comparison with Python Version

The JavaScript implementation produces **identical results** to the Python version:
- Same grouping logic and node generation
- Same total cost: **476,401.2**
- Same number of vehicles: **18**
- Same route structure

### Key Differences

1. **Language**: JavaScript (Node.js) vs Python
2. **HTTP Library**: `axios` vs `requests`
3. **Array Handling**: Native JavaScript arrays vs NumPy arrays
4. **Async/Await**: Native in both, but slightly different syntax

## Algorithm: Farthest Female First

1. **Sort** females by distance from office (descending)
2. For each female (farthest first):
   - Find **closest available male**
   - Create a **group** with this female + male
   - **Batch** additional nearby females into the group (up to capacity 4)
3. For **remaining unpaired females**:
   - Create **Guarded Groups** (demand = females + 1 for guard)
4. Add **remaining single males** as individual nodes

## Data Format

### Employee Input
```javascript
{
  "id": "RR128",
  "gender": "Female", // or "Male"
  "lat": 13.056822,
  "lon": 77.605691
}
```

### Processed Node Output
```javascript
{
  "id": "Group_RR071",
  "type": "group", // or "guarded_group", "male", "office"
  "demand": 2,
  "components": [/* employee objects */],
  "original_indices": [1, 34],
  "internal_time": 1234.5 // seconds
}
```

## Web Visualization

A web-based visualization is available to view the optimized routes on a map.

### Running the Application

You need to run both the backend and frontend servers.

1. **Start the Backend (Optimization Server)**:
   ```bash
   node server.js
   ```
   Runs on `http://localhost:3000`.

2. **Start the Frontend (Map Visualization)**:
   ```bash
   node map_server.js
   ```
   Runs on `http://localhost:3005`.

Then open [http://localhost:3005](http://localhost:3005) in your browser.

### Features
- Interactive map with route visualization
- Color-coded groups
- Side menu to toggle group visibility
- "Load & Optimize" button to trigger the solver

## License

Same as parent project.
