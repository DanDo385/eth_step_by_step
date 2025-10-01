// data_source.go
// Common interface for all data sources to provide consistency and health monitoring
package main

import (
	"time"
)

// DataSource defines the common interface for all external data sources
type DataSource interface {
	// GetName returns a human-readable name for this data source
	GetName() string

	// IsHealthy checks if the data source is currently available and responding
	IsHealthy() bool

	// GetLastError returns the last error encountered, if any
	GetLastError() error

	// GetLastSuccess returns the timestamp of the last successful operation
	GetLastSuccess() time.Time

	// GetCacheKey returns a unique key for caching this data source's responses
	GetCacheKey() string

	// GetTTL returns the recommended cache TTL for this data source
	GetTTL() time.Duration
}

// BaseDataSource provides common functionality for data sources
type BaseDataSource struct {
	name        string
	lastError   error
	lastSuccess time.Time
	cacheKey    string
	ttl         time.Duration
}

// NewBaseDataSource creates a new base data source with common fields
func NewBaseDataSource(name, cacheKey string, ttl time.Duration) *BaseDataSource {
	return &BaseDataSource{
		name:     name,
		cacheKey: cacheKey,
		ttl:      ttl,
	}
}

func (b *BaseDataSource) GetName() string {
	return b.name
}

func (b *BaseDataSource) GetLastError() error {
	return b.lastError
}

func (b *BaseDataSource) GetLastSuccess() time.Time {
	return b.lastSuccess
}

func (b *BaseDataSource) GetCacheKey() string {
	return b.cacheKey
}

func (b *BaseDataSource) GetTTL() time.Duration {
	return b.ttl
}

// SetError updates the last error and clears success timestamp
func (b *BaseDataSource) SetError(err error) {
	b.lastError = err
	b.lastSuccess = time.Time{} // Clear success timestamp on error
}

// SetSuccess updates the last success timestamp and clears error
func (b *BaseDataSource) SetSuccess() {
	b.lastSuccess = time.Now()
	b.lastError = nil
}

// IsHealthy checks if the data source is healthy based on recent success
func (b *BaseDataSource) IsHealthy() bool {
	// Consider healthy if we've had success in the last 5 minutes
	// or if we've never had an error
	if b.lastSuccess.IsZero() && b.lastError == nil {
		return true // No attempts yet, assume healthy
	}
	return time.Since(b.lastSuccess) < 5*time.Minute
}
