package runner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"josemorinho/backend/internal/api"
)

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

func New(base string) *Client {
	return &Client{
		BaseURL: base,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *Client) Evaluate(req api.RunRequest) (*api.RunResponse, error) {
	body, err := json.Marshal(api.RunnerEvaluateRequest{
		ProblemID: req.ProblemID,
		Language:  req.Language,
		Code:      req.Code,
	})
	if err != nil {
		return nil, err
	}
	r, err := c.HTTPClient.Post(c.BaseURL+"/evaluate", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		return nil, fmt.Errorf("runner status %d", r.StatusCode)
	}
	var out api.RunResponse
	if err := json.NewDecoder(r.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}
