// Package runner is the HTTP client for the Python execution service.
// All execution results are returned as-is; this package does not interpret correctness.
package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/httpx"
)

// Client calls runner-python's /evaluate endpoint.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// New creates a runner client. baseURL should have no trailing slash.
func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// Evaluate forwards code to the Python runner and returns its structured response unchanged.
func (c *Client) Evaluate(ctx context.Context, req dto.RunRequest) (*dto.RunResponse, error) {
	body, err := json.Marshal(dto.RunnerEvaluateRequest{
		ProblemID: req.ProblemID,
		Language:  req.Language,
		Code:      req.Code,
	})
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/evaluate", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, httpx.NewRunnerError("runner request: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, httpx.NewRunnerError("read runner body: %v", err)
	}

	if resp.StatusCode >= 400 {
		return nil, httpx.NewRunnerError("runner returned %d: %s", resp.StatusCode, truncate(string(respBody), 500))
	}

	var out dto.RunResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, httpx.NewRunnerError("decode runner json: %v", err)
	}
	return &out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "â€¦"
}
