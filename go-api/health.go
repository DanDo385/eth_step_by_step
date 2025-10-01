// health.go
// Health check endpoints and monitoring for all data sources
package main

import (
	"net/http"
	"time"
)

// HealthStatus represents the health status of a data source
type HealthStatus struct {
	Name        string    `json:"name"`
	Healthy     bool      `json:"healthy"`
	LastSuccess time.Time `json:"lastSuccess,omitempty"`
	LastError   string    `json:"lastError,omitempty"`
	Uptime      string    `json:"uptime,omitempty"`
}

// OverallHealth represents the health status of all data sources
type OverallHealth struct {
	Status      string         `json:"status"` // "healthy", "degraded", "unhealthy"
	Timestamp   time.Time      `json:"timestamp"`
	DataSources []HealthStatus `json:"dataSources"`
	Summary     struct {
		Total     int `json:"total"`
		Healthy   int `json:"healthy"`
		Unhealthy int `json:"unhealthy"`
	} `json:"summary"`
}

// Global data source instances for health monitoring
var (
	beaconHealth  *BaseDataSource
	relayHealth   *BaseDataSource
	rpcHealth     *BaseDataSource
	mempoolHealth *BaseDataSource
)

// initHealthSources initializes health monitoring for all data sources
func initHealthSources() {
	beaconHealth = NewBaseDataSource("beacon", "beacon_health", 30*time.Second)
	relayHealth = NewBaseDataSource("relay", "relay_health", 30*time.Second)
	rpcHealth = NewBaseDataSource("rpc", "rpc_health", 30*time.Second)
	mempoolHealth = NewBaseDataSource("mempool", "mempool_health", 30*time.Second)
}

// checkBeaconHealth verifies beacon chain connectivity
func checkBeaconHealth() HealthStatus {
	_, status, err := beaconGET("/eth/v1/beacon/headers?limit=1")
	beaconHealth.SetError(err)
	if err == nil && status/100 == 2 {
		beaconHealth.SetSuccess()
	}

	return HealthStatus{
		Name:        beaconHealth.GetName(),
		Healthy:     beaconHealth.IsHealthy(),
		LastSuccess: beaconHealth.GetLastSuccess(),
		LastError:   getErrorString(beaconHealth.GetLastError()),
	}
}

// checkRelayHealth verifies MEV relay connectivity
func checkRelayHealth() HealthStatus {
	_, err := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=1")
	relayHealth.SetError(err)
	if err == nil {
		relayHealth.SetSuccess()
	}

	return HealthStatus{
		Name:        relayHealth.GetName(),
		Healthy:     relayHealth.IsHealthy(),
		LastSuccess: relayHealth.GetLastSuccess(),
		LastError:   getErrorString(relayHealth.GetLastError()),
	}
}

// checkRPCHealth verifies execution layer RPC connectivity
func checkRPCHealth() HealthStatus {
	_, err := rpcCall("eth_blockNumber", []any{})
	rpcHealth.SetError(err)
	if err == nil {
		rpcHealth.SetSuccess()
	}

	return HealthStatus{
		Name:        rpcHealth.GetName(),
		Healthy:     rpcHealth.IsHealthy(),
		LastSuccess: rpcHealth.GetLastSuccess(),
		LastError:   getErrorString(rpcHealth.GetLastError()),
	}
}

// checkMempoolHealth verifies mempool monitoring status
func checkMempoolHealth() HealthStatus {
	// Mempool health is based on whether we're successfully polling
	// We'll check if we have recent data
	data := GetMempoolData()
	healthy := data.Count > 0 || data.Source == "ws-disabled"

	if healthy {
		mempoolHealth.SetSuccess()
	} else {
		mempoolHealth.SetError(nil) // No specific error, just no data
	}

	return HealthStatus{
		Name:        mempoolHealth.GetName(),
		Healthy:     healthy,
		LastSuccess: mempoolHealth.GetLastSuccess(),
		LastError:   getErrorString(mempoolHealth.GetLastError()),
	}
}

// getErrorString safely converts error to string
func getErrorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// handleHealth returns the health status of all data sources
func handleHealth(w http.ResponseWriter, r *http.Request) {
	// Check all data sources
	beaconStatus := checkBeaconHealth()
	relayStatus := checkRelayHealth()
	rpcStatus := checkRPCHealth()
	mempoolStatus := checkMempoolHealth()

	dataSources := []HealthStatus{
		beaconStatus,
		relayStatus,
		rpcStatus,
		mempoolStatus,
	}

	// Calculate overall status
	healthyCount := 0
	for _, ds := range dataSources {
		if ds.Healthy {
			healthyCount++
		}
	}

	totalCount := len(dataSources)
	var overallStatus string
	switch {
	case healthyCount == totalCount:
		overallStatus = "healthy"
	case healthyCount > 0:
		overallStatus = "degraded"
	default:
		overallStatus = "unhealthy"
	}

	health := OverallHealth{
		Status:      overallStatus,
		Timestamp:   time.Now(),
		DataSources: dataSources,
	}

	health.Summary.Total = totalCount
	health.Summary.Healthy = healthyCount
	health.Summary.Unhealthy = totalCount - healthyCount

	writeOK(w, health)
}

// handleHealthLiveness returns a simple liveness check (for Kubernetes, etc.)
func handleHealthLiveness(w http.ResponseWriter, r *http.Request) {
	// Simple liveness check - just verify the server is responding
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// handleHealthReadiness returns a readiness check (for Kubernetes, etc.)
func handleHealthReadiness(w http.ResponseWriter, r *http.Request) {
	// Readiness check - verify critical data sources are healthy
	beaconStatus := checkBeaconHealth()
	rpcStatus := checkRPCHealth()

	// Consider ready if at least beacon and RPC are healthy
	if beaconStatus.Healthy && rpcStatus.Healthy {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("READY"))
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("NOT_READY"))
	}
}
