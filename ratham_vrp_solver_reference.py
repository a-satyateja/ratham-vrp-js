import requests
import numpy as np
import pandas as pd
import json
import time
from typing import List, Dict, Tuple, Any
import math

class OSRMClient:
    def __init__(self, base_url: str = "http://35.244.42.110:5000"):
        self.base_url = base_url

    def get_distance_matrix(self, locations: List[Tuple[float, float]]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Fetches the distance and duration matrices from OSRM.
        """
        # OSRM URL length limit might be an issue for large N.
        # But ~60 nodes should be fine.
        coords = ";".join([f"{lon},{lat}" for lat, lon in locations])
        url = f"{self.base_url}/table/v1/driving/{coords}?annotations=distance,duration"
        
        try:
            response = requests.get(url)
            response.raise_for_status()
            data = response.json()
            
            distances = np.array(data["distances"], dtype=np.float32)
            durations = np.array(data["durations"], dtype=np.float32)
            
            return distances, durations
        except Exception as e:
            print(f"Error fetching from OSRM: {e}")
            # Fallback for testing/offline: Euclidean distance
            n = len(locations)
            dist = np.zeros((n, n), dtype=np.float32)
            time_mat = np.zeros((n, n), dtype=np.float32)
            for i in range(n):
                for j in range(n):
                    d = np.sqrt((locations[i][0]-locations[j][0])**2 + (locations[i][1]-locations[j][1])**2) * 111000
                    dist[i, j] = d
                    time_mat[i, j] = d / 10.0 # Approx 10m/s
            return dist, time_mat

class CuOptServerClient:
    def __init__(self, base_url: str = "https://cuopt-259264810953.asia-southeast1.run.app"):
        self.base_url = base_url
        self.optimize_url = f"{self.base_url}/cuopt/request"
        self.health_url = f"{self.base_url}/cuopt/health"

    def check_health(self) -> bool:
        try:
            response = requests.get(self.health_url, timeout=5)
            return response.status_code == 200
        except:
            return False

    def get_optimized_routes(self, problem_data: Dict[str, Any]) -> Dict[str, Any]:
        headers = {'Content-Type': 'application/json'}
        # The server might return a request ID if it takes long (async), or result directly.
        # Based on docs, it returns a request ID if busy/long.
        
        try:
            response = requests.post(self.optimize_url, json=problem_data, headers=headers, timeout=60)
            response.raise_for_status()
            result = response.json()
            
            # Check if async
            if "reqId" in result and "response" not in result:
                print(f"Async Response Received: {json.dumps(result, indent=2)}")
                req_id = result["reqId"]
                print(f"Request queued with ID: {req_id}. Polling...")
                return self.poll_result(req_id)
            
            return result
        except Exception as e:
            print(f"Error calling cuOpt Server: {e}")
            if 'response' in locals():
                print(f"Response Text: {response.text}")
            return {"status": -1, "error": str(e)}

    def poll_result(self, req_id: str, retries: int = 60) -> Dict[str, Any]:
        status_url = f"{self.base_url}/cuopt/request/{req_id}"
        solution_url = f"{self.base_url}/cuopt/solution/{req_id}"
        headers = {"Accept": "application/json"}
        
        for _ in range(retries):
            time.sleep(1)
            try:
                # Check Status
                response = requests.get(status_url, headers=headers)
                if response.status_code == 200:
                    try:
                        status_data = response.json()
                    except json.JSONDecodeError:
                        # Might be MsgPack or raw string
                        status_data = response.text.strip('"')
                        
                    # Status might be a string "completed" or a dict
                    if status_data == "completed" or (isinstance(status_data, dict) and status_data.get("status") == "completed"):
                        # Fetch Solution
                        sol_resp = requests.get(solution_url, headers=headers)
                        sol_resp.raise_for_status()
                        return sol_resp.json()
                    elif isinstance(status_data, dict) and status_data.get("status") == "failed":
                         return {"status": -1, "error": "Solver failed"}
            except Exception as e:
                print(f"Polling error: {e}")
                pass
        return {"status": -1, "error": "Polling timed out"}

class RathamPreprocessor:
    def __init__(self, guard_cost: float = 50000.0):
        self.guard_cost = guard_cost

    def process_escorts(self, 
                       employees: List[Dict[str, Any]], 
                       office_loc: Tuple[float, float],
                       dist_matrix: np.ndarray,
                       time_matrix: np.ndarray) -> Dict[str, Any]:
        """
        Pre-processes employees to handle escort constraints using Farthest Female First logic.
        """
        # Separate by gender
        males = [e for e in employees if e['gender'] == 'M']
        females = [e for e in employees if e['gender'] == 'F']
        
        # Sort females by distance from office (descending)
        for f in females:
            f['dist_from_office'] = dist_matrix[0, f['original_idx']]
        females.sort(key=lambda x: x['dist_from_office'], reverse=True)
        
        available_males = set(m['id'] for m in males)
        assigned_females = set()
        
        processed_nodes = []
        node_mapping = {} 
        
        # Add Office (Node 0)
        processed_nodes.append({
            'id': 'OFFICE',
            'type': 'office',
            'demand': 0,
            'original_indices': [0]
        })
        current_idx = 1
        
        # --- Farthest Female First Grouping ---
        for f_far in females:
            if f_far['id'] in assigned_females:
                continue
                
            # Try to find a Male for this female
            best_m = None
            min_detour = float('inf')
            f_idx = f_far['original_idx']
            
            for m in males:
                if m['id'] in available_males:
                    m_idx = m['original_idx']
                    d = dist_matrix[f_idx, m_idx]
                    if d < min_detour:
                        min_detour = d
                        best_m = m
            
            if best_m:
                group_females = [f_far]
                assigned_females.add(f_far['id'])
                available_males.remove(best_m['id'])
                
                # Batching
                while len(group_females) + 1 < 4: 
                    best_cand = None
                    min_cand_dist = float('inf')
                    for f_cand in females:
                        if f_cand['id'] not in assigned_females:
                            cand_idx = f_cand['original_idx']
                            d = dist_matrix[f_idx, cand_idx]
                            if d < min_cand_dist:
                                min_cand_dist = d
                                best_cand = f_cand
                    
                    if best_cand and min_cand_dist < 3000: 
                        group_females.append(best_cand)
                        assigned_females.add(best_cand['id'])
                    else:
                        break
                
                group_females.sort(key=lambda x: x['dist_from_office'])
                components = group_females + [best_m]
                
                internal_time = 0
                for k in range(len(components) - 1):
                    c1 = components[k]
                    c2 = components[k+1]
                    t = time_matrix[c1['original_idx'], c2['original_idx']]
                    internal_time += c1.get('service_time', 0) + t
                
                p_node = {
                    'id': f"Group_{best_m['id']}",
                    'type': 'group',
                    'demand': len(components),
                    'components': components,
                    'original_indices': [c['original_idx'] for c in components],
                    'internal_time': internal_time
                }
                processed_nodes.append(p_node)
                node_mapping[current_idx] = p_node
                current_idx += 1
            else:
                pass
                
        # --- Remaining Females ---
        remaining_females = [f for f in females if f['id'] not in assigned_females]
        remaining_females.sort(key=lambda x: x['dist_from_office'], reverse=True)
        
        while remaining_females:
            group = [remaining_females.pop(0)]
            while remaining_females and len(group) + 1 <= 4:
                 group.append(remaining_females.pop(0))
            
            group.sort(key=lambda x: x['dist_from_office'])
            internal_time = 0
            for k in range(len(group) - 1):
                c1 = group[k]
                c2 = group[k+1]
                t = time_matrix[c1['original_idx'], c2['original_idx']]
                internal_time += c1.get('service_time', 0) + t
            
            g_node = {
                'id': f"GuardedGroup_{group[0]['id']}",
                'type': 'guarded_group',
                'demand': len(group) + 1, # Females + 1 Guard
                'components': group,
                'original_indices': [c['original_idx'] for c in group],
                'internal_time': internal_time
            }
            processed_nodes.append(g_node)
            node_mapping[current_idx] = g_node
            current_idx += 1

        # Add Remaining Males
        for m in males:
            if m['id'] in available_males:
                m_node = {
                    'id': f"Male_{m['id']}",
                    'type': 'male',
                    'demand': 1,
                    'components': [m],
                    'original_indices': [m['original_idx']]
                }
                processed_nodes.append(m_node)
                node_mapping[current_idx] = m_node
                current_idx += 1
                
        # Rebuild Matrices
        n_new = len(processed_nodes)
        new_dist = np.zeros((n_new, n_new), dtype=np.float32)
        new_time = np.zeros((n_new, n_new), dtype=np.float32)
        
        for i in range(n_new):
            for j in range(n_new):
                if i == j: continue
                node_i = processed_nodes[i]
                node_j = processed_nodes[j]
                idx_from = node_i['original_indices'][-1]
                idx_to = node_j['original_indices'][0]
                new_dist[i, j] = dist_matrix[idx_from, idx_to]
                new_time[i, j] = time_matrix[idx_from, idx_to]
                
        # Calculate Service Times
        service_times = np.zeros(n_new, dtype=np.float32)
        for i in range(n_new):
            node = processed_nodes[i]
            if node['type'] in ['group', 'guarded_group', 'pair']:
                last_comp = node['components'][-1]
                service_times[i] = node['internal_time'] + last_comp.get('service_time', 0)
            elif node['type'] == 'office':
                service_times[i] = 0
            else:
                service_times[i] = node['components'][0].get('service_time', 0)
                
        return {
            'nodes': processed_nodes,
            'dist_matrix': new_dist,
            'time_matrix': new_time,
            'service_times': service_times,
            'node_mapping': node_mapping
        }

def solve_vrp(processed_data: Dict[str, Any], 
              n_vehicles: int, 
              vehicle_capacity: int,
              max_detour_time: float):
    """
    Solves the VRP using cuOpt Server API.
    """
    nodes = processed_data['nodes']
    dist_matrix = processed_data['dist_matrix']
    time_matrix = processed_data['time_matrix']
    service_times = processed_data['service_times']
    
    n_locations = len(nodes)
    
    # Prepare Time Windows
    time_windows = []
    for i, node in enumerate(nodes):
        limit = float(max_detour_time)
        if node['type'] in ['pair', 'group', 'guarded_group']:
            internal_time = float(node.get('internal_time', 0))
            limit = max(0.0, limit - internal_time)
        
        if node['type'] == 'office':
            time_windows.append([0, 86400]) # 24 hours
        else:
            time_windows.append([0, int(limit)])
            
    # Construct JSON Payload
    # We use Vehicle Type 0 for all vehicles
    
    payload = {
        "cost_matrix_data": {
            "data": {
                "0": dist_matrix.tolist()
            }
        },
        "travel_time_matrix_data": {
            "data": {
                "0": time_matrix.tolist()
            }
        },
        "fleet_data": {
            "vehicle_locations": [[0, 0]] * n_vehicles, # Start/End at Node 0 (Office)
            "vehicle_ids": [f"Veh_{i}" for i in range(n_vehicles)],
            "vehicle_types": [0] * n_vehicles,
            "capacities": [[vehicle_capacity] * n_vehicles],
            # Vehicle availability: 0 to 24 hours (or max detour constraint is enough on nodes)
            "vehicle_time_windows": [[0, 86400] for _ in range(n_vehicles)]
        },
        "task_data": {
            "task_locations": list(range(n_locations)),
            "demand": [[n['demand'] for n in nodes]],
            "task_time_windows": time_windows,
            "service_times": [int(t) for t in service_times]
        },
        "solver_config": {
            "time_limit": 5,
            "objectives": {
                "cost": 1, # Minimize Distance
                # "travel_time": 0 # Don't minimize time, just constrain it? Or minimize both?
                # Default is usually cost.
            }
        }
    }
    
    # Call Server
    client = CuOptServerClient()
    print("Sending request to cuOpt Server...")
    result = client.get_optimized_routes(payload)
    
    return result, processed_data
